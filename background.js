// Breathe — background service worker (Manifest V3, module)
//
// Primair draait de animatie in een offscreen document (blijft actief, rAF).
// FALLBACK: als er binnen FALLBACK_DELAY_MS geen frames van het offscreen
// document binnenkomen, draait deze SW zelf een animatielus met OffscreenCanvas.
// Alarms: keepalive (SW wekken), water-reminder, adem-reminder.
// State (pauze/water/reminder/instellingen) staat in chrome.storage.local en
// wordt naar het offscreen document gebroadcast via berichten.
import { DEFAULT_SETTINGS, cycleFromSettings } from './cycle.js';
import { renderImageData, titleFor } from './icon-renderer.js';

const OFFSCREEN_URL = 'offscreen.html';
const FALLBACK_DELAY_MS = 3000;
const FALLBACK_TICK_MS = 50;
const REMIND_DURATION_MS = 60000; // adem-reminder zichtbaar gedurende 1 minuut

let settings = { ...DEFAULT_SETTINGS };
let paused = false;
let waterDue = false;
let remind = false;
let gotFrame = false;
let swLoopTimer = null;
let cycleCache = null;

// --- helpers ---
function getCycle() {
  if (!cycleCache) cycleCache = cycleFromSettings(settings);
  return cycleCache;
}
function currentState() {
  return { paused, waterDue, remind, settings, cycle: getCycle() };
}
function broadcastState() {
  chrome.runtime.sendMessage({ type: 'state', paused, waterDue, remind, settings }).catch?.(() => {});
}

// --- state laden + wijzigingen volgen ---
chrome.storage.local.get(['settings', 'paused', 'waterDue', 'remind']).then((v) => {
  if (v.settings) settings = { ...DEFAULT_SETTINGS, ...v.settings };
  paused = !!v.paused;
  waterDue = !!v.waterDue;
  remind = !!v.remind;
  cycleCache = null;
  syncAlarms();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let dirty = false;
  if (changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    cycleCache = null;
    dirty = true;
    syncAlarms();
  }
  if (changes.paused) {
    paused = !!changes.paused.newValue;
    dirty = true;
  }
  if (changes.waterDue) {
    waterDue = !!changes.waterDue.newValue;
    dirty = true;
  }
  if (changes.remind) {
    remind = !!changes.remind.newValue;
    dirty = true;
  }
  if (dirty) broadcastState();
});

// --- alarms ---
function syncAlarms() {
  chrome.alarms.clear('breathe-water');
  if (settings.waterReminderMin > 0) {
    chrome.alarms.create('breathe-water', { periodInMinutes: settings.waterReminderMin });
  }
  chrome.alarms.clear('breathe-remind');
  if (settings.breatheReminderMin > 0) {
    chrome.alarms.create('breathe-remind', { periodInMinutes: settings.breatheReminderMin });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'breathe-keepalive') {
    ensureOffscreen();
    if (!gotFrame && !swLoopTimer) startSwLoop();
  } else if (alarm.name === 'breathe-water') {
    chrome.storage.local.set({ waterDue: true });
  } else if (alarm.name === 'breathe-remind') {
    chrome.storage.local.set({ remind: true });
    chrome.alarms.create('breathe-remind-off', { when: Date.now() + REMIND_DURATION_MS });
  } else if (alarm.name === 'breathe-remind-off') {
    chrome.storage.local.set({ remind: false });
  }
});

// --- offscreen document beheren ---
async function ensureOffscreen() {
  try {
    if (typeof chrome.offscreen?.hasDocument === 'function') {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
    }
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas-animatie (rAF) voor het geanimeerde Breathe toolbar-icoon.',
    });
    console.log('[Breathe] offscreen document aangemaakt');
  } catch (e) {
    console.error('[Breathe] offscreen document niet beschikbaar:', e?.message || e);
  }
}

// --- fallback: eigen animatielus in de SW (voor als offscreen niet werkt) ---
function startSwLoop() {
  if (swLoopTimer) return;
  console.log('[Breathe] SW-fallback-animatie gestart (geen offscreen frames)');
  const tick = () => {
    if (!swLoopTimer) return;
    try {
      const cycle = getCycle();
      const { phase, progress } = cycle.phaseAt(performance.now());
      const st = { ...currentState(), phase, progress };
      chrome.action.setIcon({ imageData: renderImageData(st) }).catch?.(() => {});
      chrome.action.setTitle({ title: titleFor(st) }).catch?.(() => {});
    } catch (e) {
      console.error('[Breathe] SW-lus fout:', e);
    }
    swLoopTimer = setTimeout(tick, FALLBACK_TICK_MS);
  };
  swLoopTimer = setTimeout(tick, 0);
}

function stopSwLoop() {
  if (swLoopTimer) {
    clearTimeout(swLoopTimer);
    swLoopTimer = null;
  }
}

function armFallback() {
  setTimeout(() => {
    if (!gotFrame) startSwLoop();
  }, FALLBACK_DELAY_MS);
}

// --- berichten ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'frame') {
    gotFrame = true;
    stopSwLoop(); // offscreen werkt — fallback uitzetten
    try {
      chrome.action.setIcon({ imageData: msg.imageData });
    } catch (e) {
      console.error('[Breathe] setIcon mislukt:', e);
    }
    const st = { ...currentState(), phase: msg.phase, progress: msg.progress };
    chrome.action.setTitle({ title: titleFor(st) }).catch?.(() => {});
  } else if (msg?.type === 'getState') {
    sendResponse({ paused, waterDue, remind, settings });
  } else if (msg?.type === 'togglePause') {
    togglePause();
  } else if (msg?.type === 'waterDrunk') {
    chrome.storage.local.set({ waterDue: false });
  } else if (msg?.type === 'debug') {
    console.log('[Breathe]', msg.msg);
  }
});

// --- levenscyclus ---
chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
  armFallback();
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
  armFallback();
});

// keepalive: wekt de SW periodiek en herstelt de fallback-lus na slaap
chrome.alarms.create('breathe-keepalive', { periodInMinutes: 0.5 });

// klik op het toolbar-icoon = pauzeren/hervatten (geen popup)
chrome.action.onClicked.addListener(() => {
  togglePause();
});

function togglePause() {
  chrome.storage.local.get('paused').then((v) => {
    chrome.storage.local.set({ paused: !v.paused });
  });
}
