// Breathe — background service worker (Manifest V3, module)
//
// Primair draait de animatie in een offscreen document (blijft actief, rAF).
// FALLBACK: als er binnen FALLBACK_DELAY_MS geen frames van het offscreen
// document binnenkomen (chrome.offscreen ontbreekt, createDocument faalt, of
// messaging werkt niet), draait deze SW zelf een animatielus met OffscreenCanvas.
// Een chrome.alarms-keepalive wekt de SW periodiek en herstelt de lus na een
// eventuele SW-slaap (~30s inactiviteit in MV3).
import { phaseAt } from './cycle.js';
import { renderImageData, titleFor } from './icon-renderer.js';

const OFFSCREEN_URL = 'offscreen.html';
const FALLBACK_DELAY_MS = 3000;
const FALLBACK_TICK_MS = 50;

let paused = false;
let gotFrame = false;
let swLoopTimer = null;

// --- pauze-status (storage is hier wél beschikbaar) ---
chrome.storage.local.get('paused').then((v) => {
  paused = !!v.paused;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.paused) paused = !!changes.paused.newValue;
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
      const { inhaling, progress } = phaseAt(performance.now());
      chrome.action.setIcon({ imageData: renderImageData(progress, inhaling, paused) }).catch?.(() => {});
      chrome.action.setTitle({ title: titleFor(paused, inhaling) }).catch?.(() => {});
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
    chrome.action.setTitle({ title: titleFor(msg.paused, msg.inhaling) }).catch?.(() => {});
  } else if (msg?.type === 'getState') {
    chrome.storage.local.get('paused').then((v) => sendResponse({ paused: !!v.paused }));
    return true; // async sendResponse
  } else if (msg?.type === 'togglePause') {
    togglePause();
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
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'breathe-keepalive') return;
  ensureOffscreen();
  if (!gotFrame && !swLoopTimer) startSwLoop();
});

// klik op het toolbar-icoon = pauzeren/hervatten (geen popup)
chrome.action.onClicked.addListener(() => {
  togglePause();
});

function togglePause() {
  chrome.storage.local.get('paused').then((v) => {
    const next = !v.paused;
    chrome.storage.local.set({ paused: next });
    chrome.runtime.sendMessage({ type: 'setPaused', paused: next }).catch?.(() => {});
  });
}
