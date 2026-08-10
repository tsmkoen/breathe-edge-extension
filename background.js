// Breathe — geanimeerd toolbar-icoon (Edge/Chrome MV3)
import { INHALE_MS, EXHALE_MS, phaseAt } from './cycle.js';

const SIZES = [16, 32, 48, 128];
const TICK_MS = 50; // 20 fps is vloeiend genoeg voor een icoon
const TRACK_COLOR = 'rgba(128, 128, 128, 0.35)';
const COLORS = { inhale: '#22c55e', exhale: '#3b82f6' };

let paused = false;
let timer = null;
let lastPhaseKey = null;

// --- tekenen ---
function draw(ctx, size, progress, inhaling) {
  const stroke = Math.max(1.5, size * 0.11);
  const margin = stroke / 2 + Math.max(1, size * 0.02);
  const radius = (size - margin * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';

  // achtergrondring (subtiel, voor contrast in zowel licht als donker thema)
  ctx.strokeStyle = TRACK_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // voortgangsboog: groen oplopend bij inademen, blauw aflopend bij uitademen
  ctx.strokeStyle = inhaling ? COLORS.inhale : COLORS.exhale;
  const start = -Math.PI / 2; // 12 uur = begin
  const end = start + Math.PI * 2 * progress;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
}

function renderFrame(progress, inhaling) {
  const imageData = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    draw(ctx, size, progress, inhaling);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

function setIconSafe(imageData) {
  try {
    const p = chrome.action.setIcon({ imageData });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // negeer — icoon wordt volgende tick opnieuw gezet
  }
}

// --- tooltip ---
function updateTitle(inhaling) {
  const key = paused ? 'paused' : inhaling ? 'inhale' : 'exhale';
  if (key === lastPhaseKey) return;
  lastPhaseKey = key;
  const title = paused
    ? 'Breathe — gepauzeerd (klik om te hervatten)'
    : inhaling
      ? 'Breathe — inademen (4s)'
      : 'Breathe — uitademen (6s)';
  chrome.action.setTitle({ title });
}

// --- hoofdlus ---
function tick(now) {
  if (paused) return;
  const { inhaling, progress } = phaseAt(now);
  setIconSafe(renderFrame(progress, inhaling));
  updateTitle(inhaling);
  timer = setTimeout(() => tick(performance.now()), TICK_MS);
}

// --- interactie: klik op het icoon = pauzeren/hervatten (geen popup) ---
chrome.action.onClicked.addListener(() => {
  paused = !paused;
  if (paused) {
    clearTimeout(timer);
    setIconSafe(renderFrame(0, false)); // lege grijze ring = gepauzeerd
  } else {
    lastPhaseKey = null;
    tick(performance.now());
  }
  updateTitle(!paused);
});

// --- start direct bij laden ---
tick(performance.now());
