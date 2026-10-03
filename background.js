// Breathe — background service worker (Manifest V3, module)
//
// Primair draait de animatie in een offscreen document (blijft actief, rAF).
// FALLBACK: als er geen frames van het offscreen document binnenkomen, draait
// deze SW zelf een animatielus met OffscreenCanvas.
// Alarms: keepalive (SW wekken), water-reminder, adem-reminder.
// State (pauze/water/reminder/instellingen) staat in chrome.storage.local en
// wordt naar het offscreen document gebroadcast via berichten.
import { DEFAULT_SETTINGS, cycleFromSettings } from './cycle.js';
import { renderImageData, titleFor } from './icon-renderer.js';

const OFFSCREEN_URL = 'offscreen.html';
const FALLBACK_DELAY_MS = 3000;
const FALLBACK_TICK_MS = 50;
const REMIND_DURATION_MS = 60000; // adem-reminder zichtbaar gedurende 1 minuut
const STALE_FRAME_MS = 10000; // geen frame > 10s => offscreen is dood, val terug
const MIGRATED_WIDGET_VERSION = '1.6.0'; // vanaf hier staat de widget standaard uit

let settings = { ...DEFAULT_SETTINGS };
let paused = false;
let waterDue = false;
let remind = false;
let remindUntil = 0;
let eyeDue = false;
let standDue = false;
let cycleStartedAt = 0;
let gotFrame = false;
let lastFrameAt = 0;
let swLoopTimer = null;
let cycleCache = null;
let lastVisual = ''; // vingerafdruk van het laatst getekende icoon

// --- helpers ---
function getCycle() {
  if (!cycleCache) cycleCache = cycleFromSettings(settings);
  return cycleCache;
}
/** Verstreken tijd sinds het begin van de cyclus — tijdgestabiliseerd via opslag,
 *  zodat het icoon, de widget en de SW-fallback dezelfde fase tonen. */
function cycleElapsed() {
  return cycleStartedAt ? Date.now() - cycleStartedAt : 0;
}
function currentState() {
  return { paused, waterDue, remind, eyeDue, standDue, settings, cycle: getCycle() };
}
function broadcastState() {
  chrome.runtime
    .sendMessage({ type: 'state', paused, waterDue, remind, eyeDue, standDue, settings, cycleStartedAt })
    .catch?.(() => {});
}

// --- state laden + wijzigingen volgen ---
chrome.storage.local
  .get(['settings', 'paused', 'waterDue', 'remind', 'remindUntil', 'eyeDue', 'standDue', 'cycleStartedAt'])
  .then((v) => {
    if (v.settings) settings = { ...DEFAULT_SETTINGS, ...v.settings };
    paused = !!v.paused;
    waterDue = !!v.waterDue;
    eyeDue = !!v.eyeDue;
    standDue = !!v.standDue;
    cycleStartedAt = v.cycleStartedAt || Date.now();

    // De adem-herinnering is tijdelijk: hij mag niet blijven plakken wanneer de
    // browser is herstart of gesloten terwijl hij actief was. `remindUntil` is
    // het enige gezaghebbende gegeven — `remind` volgt daaruit.
    remindUntil = typeof v.remindUntil === 'number' ? v.remindUntil : 0;
    if (remindUntil > Date.now()) {
      remind = true;
      // her-arm de uitzetter voor de resterende tijd
      chrome.alarms.create('breathe-remind-off', { when: remindUntil, ...PERSIST });
    } else {
      remind = false;
      if (v.remind || remindUntil) chrome.storage.local.set({ remind: false, remindUntil: 0 });
      remindUntil = 0;
    }

    cycleCache = null;
    syncAlarms();
  });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let dirty = false;
  if (changes.settings) {
    const prev = settings;
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    cycleCache = null;
    dirty = true;
    // Nieuwe ademtijden => nieuwe cyclus vanaf nu, zodat de fase consistent blijft.
    const patternChanged =
      prev.inhaleSec !== settings.inhaleSec ||
      prev.holdSec !== settings.holdSec ||
      prev.exhaleSec !== settings.exhaleSec;
    if (patternChanged) restartCycle();
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
  if (changes.remindUntil) {
    remindUntil = typeof changes.remindUntil.newValue === 'number' ? changes.remindUntil.newValue : 0;
    dirty = true;
  }
  if (changes.eyeDue) {
    eyeDue = !!changes.eyeDue.newValue;
    dirty = true;
  }
  if (changes.standDue) {
    standDue = !!changes.standDue.newValue;
    dirty = true;
  }
  if (changes.cycleStartedAt) {
    cycleStartedAt = changes.cycleStartedAt.newValue || Date.now();
    dirty = true;
  }
  if (dirty) broadcastState();
});

/** Start de cyclus opnieuw vanaf nu (nieuw patroon, installatie of herstart). */
function restartCycle() {
  cycleStartedAt = Date.now();
  chrome.storage.local.set({ cycleStartedAt }).catch?.(() => {});
}

// --- alarms ---
// persistAcrossSessions zetten we expliciet: de vlag bestaat sinds Chrome 150 en
// de documentatie raadt aan hem altijd te zetten voor maximale compatibiliteit
// met andere browsers. Zonder de vlag is het gedrag in oudere versies
// onvoorspelbaar, wat o.a. betekende dat het eenmalige remind-off-alarm na een
// herstart kon verdwijnen.
const PERSIST = { persistAcrossSessions: true };

function syncAlarms() {
  chrome.alarms.clear('breathe-water');
  if (settings.waterReminderMin > 0) {
    chrome.alarms.create('breathe-water', { periodInMinutes: settings.waterReminderMin, ...PERSIST });
  }
  chrome.alarms.clear('breathe-remind');
  if (settings.breatheReminderMin > 0) {
    chrome.alarms.create('breathe-remind', { periodInMinutes: settings.breatheReminderMin, ...PERSIST });
  }
  chrome.alarms.clear('breathe-eye');
  if (settings.eyeReminderMin > 0) {
    chrome.alarms.create('breathe-eye', { periodInMinutes: settings.eyeReminderMin, ...PERSIST });
  }
  chrome.alarms.clear('breathe-stand');
  if (settings.standReminderMin > 0) {
    chrome.alarms.create('breathe-stand', { periodInMinutes: settings.standReminderMin, ...PERSIST });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'breathe-fallback-check') {
    // De grace-period is voorbij: als er nog steeds geen frame binnenkwam,
    // werkt het offscreen document niet en tekenen we zelf.
    if (!gotFrame) startSwLoop();
  } else if (alarm.name === 'breathe-keepalive') {
    ensureOffscreen();
    // Een frame dat lang geleden binnenkwam bewijst niets: het offscreen
    // document kan sindsdien gecrasht zijn. Beschouw het als dood zodra er
    // te lang geen frame is geweest, anders blijft de fallback voor altijd uit.
    if (gotFrame && Date.now() - lastFrameAt > STALE_FRAME_MS) {
      gotFrame = false;
      console.warn('[Breathe] geen offscreen-frame sinds', Date.now() - lastFrameAt, 'ms');
    }
    if (!gotFrame && !swLoopTimer) startSwLoop();
  } else if (alarm.name === 'breathe-water') {
    chrome.storage.local.set({ waterDue: true });
  } else if (alarm.name === 'breathe-remind') {
    const until = Date.now() + REMIND_DURATION_MS;
    remindUntil = until;
    chrome.alarms.create('breathe-remind-off', { when: until, ...PERSIST });
    chrome.storage.local.set({ remind: true, remindUntil: until });
  } else if (alarm.name === 'breathe-remind-off') {
    remindUntil = 0;
    chrome.storage.local.set({ remind: false, remindUntil: 0 });
  } else if (alarm.name === 'breathe-eye') {
    // 20-20-20: blijft actief tot de gebruiker bevestigt (klik op het icoon)
    chrome.storage.local.set({ eyeDue: true });
  } else if (alarm.name === 'breathe-stand') {
    chrome.storage.local.set({ standDue: true });
  }
});

// --- offscreen document beheren ---
// `creating` voorkomt dat twee aanroepen elkaar in de weg zitten: de guard
// `hasDocument()` is asynchroom, dus twee bijna gelijktijdige aanroepen (bv. het
// keepalive-alarm en onStartup) kunnen allebei zien dat er nog geen document is
// en dan allebei createDocument() aanroepen. Chrome staat maar EEN offscreen
// document per extensie toe, dus de tweede faalt met een fout. De docs adviseren
// precies deze guard.
let creating = null;

async function ensureOffscreen() {
  try {
    if (typeof chrome.offscreen?.hasDocument === 'function') {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
    }
    if (creating) {
      await creating;
      return;
    }
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas-animatie (rAF) voor het geanimeerde Breathe toolbar-icoon.',
    });
    await creating;
    creating = null;
    console.log('[Breathe] offscreen document aangemaakt');
  } catch (e) {
    creating = null;
    // Een reeds bestaand document is geen probleem: dat willen we toch al.
    if (!/already/i.test(e?.message || '')) {
      console.error('[Breathe] offscreen document niet beschikbaar:', e?.message || e);
    }
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
      const { phase, progress } = cycle.phaseAt(cycleElapsed());
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

/**
 * Zet de fallback in na een korte grace-period, maar via een ALARM in plaats
 * van een setTimeout: een service worker kan worden gesuspendeerd, waardoor een
 * lopende timer nooit vuurt. Een alarm overleeft suspendering wel. De keepalive
 * controleert daarnaast elke minuut, dus dit is alleen de snelle eerste check.
 */
function armFallback() {
  chrome.alarms.create('breathe-fallback-check', { when: Date.now() + FALLBACK_DELAY_MS, ...PERSIST });
}

/** Pauzeren/hervatten — ook gebruikt door de klik op het toolbar-icoon. */
function togglePause() {
  chrome.storage.local.set({ paused: !paused }).catch?.(() => {});
}

// --- berichten ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'frame') {
    gotFrame = true;
    lastFrameAt = Date.now();
    stopSwLoop(); // offscreen werkt — fallback uitzetten
    chrome.alarms.clear('breathe-fallback-check'); // eenmalige check is niet meer nodig

    // Bij een pauze of een herinnering staat het icoon stil: het is dan twintig
    // keer per seconde precies dezelfde pixels. Door alleen te tekenen als er
    // echt iets veranderd is, sparen we dat werk en de bijbehorende
    // setIcon-aanroepen.
    //
    // De flags komen uit currentState() en niet uit losse modulevariabelen: die
    // worden pas bijgewerkt zodra storage.onChanged vuurt, terwijl een frame
    // besteld op basis van een zojuist gezette vlag anders één beeld te laat
    // zou blijven hangen.
    const st = { ...currentState(), phase: msg.phase, progress: msg.progress };
    const visual = [
      msg.phase,
      Math.round((msg.progress || 0) * 1000),
      st.paused, st.waterDue, st.standDue, st.eyeDue, st.remind,
    ].join(':');
    if (visual !== lastVisual) {
      lastVisual = visual;
      chrome.action.setIcon({ imageData: msg.imageData }).catch?.(() => {});
    }

    chrome.action.setTitle({ title: titleFor(st) }).catch?.(() => {});
  } else if (msg?.type === 'getState') {
    sendResponse({ paused, waterDue, remind, eyeDue, standDue, settings, cycleStartedAt });
  } else if (msg?.type === 'togglePause') {
    togglePause();
  } else if (msg?.type === 'waterDrunk') {
    chrome.storage.local.set({ waterDue: false });
  } else if (msg?.type === 'standDone') {
    chrome.storage.local.set({ standDue: false });
  } else if (msg?.type === 'eyeDone') {
    chrome.storage.local.set({ eyeDue: false });
  } else if (msg?.type === 'debug') {
    console.log('[Breathe]', msg.msg);
  }
});

/** Vergelijkt twee semvers-achtige versies. */
function isOlderThan(version, target) {
  const a = String(version || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(target).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av < bv;
  }
  return false;
}

// --- levenscyclus ---
chrome.runtime.onInstalled.addListener((details) => {
  ensureOffscreen();
  armFallback();

  const fresh = details.reason === 'install';
  if (fresh) restartCycle();

  // Migratie (v1.6.0): de widget in de pagina ging standaard uit. Dit mag EENMALIG
  // gebeuren — anders zou elke update de keuze van de gebruiker overschrijven.
  if (details.reason === 'update' && details.previousVersion &&
      isOlderThan(details.previousVersion, MIGRATED_WIDGET_VERSION)) {
    console.log(`[Breathe] migratie ${details.previousVersion} -> ${MIGRATED_WIDGET_VERSION}: widget uit`);
    chrome.storage.local.get('settings').then((v) => {
      const s = { ...DEFAULT_SETTINGS, ...(v.settings || {}) };
      s.widgetEnabled = false;
      chrome.storage.local.set({ settings: s });
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
  armFallback();
  // Nieuwe browsersessie: de ademhalingscyclus begint opnieuw, zodat het icoon
  // niet midden in een fase "vast blijft staan".
  restartCycle();
});

// Keepalive: herstelt de fallback-lus na slaap en ruimt een overlijden
// offscreen-document op. Eens per minuut is genoeg: het offscreen document
// verzendt frames zodra het hersteld is, en de herinneringsalarms staan op
// eigen intervallen. Een kortere periode zou de service worker permanent
// wakker houden, wat op een laptop gedurende de werkdag merkbaar is voor de
// batterij. Let op: periodInMinutes krijgt een minimum van 0.5 bij het opslaan.
chrome.alarms.create('breathe-keepalive', { periodInMinutes: 1, ...PERSIST });

// Klik op het toolbar-icoon (geen popup):
// - bij een actieve herinnering = bevestigen (water > opstaan > ogen)
// - anders = pauzeren/hervatten
chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get(['paused', 'waterDue', 'standDue', 'eyeDue']).then((v) => {
    if (v.waterDue) {
      chrome.storage.local.set({ waterDue: false }); // "gedronken"
    } else if (v.standDue) {
      chrome.storage.local.set({ standDue: false }); // "opgestaan"
    } else if (v.eyeDue) {
      chrome.storage.local.set({ eyeDue: false }); // "weggekeken"
    } else {
      togglePause();
    }
  });
});