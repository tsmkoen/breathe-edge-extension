// Breathe — offscreen document: draait de animatielus (rAF) en stuurt icoon-frames
// naar de service worker. Een offscreen document blijft actief, in tegenstelling
// tot een MV3 service worker (die na ~30s in slaap valt).
import { phaseAt } from './cycle.js';

const SIZES = [16, 32, 64];
const TICK_MS = 50; // ~20 fps is vloeiend genoeg voor een toolbar-icoon
const TRACK_COLOR = 'rgba(128, 128, 128, 0.35)';
const COLORS = { inhale: '#22c55e', exhale: '#3b82f6' };

let paused = false;
let lastSent = 0;

// Pauze-status delen via chrome.storage: SW togglet, offscreen + widget luisteren mee.
chrome.storage.local.get('paused').then((v) => {
  paused = !!v.paused;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.paused) paused = !!changes.paused.newValue;
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
    chrome.runtime.sendMessage({ type: 'frame', imageData, inhaling, paused }).catch(() => {});
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
