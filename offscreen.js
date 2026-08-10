// Breathe — offscreen document: draait de animatielus (rAF) en stuurt icoon-frames
// naar de service worker. Een offscreen document blijft actief, in tegenstelling
// tot een MV3 service worker (die na ~30s in slaap valt).
//
// LET OP: offscreen documents hebben GEEN toegang tot chrome.storage — alleen
// chrome.runtime (messaging). De pauze-status komt daarom via de service worker:
//  - bij opstart: 'getState' request → SW antwoordt met { paused }
//  - bij wijziging: SW stuurt 'setPaused' bericht
import { phaseAt } from './cycle.js';
import { renderImageData } from './icon-renderer.js';

const TICK_MS = 50; // ~20 fps is vloeiend genoeg voor een toolbar-icoon

let paused = false;
let lastSent = 0;

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

// Huidige status opvragen bij de service worker
chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
  if (response && typeof response.paused === 'boolean') paused = response.paused;
});

// Statusupdates van de service worker (na toggle op icoon of widget)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'setPaused') paused = !!msg.paused;
});

function frame(now) {
  const { inhaling, progress } = phaseAt(now);
  if (now - lastSent >= TICK_MS) {
    lastSent = now;
    sendMessageSafe({
      type: 'frame',
      imageData: renderImageData(progress, inhaling, paused),
      inhaling,
      paused,
    });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
