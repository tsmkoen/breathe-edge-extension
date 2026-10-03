// Gedragstests voor de service worker (background.js). Hiermee worden de fixes
// op de remind-logica, de fallback-detectie en de eenmalige migratie afgedekt.
//
// NB: de tests draaien met `node --test --test-force-exit` (zie package.json).
// background.js start een animatielus die oneindig doorloopt zolang de service
// worker leeft — net als in de echte browser. Zonder die vlag zou de Node-
// eventloop nooit leeg worden en zou de testrunner blijven hangen. De lus is
// bedoeld gedrag, geen lek; de assertions daarboven sluiten hem bewust af.
//
// background.js is pure browser-code, maar de beslissingen die we willen
// controleren (remind die niet mag plakken, migratie die éénmalig is, fallback
// die weer aangaat) zijn pure functies van storage + alarms. Daarom injecteren
// we een minimale `chrome`-stub en importeren we het bestand echt.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/** Minimaal canvas: icon-renderer.js gebruikt alleen deze bewerkingen. */
function makeOffscreenCanvas() {
  const noop = () => {};
  const ctx = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'getImageData') {
          return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        }
        if (prop in target) return target[prop];
        return noop;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
  return class OffscreenCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return ctx;
    }
  };
}

// Achtergebleven module-instanties uit een vorige test draaien hun animatielus
// nog steeds tegen `globalThis.chrome`. Na elke test wijzen we dat naar een
// dood model, zodat een oude lus nooit de volgende test kan "behalpen".
const SINK = { action: { setIcon: async () => {}, setTitle: async () => {} }, runtime: { sendMessage: async () => {} }, alarms: { create() {}, clear() {} }, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } } };
afterEach(() => {
  globalThis.chrome = SINK;
  globalThis.OffscreenCanvas = makeOffscreenCanvas();
});

/** Bouwt een chrome-stub met een in-memory storage.local en alarm-log. */
function makeChrome(initial = {}) {
  const store = { ...initial };
  const alarms = new Map();
  const listeners = {};
  const log = [];

  const stub = {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(store);
          const out = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        async set(obj) {
          Object.assign(store, obj);
          log.push({ set: obj });
          return obj;
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.changed = fn;
        },
      },
    },
    alarms: {
      create(name, info) {
        alarms.set(name, info);
      },
      clear(name) {
        alarms.delete(name);
      },
      onAlarm: {
        addListener(fn) {
          listeners.alarm = fn;
        },
      },
      clearAll: async () => true,
    },
    runtime: {
      onMessage: { addListener(fn) { listeners.message = fn; } },
      onInstalled: { addListener(fn) { listeners.installed = fn; } },
      onStartup: { addListener(fn) { listeners.startup = fn; } },
      sendMessage: async () => {},
    },
    action: {
      onClicked: { addListener(fn) { listeners.clicked = fn; } },
      setIcon: async () => {},
      setTitle: async () => {},
    },
    offscreen: {
      hasDocument: async () => true,
      createDocument: async () => {},
    },
    __store: store,
    __alarms: alarms,
    __listeners: listeners,
    __log: log,
  };
  return stub;
}

/** Laadt background.js opnieuw met een verse `chrome`-stub (module cache omzeilen). */
async function loadBackground(chromeStub) {
  globalThis.chrome = chromeStub;
  globalThis.OffscreenCanvas = makeOffscreenCanvas();
  const url = new URL('../background.js', import.meta.url).href;
  return import(`${url}?t=${Math.random()}`);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('remind die overblijft van een afgebroken sessie wordt genegeerd', async () => {
  // Zo ziet het eruit als de browser is gesloten terwijl de herinnering aanstond:
  // remind=true, maar remindUntil ligt in het verleden.
  const chromeStub = makeChrome({ remind: true, remindUntil: Date.now() - 5000 });
  await loadBackground(chromeStub);
  await flush();

  // De SW mag geen reminder als actief behandelen...
  let state = null;
  chromeStub.__listeners.message({ type: 'getState' }, {}, (r) => { state = r; });

  assert.equal(state.remind, false, 'verleden remindUntil telt niet mee');
  // ...en ruimt het op, zodat het niet de volgende sessie in blijft hangen.
  assert.ok(
    chromeStub.__log.some((e) => e.set && e.set.remind === false && e.set.remindUntil === 0),
    'stale remind wordt opgeschoond'
  );
});

test('een nog geldige remind blijft staan en her-armt zijn alarm', async () => {
  const until = Date.now() + 60000;
  const chromeStub = makeChrome({ remind: true, remindUntil: until });
  await loadBackground(chromeStub);
  await flush();

  let state = null;
  chromeStub.__listeners.message({ type: 'getState' }, {}, (r) => { state = r; });
  assert.equal(state.remind, true);
  assert.ok(
    chromeStub.__alarms.has('breathe-remind-off'),
    'breathe-remind-off is opnieuw ingepland voor de resterende tijd'
  );
});

test('remind zonder remindUntil (oude installatie) telt niet als actief', async () => {
  const chromeStub = makeChrome({ remind: true });
  await loadBackground(chromeStub);
  await flush();

  let state = null;
  chromeStub.__listeners.message({ type: 'getState' }, {}, (r) => { state = r; });
  assert.equal(state.remind, false);
});

test('het remind-alarm zet zowel remind als remindUntil', async () => {
  const chromeStub = makeChrome();
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__listeners.alarm({ name: 'breathe-remind' });
  const set = chromeStub.__log.filter((e) => e.set).pop().set;
  assert.equal(set.remind, true);
  assert.ok(set.remindUntil > Date.now(), 'remindUntil ligt in de toekomst');
  assert.ok(chromeStub.__alarms.has('breathe-remind-off'));
});

// --- bug 2: gotFrame wordt nooit gereset ---
test('een dood offscreen-document schakelt de fallback weer aan', async () => {
  const chromeStub = makeChrome();
  await loadBackground(chromeStub);
  await flush();

  // Eén frame: de fallback gaat uit.
  chromeStub.__listeners.message({ type: 'frame', imageData: {} });
  await flush();

  // De keepalivealarm draait lang na die frame (browser sliep).
  const origNow = Date.now;
  Date.now = () => origNow() + 60000;
  try {
    chromeStub.__listeners.alarm({ name: 'breathe-keepalive' });
  } finally {
    Date.now = origNow;
  }

  // Na 60s zonder frame moet de SW-fallback weer draaien; dat is te zien aan
  // de setIcon-aanroepen (de SW tekent zelf).
  let setIconCalls = 0;
  chromeStub.action.setIcon = async () => { setIconCalls++; };
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(setIconCalls > 0, 'SW-fallback tekent zelf na een stale frame');
});

// --- bug 3: migratie mag niet elke update overschrijven ---
test('migratie draait bij een update vanaf < 1.6.0', async () => {
  const chromeStub = makeChrome();
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__log.length = 0;
  chromeStub.__listeners.installed({ reason: 'update', previousVersion: '1.5.2' });
  await flush();

  const s = chromeStub.__log.filter((e) => e.set && e.set.settings).pop();
  assert.ok(s, 'settings worden weggeschreven');
  assert.equal(s.set.settings.widgetEnabled, false, 'widget gaat uit bij de migratie');
});

test('migratie draait NIET bij een latere update (keuze blijft behouden)', async () => {
  const chromeStub = makeChrome({ settings: { widgetEnabled: true } });
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__log.length = 0;
  chromeStub.__listeners.installed({ reason: 'update', previousVersion: '1.7.0' });
  await flush();

  const s = chromeStub.__log.filter((e) => e.set && e.set.settings);
  assert.equal(s.length, 0, 'een widget-keuze van de gebruiker wordt niet overschreven');
});

// --- bug 6: cyclus wordt tijdgestabiliseerd ---
test('de cyclus heeft een cycleStartedAt in opslag na het opstarten', async () => {
  const chromeStub = makeChrome();
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__listeners.startup();
  await flush();
  assert.ok(chromeStub.__store.cycleStartedAt > 0, 'cycleStartedAt wordt vastgelegd');
});

test('een bestaande cycleStartedAt blijft behouden bij het laden', async () => {
  const startedAt = 1_700_000_000_000;
  const chromeStub = makeChrome({ cycleStartedAt: startedAt });
  await loadBackground(chromeStub);
  await flush();

  let state = null;
  chromeStub.__listeners.message({ type: 'getState' }, {}, (r) => { state = r; });
  assert.equal(state.cycleStartedAt, startedAt, 'de fase gaat niet terug naar het begin');
});

// --- de ontbrekende togglePause ---
test('togglePause bestaat en schrijft een tegengestelde waarde', async () => {
  const chromeStub = makeChrome({ paused: false });
  await loadBackground(chromeStub);
  await flush();

  assert.doesNotThrow(() => chromeStub.__listeners.message({ type: 'togglePause' }));
  await flush();
  assert.equal(chromeStub.__store.paused, true);
});

test('klik op het icoon bij een water-herinnering bevestigt in plaats van te pauzeren', async () => {
  const chromeStub = makeChrome({ paused: false, waterDue: true });
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__listeners.clicked();
  await flush();
  assert.equal(chromeStub.__store.waterDue, false, 'herinnering bevestigd');
  assert.equal(chromeStub.__store.paused, false, 'niet tegelijk gepauzeerd');
});