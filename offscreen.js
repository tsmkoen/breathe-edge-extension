// Breathe — offscreen document: draait de animatielus (rAF) en stuurt icoon-frames
// naar de service worker. Een offscreen document blijft actief, in tegenstelling
// tot een MV3 service worker (die na ~30s in slaap valt).
//
// LET OP: offscreen documents hebben GEEN toegang tot chrome.storage — alleen
// chrome.runtime (messaging). De pauze-status komt daarom via de service worker:
//  - bij opstart: 'getState' request → SW antwoordt met { paused }
//  - bij wijziging: SW stuurt 'setPaused' bericht
import { phaseAt } from './cycle.js';

const SIZES = [16, 32, 64];
const TICK_MS = 50; // ~20 fps is vloeiend genoeg voor een toolbar-icoon
const TRACK_COLOR = 'rgba(128, 128, 128, 0.35)';
const COLORS = { inhale: '#22c55e', exhale: '#3b82f6' };

let paused = false;
let lastSent = 0;

// Huidige status opvragen bij de service worker
chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
  if (response && typeof response.paused === 'boolean') paused = response.paused;
});

// Statusupdates van de service worker (na toggle op icoon of widget)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'setPaused') paused = !!msg.paused;
});

function draw(ctx, size, progress, inhaling) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(1.5, size * 0.14);
  const radius = size / 2 - stroke / 2 - Math.max(1, size * 0.02);

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';

  // achtergrondring (subtiel, voor contrast in licht én donker thema)
  ctx.strokeStyle = TRACK_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (paused) {
    // gepauzeerd: klein grijs puntje in het midden
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // voortgangsboog: groen oplopend bij inademen, blauw aflopend bij uitademen
  ctx.strokeStyle = inhaling ? COLORS.inhale : COLORS.exhale;
  const start = -Math.PI / 2; // 12 uur = begin
  const end = start + Math.PI * 2 * progress;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
}

function sendMessageSafe(msg) {
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // niet kritisch — volgende frame probeert opnieuw
  }
}

function frame(now) {
  const { inhaling, progress } = phaseAt(now);
  const imageData = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    draw(ctx, size, progress, inhaling);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  if (now - lastSent >= TICK_MS) {
    lastSent = now;
    sendMessageSafe({ type: 'frame', imageData, inhaling, paused });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
