// Breathe — gedeelde icoon-rendering.
// Gebruikt door het offscreen document én als fallback door de service worker.
// Bevat GEEN chrome.* of DOM-afhankelijkheden (behalve OffscreenCanvas) — puur canvas.
export const SIZES = [16, 32, 64];

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

function paletteFor(settings) {
  return PALETTES[settings?.colors === 'soft' ? 'soft' : 'default'];
}

// --- pictogrammen (herkenbaar op 16px, zonder kleurcode te hoeven kennen) ---
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Gekleurde cirkel als achtergrond voor een pictogram. */
function symbolBackground(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - Math.max(1, size * 0.05), 0, Math.PI * 2);
  ctx.fill();
}

/** 💧 Druppel (water). */
function drawDrop(ctx, cx, cy, size, color) {
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
function drawPerson(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const r = size * 0.3;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.45, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  roundRectPath(ctx, cx - r * 0.38, cy - r * 0.05, r * 0.76, r * 0.95, r * 0.2);
  ctx.fill();
}

/** 👀 Oog (20-20-20): witte amandel + pupil in de achtergrondkleur. */
function drawEye(ctx, cx, cy, size, bgColor) {
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
function drawPause(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const r = size * 0.28;
  ctx.fillRect(cx - r * 0.75, cy - r * 0.85, r * 0.5, r * 1.7);
  ctx.fillRect(cx + r * 0.25, cy - r * 0.85, r * 0.5, r * 1.7);
}

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

  // reminder-halo (alleen in adem-modus, niet bij pictogrammen)
  if (state.remind && !state.paused && !state.waterDue && !state.standDue && !state.eyeDue) {
    ctx.lineWidth = Math.max(1.5, size * 0.14);
    ctx.strokeStyle = pal.halo;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - Math.max(1, size * 0.02), 0, Math.PI * 2);
    ctx.stroke();
  }

  // pictogrammen: 💧 water, 🧍 opstaan, 👀 ogen, ⏸ pauze
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

  // ademhalingsring
  const stroke = Math.max(1.5, size * 0.14);
  const radius = size / 2 - stroke / 2 - Math.max(1, size * 0.02);

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';

  ctx.strokeStyle = pal.track;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // voortgangsboog: kleur afhankelijk van fase
  const color =
    state.phase === 'hold' ? pal.hold : state.phase === 'inhale' ? pal.inhale : pal.exhale;
  ctx.strokeStyle = color;
  const start = -Math.PI / 2; // 12 uur = begin
  const end = start + Math.PI * 2 * state.progress;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
}

/** Rendert de icoon-frames voor alle formaten en geeft {16, 32, 64} ImageData terug. */
export function renderImageData(state) {
  const imageData = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawIcon(ctx, size, state);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

/** Tooltip-tekst op basis van de huidige toestand. */
export function titleFor(state) {
  if (state.waterDue) return '💧 Tijd voor een glas water — klik op de widget om te bevestigen';
  if (state.standDue) return '🧍 Tijd om even op te staan en te bewegen — klik op de widget om te bevestigen';
  if (state.eyeDue) return '👀 20-20-20: kijk 20 seconden in de verte — klik op de widget om te bevestigen';
  if (state.paused) return 'Breathe — gepauzeerd (klik om te hervatten)';
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
