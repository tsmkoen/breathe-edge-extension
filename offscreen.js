// Breathe — offscreen document: draait de animatielus (rAF) en stuurt icoon-frames
// naar de service worker. Een offscreen document blijft actief, in tegenstelling
// tot een MV3 service worker (die na ~30s in slaap valt).
//
// LET OP: offscreen documents hebben GEEN toegang tot chrome.storage — alleen
// chrome.runtime (messaging). Alle state (pauze/water/reminder/instellingen)
// komt daarom via de service worker: 'getState' bij opstart + 'state' updates.
import { DEFAULT_SETTINGS, cycleFromSettings } from './cycle.js';
import { renderImageData } from './icon-renderer.js';

const TICK_MS = 50; // ~20 fps is vloeiend genoeg voor een toolbar-icoon

let state = {
  paused: false,
  waterDue: false,
  remind: false,
  eyeDue: false,
  standDue: false,
  settings: { ...DEFAULT_SETTINGS },
  cycleStartedAt: 0,
};
let cycleCache = null;
let lastSent = 0;

function getCycle() {
  if (!cycleCache) cycleCache = cycleFromSettings(state.settings);
  return cycleCache;
}

function applyState(s) {
  if (!s) return;
  state.paused = !!s.paused;
  state.waterDue = !!s.waterDue;
  state.remind = !!s.remind;
  state.eyeDue = !!s.eyeDue;
  state.standDue = !!s.standDue;
  if (typeof s.cycleStartedAt === 'number' && s.cycleStartedAt) state.cycleStartedAt = s.cycleStartedAt;
  if (s.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    cycleCache = null;
  }
}

function sendMessageSafe(msg) {
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // niet kritisch — volgende frame probeert opnieuw
  }
}

// Startlog (wordt door de SW in de console gelogd)
sendMessageSafe({ type: 'debug', msg: 'offscreen document gestart' });

// Huidige toestand opvragen bij de service worker
chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
  if (response) applyState(response);
});

// Toestandsupdates van de service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'state') applyState(msg);
});

function frame() {
  const cycle = getCycle();
  // Tijdgestabiliseerd: niet de rAF-timestamp (relatief aan dit document) maar
  // de tijd sinds het begin van de cyclus, zoals bijgehouden door de SW. Zo loopt
  // het icoon gelijk met de widget en herstart het op dezelfde fase.
  const elapsed = state.cycleStartedAt ? Date.now() - state.cycleStartedAt : 0;
  const { phase, progress } = cycle.phaseAt(elapsed);
  const now = performance.now();
  if (now - lastSent >= TICK_MS) {
    lastSent = now;
    sendMessageSafe({
      type: 'frame',
      imageData: renderImageData({ ...state, phase, progress, cycle }),
      phase,
      progress,
    });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
