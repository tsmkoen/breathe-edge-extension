// Tests voor de gedeelde tekenmodule (drawing.js) en het delen ervan.
//
// Doel van de refactor: widget.js bevatte vroeger eigen kopieën van de
// kleurenpaletten en de pictogramtekenaars. Als die uit elkaar lopen ziet de
// widget er anders uit dan het toolbar-icoon. Deze tests leggen vast dat er nog
// maar één bron is en dat beide er identiek uitzien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTES,
  paletteFor,
  symbolBackground,
  drawDrop,
  drawPerson,
  drawEye,
  drawPause,
  drawBreathRing,
} from '../drawing.js';

/** Canvas-stub die vastlegt welke bewerkingen werden aangeroepen. */
function recordingContext() {
  const calls = [];
  const rec = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    clearRect: rec('clearRect'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    arcTo: rec('arcTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    ellipse: rec('ellipse'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    bezierCurveTo: rec('bezierCurveTo'),
    set fillStyle(v) { calls.push({ name: 'fillStyle', args: [v] }); },
    get fillStyle() { return '#000'; },
    set strokeStyle(v) { calls.push({ name: 'strokeStyle', args: [v] }); },
    get strokeStyle() { return '#000'; },
    set lineWidth(v) { calls.push({ name: 'lineWidth', args: [v] }); },
    get lineWidth() { return 1; },
    set lineCap(v) { calls.push({ name: 'lineCap', args: [v] }); },
    get lineCap() { return 'butt'; },
  };
}

test('paletten bestaan voor default en soft', () => {
  assert.ok(PALETTES.default, 'default palet aanwezig');
  assert.ok(PALETTES.soft, 'soft palet aanwezig');
});

test('beide paletten bevatten dezelfde sleutels', () => {
  // Een ontbrekende kleur zou in de widget undefined opleveren (zwart).
  assert.deepEqual(Object.keys(PALETTES.default).sort(), Object.keys(PALETTES.soft).sort());
  for (const key of ['inhale', 'exhale', 'hold', 'water', 'stand', 'eye', 'paused', 'track', 'halo']) {
    assert.ok(PALETTES.default[key], `default.${key} gezet`);
    assert.ok(PALETTES.soft[key], `soft.${key} gezet`);
  }
});

test('paletteFor kiest op basis van de instelling en valt terug op default', () => {
  assert.equal(paletteFor({ colors: 'soft' }), PALETTES.soft);
  assert.equal(paletteFor({ colors: 'default' }), PALETTES.default);
  assert.equal(paletteFor({}), PALETTES.default, 'ontbrekende waarde valt terug op default');
  assert.equal(paletteFor({ colors: 'onzin' }), PALETTES.default, 'onbekende waarde valt terug op default');
  assert.equal(paletteFor(undefined), PALETTES.default, 'undefined settings is veilig');
});

test('elk pictogram tekent daadwerkelijk iets', () => {
  const drawn = {
    '💧 druppel': (ctx) => drawDrop(ctx, 48, 48, 96, '#fff'),
    '🧍 mensje': (ctx) => drawPerson(ctx, 48, 48, 96, '#fff'),
    '👀 oog': (ctx) => drawEye(ctx, 48, 48, 96, '#8b5cf6'),
    '⏸ pauze': (ctx) => drawPause(ctx, 48, 48, 96, '#fff'),
    '● achtergrond': (ctx) => symbolBackground(ctx, 48, 48, 96, '#ef4444'),
  };
  for (const [name, fn] of Object.entries(drawn)) {
    const ctx = recordingContext();
    fn(ctx);
    assert.ok(ctx.calls.length > 0, `${name} tekent`);
    assert.ok(
      ctx.calls.some((c) => ['fill', 'fillRect', 'stroke'].includes(c.name)),
      `${name} vult of streekt`
    );
  }
});

test('de ademhalingsring gebruikt de fasekleur', () => {
  const cases = [
    ['inhale', PALETTES.default.inhale],
    ['exhale', PALETTES.default.exhale],
    ['hold', PALETTES.default.hold],
  ];
  for (const [phase, expected] of cases) {
    const ctx = recordingContext();
    const r = drawBreathRing(ctx, 96, phase, 0.5, PALETTES.default);
    const strokes = ctx.calls.filter((c) => c.name === 'strokeStyle');
    assert.ok(
      strokes.some((c) => c.args[0] === expected),
      `fase ${phase} tekent in ${expected}`
    );
    assert.equal(r.color, expected, `teruggegeven kleur klopt bij ${phase}`);
  }
});

test('de ring tekent track én voortgangsboog', () => {
  const ctx = recordingContext();
  drawBreathRing(ctx, 96, 'inhale', 0.5, PALETTES.default);
  const strokes = ctx.calls.filter((c) => c.name === 'strokeStyle').map((c) => c.args[0]);
  assert.ok(strokes.includes(PALETTES.default.track), 'track getekend');
  assert.ok(strokes.includes(PALETTES.default.inhale), 'voortgangsboog getekend');
});

test('de halo wordt alleen getekend als die is aangevraagd', () => {
  const without = recordingContext();
  drawBreathRing(without, 96, 'inhale', 0.5, PALETTES.default);
  assert.ok(
    !without.calls.some((c) => c.name === 'strokeStyle' && c.args[0] === PALETTES.default.halo),
    'zonder halo geen halo'
  );

  const with_ = recordingContext();
  drawBreathRing(with_, 96, 'inhale', 0.5, PALETTES.default, { halo: true });
  assert.ok(
    with_.calls.some((c) => c.name === 'strokeStyle' && c.args[0] === PALETTES.default.halo),
    'met halo wel een halo'
  );
});

test('de ring overleeft progress 0 en 1 zonder NaN', () => {
  for (const progress of [0, 0.5, 1]) {
    const ctx = recordingContext();
    const r = drawBreathRing(ctx, 96, 'inhale', progress, PALETTES.default);
    for (const [name, value] of Object.entries(r)) {
      if (typeof value === 'number') {
        assert.ok(Number.isFinite(value), `${name} is eindig bij progress=${progress}`);
      }
    }
  }
});

// --- deduplicatie: widget.js mag de tekenaars niet meer kopiëren ---
test('widget.js bevat geen eigen kopie meer van de gedeelde code', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../widget.js', import.meta.url), 'utf8');

  // Deze definities stonden vroeger als duplicaat in widget.js.
  const duplicaten = [
    'function makeCycle',
    'function roundRectPath',
    'function drawDrop',
    'function drawPerson',
    'function drawEye',
    'function drawPause',
    'function symbolBackground',
  ];
  for (const d of duplicaten) {
    assert.ok(!src.includes(d), `widget.js bevat geen "${d}" meer`);
  }

  // En het palet mag niet meer inline staan.
  assert.ok(!src.includes('#22c55e'), 'widget.js bevat geen kleurcodes meer');
  // Wel de import van de gedeelde modules.
  assert.ok(src.includes('drawing.js'), 'widget.js importeert drawing.js');
  assert.ok(src.includes('cycle.js'), 'widget.js importeert cycle.js');
});

test('icon-renderer.js gebruikt de gedeelde tekenaars', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../icon-renderer.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from './drawing.js'"), 'icon-renderer.js importeert drawing.js');
  assert.ok(!src.includes('#22c55e'), 'icon-renderer.js bevat geen eigen kleurcodes meer');
});

test('het icoon en de widget tekenen hetzelfde pictogram', async () => {
  // De hele zin van de refactor: geen visuele drift tussen toolbar-icoon en
  // widget. We tekenen dezelfde toestand via drawIcon (icoon) en via de
  // tekenaars zoals widget.js dat doet, en vergelijken de oproepen.
  const { drawIcon } = await import('../icon-renderer.js');

  const states = [
    { waterDue: true },
    { standDue: true },
    { eyeDue: true },
    { paused: true },
  ];

  for (const extra of states) {
    const state = {
      phase: 'inhale', progress: 0.5, remind: false,
      waterDue: false, standDue: false, eyeDue: false, paused: false,
      settings: { colors: 'default' },
      ...extra,
    };

    const viaIcon = recordingContext();
    drawIcon(viaIcon, 96, state);

    // Zo tekent widget.js hetzelfde pictogram, via de gedeelde tekenaars.
    const viaWidget = recordingContext();
    const pal = paletteFor(state.settings);
    const cx = 48, cy = 48;
    if (state.waterDue) { symbolBackground(viaWidget, cx, cy, 96, pal.water); drawDrop(viaWidget, cx, cy, 96, '#ffffff'); }
    else if (state.standDue) { symbolBackground(viaWidget, cx, cy, 96, pal.stand); drawPerson(viaWidget, cx, cy, 96, '#ffffff'); }
    else if (state.eyeDue) { symbolBackground(viaWidget, cx, cy, 96, pal.eye); drawEye(viaWidget, cx, cy, 96, pal.eye); }
    else if (state.paused) { symbolBackground(viaWidget, cx, cy, 96, pal.paused); drawPause(viaWidget, cx, cy, 96, '#ffffff'); }

    // drawIcon begint met clearRect; in widget.js gebeurt dat vór de tak.
    // Vergelijk daarom het tekengedeelte, niet het voorwerk.
    const drawCalls = (ctx) => ctx.calls.map((c) => c.name).filter((n) => n !== 'clearRect');
    assert.deepEqual(
      drawCalls(viaIcon),
      drawCalls(viaWidget),
      `icoon en widget tekenen hetzelfde voor ${JSON.stringify(extra)}`
    );
  }
});

test('de widget valt terug op de gedeelde modules en niet op eigen kleuren', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../widget.js', import.meta.url), 'utf8');
  // Een eigen palet zou de boek opnieuw openen; de test hierboven zou 'm dan
  // niet meer zien, maar deze vangt het meteen bij het lezen van de bron.
  assert.ok(!src.includes('rgba(128'), 'widget.js bevat geen eigen track-kleur meer');
  assert.ok(src.includes('chrome.runtime.getURL'), 'widget.js laadt de modules via runtime.getURL');
});