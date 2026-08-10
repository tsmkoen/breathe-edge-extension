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

/**
 * Tekent het icoon-frame.
 * @param state {{ phase:'inhale'|'hold'|'exhale', progress:number, paused:boolean,
 *                waterDue:boolean, remind:boolean, settings:object }}
 */
export function drawIcon(ctx, size, state) {
  const pal = paletteFor(state.settings);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(1.5, size * 0.14);
  const radius = size / 2 - stroke / 2 - Math.max(1, size * 0.02);

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';

  // reminder-halo (subtiele buitenring) — optioneel, kort zichtbaar
  if (state.remind && !state.paused) {
    ctx.strokeStyle = pal.halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + stroke * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // achtergrondring: gekleurd bij herinneringen (prioriteit water > opstaan > ogen)
  let ringColor = pal.track;
  if (state.waterDue) ringColor = pal.water;
  else if (state.standDue) ringColor = pal.stand;
  else if (state.eyeDue) ringColor = pal.eye;
  ctx.strokeStyle = ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (state.paused) {
    // gepauzeerd: klein grijs puntje in het midden
    ctx.fillStyle = pal.paused;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

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
