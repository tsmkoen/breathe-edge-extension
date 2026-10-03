// Breathe — gedeelde tekenprimitieven en kleurenpaletten.
//
// Eén bron van waarheid voor zowel het toolbar-icoon (icon-renderer.js) als de
// widget in de pagina (widget.js). Bevat GEEN chrome.* en geen DOM-afhankelijk-
// heden: alles neemt een 2D-context en een expliciete `size`, zodat het zowel in
// een OffscreenCanvas (icon) als in een gewone canvas (widget) werkt.

export const PALETTES = {
  default: {
    inhale: '#22c55e',
    exhale: '#3b82f6',
    hold: '#f59e0b',
    water: '#ef4444',
    stand: '#14b8a6',
    eye: '#8b5cf6',
    paused: '#9ca3af',
    track: 'rgba(128, 128, 128, 0.35)',
    halo: 'rgba(255, 255, 255, 0.45)',
  },
  soft: {
    inhale: '#7fb69a',
    exhale: '#8ab4d8',
    hold: '#e2c07e',
    water: '#e08a8a',
    stand: '#7fc4b8',
    eye: '#a89ad4',
    paused: '#b0b0b0',
    track: 'rgba(128, 128, 128, 0.28)',
    halo: 'rgba(255, 255, 255, 0.35)',
  },
};

/** Kleurenpalet voor de gekozen instelling; onbekende waarden vallen terug op 'default'. */
export function paletteFor(settings) {
  return PALETTES[settings?.colors === 'soft' ? 'soft' : 'default'];
}

// --- pictogrammen (herkenbaar op 16px, zonder kleurcode te hoeven kennen) ---

/** Afgeronde rechthoek als lijnstuk (voor het lijfje van het mensje). */
export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Gekleurde cirkel als achtergrond voor een pictogram. */
export function symbolBackground(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - Math.max(1, size * 0.05), 0, Math.PI * 2);
  ctx.fill();
}

/** 💧 Druppel (water). */
export function drawDrop(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const r = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.15);
  ctx.bezierCurveTo(cx + r * 0.85, cy - r * 0.25, cx + r * 0.7, cy + r * 0.65, cx, cy + r * 0.75);
  ctx.bezierCurveTo(cx - r * 0.7, cy + r * 0.65, cx - r * 0.85, cy - r * 0.25, cx, cy - r * 1.15);
  ctx.closePath();
  ctx.fill();
}

/** 🧍 Mensje (opstaan): hoofd + lichaam. */
export function drawPerson(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const r = size * 0.3;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.45, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  roundRectPath(ctx, cx - r * 0.38, cy - r * 0.05, r * 0.76, r * 0.95, r * 0.2);
  ctx.fill();
}

/** 👀 Oog (20-20-20): witte amandel + pupil in de achtergrondkleur. */
export function drawEye(ctx, cx, cy, size, bgColor) {
  const r = size * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/** ⏸ Pauze: twee verticale balkjes. */
export function drawPause(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const r = size * 0.28;
  ctx.fillRect(cx - r * 0.75, cy - r * 0.85, r * 0.5, r * 1.7);
  ctx.fillRect(cx + r * 0.25, cy - r * 0.85, r * 0.5, r * 1.7);
}

/**
 * Tekent de ademhalingsring: track + voortgangsboog in de fasekleur, met een
 * optionele reminder-halo eromheen. Gedeeld door het icoon en de widget, zodat
 * beide er precies hetzelfde uitzien.
 * @param phase 'inhale' | 'hold' | 'exhale'
 * @param progress 0..1 — inademen 0→1, vasthouden = 1, uitademen 1→0
 */
export function drawBreathRing(ctx, size, phase, progress, palette, { halo = false } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(1.5, size * 0.14);
  const radius = size / 2 - stroke / 2 - Math.max(1, size * 0.02);

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';

  if (halo) {
    ctx.strokeStyle = palette.halo;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - Math.max(1, size * 0.02), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = palette.track;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // voortgangsboog: kleur afhankelijk van fase
  const color = phase === 'hold' ? palette.hold : phase === 'inhale' ? palette.inhale : palette.exhale;
  ctx.strokeStyle = color;
  const start = -Math.PI / 2; // 12 uur = begin
  const end = start + Math.PI * 2 * progress;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  return { cx, cy, radius, stroke, color };
}