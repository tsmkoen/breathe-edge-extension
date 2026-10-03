// Breathe — icoon-rendering voor het toolbar-icoon.
// De tekenaars en paletten komen uit drawing.js, zodat de widget in de pagina
// (widget.js) exact dezelfde pictogrammen gebruikt. Bevat GEEN chrome.* of
// DOM-afhankelijkheden (behalve OffscreenCanvas) — puur canvas.
import {
  PALETTES,
  paletteFor,
  drawDrop,
  drawPerson,
  drawEye,
  drawPause,
  symbolBackground,
  drawBreathRing,
} from './drawing.js';

// Alleen de formaten die de toolbar echt gebruikt. Een 64px-frame is 16 keer
// zo groot als een 16px-frame en vormt 76% van het volume per frame, terwijl de
// toolbar-icoon op hoge DPI-schermen al met 32px goed oogt. Bij twintig frames per
// seconde scheelt het laten van 64px ongeveer 320 KB/s aan berichten tussen het
// offscreen document en de service worker. Wie het liever scherp heeft op 4K kan
// 64 weer toevoegen via SIZES_EXTRA.
export const SIZES = [16, 32];
export const SIZES_EXTRA = [64];
export { PALETTES };

/**
 * Tekent het icoon-frame.
 * Bij herinneringen/pauze: een herkenbaar pictogram (druppel/mensje/oog/pauze)
 * op een gekleurde achtergrond — geen kleurcode nodig om het te begrijpen.
 * @param state {{ phase:'inhale'|'hold'|'exhale', progress:number, paused:boolean,
 *                waterDue:boolean, standDue:boolean, eyeDue:boolean,
 *                remind:boolean, settings:object }}
 */
export function drawIcon(ctx, size, state) {
  const pal = paletteFor(state.settings);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  // De reminder-halo hoort alleen bij de ademmodus, niet bij een pictogram.
  const inBreathMode = !state.paused && !state.waterDue && !state.standDue && !state.eyeDue;

  if (state.waterDue) {
    symbolBackground(ctx, cx, cy, size, pal.water);
    drawDrop(ctx, cx, cy, size, '#ffffff');
    return;
  }
  if (state.standDue) {
    symbolBackground(ctx, cx, cy, size, pal.stand);
    drawPerson(ctx, cx, cy, size, '#ffffff');
    return;
  }
  if (state.eyeDue) {
    symbolBackground(ctx, cx, cy, size, pal.eye);
    drawEye(ctx, cx, cy, size, pal.eye);
    return;
  }
  if (state.paused) {
    symbolBackground(ctx, cx, cy, size, pal.paused);
    drawPause(ctx, cx, cy, size, '#ffffff');
    return;
  }

  drawBreathRing(ctx, size, state.phase, state.progress, pal, { halo: state.remind && inBreathMode });
}

/** Rendert de icoon-frames voor alle formaten en geeft {16: ImageData, ...} terug. */
export function renderImageData(state, extraSizes = []) {
  const imageData = {};
  for (const size of [...SIZES, ...extraSizes]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawIcon(ctx, size, state);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

/** Tooltip-tekst op basis van de huidige toestand. */
export function titleFor(state) {
  // NB: deze tooltip hoort bij het TOOLBAR-ICOON, niet bij de widget in de pagina.
  if (state.waterDue) return '💧 Tijd voor een glas water — klik op het icoon om te bevestigen';
  if (state.standDue) return '🧍 Tijd om even op te staan en te bewegen — klik op het icoon om te bevestigen';
  if (state.eyeDue) return '👀 20-20-20: kijk 20 seconden in de verte — klik op het icoon om te bevestigen';
  if (state.paused) return 'Breathe — gepauzeerd (klik op het icoon om te hervatten)';
  if (state.remind) return 'Breathe — tijd voor een paar rustige ademhalingen';
  const c = state.cycle || {};
  const sec = (ms) => Math.round((ms || 0) / 1000);
  switch (state.phase) {
    case 'inhale':
      return `Breathe — inademen (${sec(c.inhaleMs)}s)`;
    case 'hold':
      return `Breathe — vasthouden (${sec(c.holdMs)}s)`;
    default:
      return `Breathe — uitademen (${sec(c.exhaleMs)}s)`;
  }
}