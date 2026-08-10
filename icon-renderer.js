// Breathe — gedeelde icoon-rendering.
// Gebruikt door het offscreen document én als fallback door de service worker.
// Bevat GEEN chrome.* of DOM-afhankelijkheden (behalve OffscreenCanvas) — puur canvas.
export const SIZES = [16, 32, 64];
export const COLORS = { inhale: '#22c55e', exhale: '#3b82f6', paused: '#9ca3af' };
export const TRACK_COLOR = 'rgba(128, 128, 128, 0.35)';

export function drawIcon(ctx, size, progress, inhaling, paused) {
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
    ctx.fillStyle = COLORS.paused;
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

/** Rendert de icoon-frames voor alle formaten en geeft {16, 32, 64} ImageData terug. */
export function renderImageData(progress, inhaling, paused) {
  const imageData = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawIcon(ctx, size, progress, inhaling, paused);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

export function titleFor(paused, inhaling) {
  if (paused) return 'Breathe — gepauzeerd (klik om te hervatten)';
  return inhaling ? 'Breathe — inademen (4s)' : 'Breathe — uitademen (6s)';
}
