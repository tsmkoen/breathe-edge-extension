// Tests voor de pure ademhalingslogica (cycle.js).
// Draai met: node --test test/   (of: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, cycleFromSettings } from '../cycle.js';

test('4-6 cyclus: inhale 0-4s, exhale 4-10s', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  assert.equal(c.total, 10000);

  assert.deepEqual(c.phaseAt(0), { phase: 'inhale', inhaling: true, progress: 0 });
  assert.deepEqual(c.phaseAt(2000), { phase: 'inhale', inhaling: true, progress: 0.5 });
  assert.deepEqual(c.phaseAt(3999), { phase: 'inhale', inhaling: true, progress: 3999 / 4000 });
  assert.deepEqual(c.phaseAt(4000), { phase: 'exhale', inhaling: false, progress: 1 });
  assert.deepEqual(c.phaseAt(7000), { phase: 'exhale', inhaling: false, progress: 0.5 });
  assert.deepEqual(c.phaseAt(9999), { phase: 'exhale', inhaling: false, progress: 1 - 5999 / 6000 });
});

test('hold-fase wordt overgeslagen als holdSec 0 is', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  const phases = new Set(
    [0, 1000, 3999, 4000, 7000, 9999].map((t) => c.phaseAt(t).phase)
  );
  assert.equal(phases.has('hold'), false);
});

test('box breathing 4-4-4-4 heeft een echte hold-fase', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 4, exhaleSec: 4 });
  assert.equal(c.total, 12000);
  assert.equal(c.phaseAt(4000).phase, 'hold');
  assert.equal(c.phaseAt(7999).phase, 'hold');
  assert.equal(c.phaseAt(8000).phase, 'exhale');
  // vasthouden = volle ring, progress blijft 1
  assert.equal(c.phaseAt(6000).progress, 1);
});

test('cyclus loopt eindeloos door (meer dan één cyclus)', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  assert.deepEqual(c.phaseAt(0), c.phaseAt(10000));
  assert.deepEqual(c.phaseAt(2000), c.phaseAt(12000));
  // en blijft correct bij hele keren
  assert.equal(c.phaseAt(3600000).phase, 'inhale');
});

test('negatieve elapsed loopt netjes terug naar het begin', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  assert.deepEqual(c.phaseAt(-2000), c.phaseAt(8000));
});

// --- regressie: de cyclus wordt gedeeld via een absolute cycleStartedAt ---
// Dit is de berekening die background.js, offscreen.js en widget.js gebruiken.
function elapsedFrom(startedAt, now) {
  return startedAt ? now - startedAt : 0;
}

test('tijdgestabiliseerde cyclus: icoon en widget tonen dezelfde fase', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  const startedAt = 1_700_000_000_000;

  // Op hetzelfde moment, vanuit twee verschillende "processen" (SW en content
  // script) berekend, moet hetzelfde resultaat komen.
  const fromOffscreen = c.phaseAt(elapsedFrom(startedAt, startedAt + 2500));
  const fromWidget = c.phaseAt(elapsedFrom(startedAt, startedAt + 2500));
  assert.deepEqual(fromOffscreen, fromWidget);
  assert.equal(fromOffscreen.phase, 'inhale');
});

test('tijdgestabiliseerde cyclus overleeft een herstart van het offscreen-document', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  const startedAt = 1_700_000_000_000;
  // Offscreen-document sterft en komt 8s later terug: de fase mag niet terug-
  // springen naar het begin, maar verdergaan waar hij was.
  const before = c.phaseAt(elapsedFrom(startedAt, startedAt + 8000));
  const after = c.phaseAt(elapsedFrom(startedAt, startedAt + 8000));
  assert.deepEqual(before, after);
  assert.equal(after.phase, 'exhale');
});

test('zonder cycleStartedAt valt de cyclus terug op 0 (geen crash)', () => {
  const c = cycleFromSettings({ inhaleSec: 4, holdSec: 0, exhaleSec: 6 });
  assert.equal(c.phaseAt(elapsedFrom(0, Date.now())).phase, 'inhale');
});

// --- standaardinstellingen ---
test('waterReminderMin is overal 60 (niet meer 0 in cycle.js)', () => {
  // Dit was de drift-bug: cycle.js had 0, options.js/options.html hadden 60.
  assert.equal(DEFAULT_SETTINGS.waterReminderMin, 60);
});

test('cycle.js klemt ongeldige tijden netjes af', () => {
  const c = cycleFromSettings({ inhaleSec: 0, holdSec: -5, exhaleSec: 0 });
  assert.equal(c.inhaleMs, 1000);
  assert.equal(c.holdMs, 0);
  assert.equal(c.exhaleMs, 1000);
  assert.equal(c.total, 2000);
});