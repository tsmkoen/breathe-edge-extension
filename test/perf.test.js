// Tests voor het volume aan werk dat de extensie op de achtergrond verricht.
//
// Een toolbar-icoon dat twintig keer per seconde een animatie verstuurt, lijkt
// goedkoop maar is dat niet: elk frame bestaat uit echte pixels die over de
// messaging-grens tussen het offscreen document en de service worker gaan. Deze
// tests leggen vast dat dat volume beperkt blijft, zodat een latere wijziging hem
// niet stil terugdraait.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const CHROME_BASE = { action: { setIcon: async () => {}, setTitle: async () => {} }, runtime: { sendMessage: async () => {} }, alarms: { create() {}, clear() {} }, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } } };

function makeOffscreenCanvas() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return ctx; }
  };
}

function makeChrome(initial = {}) {
  const store = { ...initial };
  const alarms = new Map();
  const listeners = {};
  const log = [];
  let setIconCalls = 0;
  return {
    storage: {
      local: {
        async get(keys) {
          const list = Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(store);
          const out = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        async set(obj) {
          // Een echte browser meldt elke wijziging via storage.onChanged; zonder
          // die melding zou de service worker zijn modulevariabelen nooit
          // bijwerken en lijkt het alsof de state vast blijft plakken.
          const changes = {};
          for (const [key, newValue] of Object.entries(obj)) {
            changes[key] = { oldValue: store[key], newValue };
            store[key] = newValue;
          }
          log.push({ set: obj });
          listeners.changed?.(changes, 'local');
          return obj;
        },
      },
      onChanged: { addListener(fn) { listeners.changed = fn; } },
    },
    alarms: {
      create(name, info) { alarms.set(name, info); },
      clear(name) { alarms.delete(name); },
      onAlarm: { addListener(fn) { listeners.alarm = fn; } },
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
      async setIcon() { setIconCalls++; },
      setTitle: async () => {},
    },
    offscreen: { hasDocument: async () => true, createDocument: async () => {} },
    __store: store,
    __alarms: alarms,
    __listeners: listeners,
    __log: log,
    get __setIconCalls() { return setIconCalls; },
  };
}

const stubs = [];
afterEach(() => {
  for (const s of stubs) {
    try { s.__listeners.message?.({ type: 'frame', imageData: {}, phase: 'inhale', progress: 0 }); } catch { /* al af */ }
  }
  stubs.length = 0;
  globalThis.chrome = CHROME_BASE;
  globalThis.OffscreenCanvas = makeOffscreenCanvas();
});

async function loadBackground(chromeStub) {
  globalThis.chrome = chromeStub;
  globalThis.OffscreenCanvas = makeOffscreenCanvas();
  const url = new URL('../background.js', import.meta.url).href;
  return import(`${url}?t=${Math.random()}`);
}
const flush = () => new Promise((r) => setTimeout(r, 0));

// --- het volume per frame ---
test('de toolbar gebruikt alleen de formaten die hij nodig heeft', async () => {
  const { SIZES } = await import('../icon-renderer.js');
  assert.deepEqual(SIZES, [16, 32], 'alleen 16 en 32; 64 is 76% van het volume voor weinig winst');
});

test('het frame-volume per seconde blijft laag', async () => {
  const { SIZES } = await import('../icon-renderer.js');
  const bytesPerFrame = SIZES.reduce((sum, s) => sum + s * s * 4, 0);
  const perSecond = (bytesPerFrame * 1000) / 50; // 20 fps
  // Vóór de optimalisatie was dit 420 KB/s.
  assert.ok(
    perSecond < 150 * 1024,
    `frame-volume ${(perSecond / 1024).toFixed(0)} KB/s blijft onder de 150 KB/s`
  );
});

test('extra formaten zijn optioneel en niet de standaard', async () => {
  const { renderImageData, SIZES_EXTRA } = await import('../icon-renderer.js');
  const base = renderImageData({ phase: 'inhale', progress: 0.5, settings: {} });
  assert.deepEqual(Object.keys(base).sort(), ['16', '32']);

  // Wie het icoon scherp wil op hoge resolutie kan ze er alsnog bij zetten.
  const withExtra = renderImageData({ phase: 'inhale', progress: 0.5, settings: {} }, SIZES_EXTRA);
  assert.deepEqual(Object.keys(withExtra).sort(), ['16', '32', '64']);
});

// --- geen werk voor een icoon dat niet verandert ---
test('een pauze-icoon wordt niet twintig keer per seconde opnieuw getekend', async () => {
  const chromeStub = makeChrome({ paused: true });
  stubs.push(chromeStub);
  await loadBackground(chromeStub);
  await flush();

  const frame = { type: 'frame', imageData: {}, phase: 'inhale', progress: 0.5 };
  for (let i = 0; i < 20; i++) chromeStub.__listeners.message(frame);

  assert.equal(
    chromeStub.__setIconCalls, 1,
    'twintig identieke frames leiden tot één setIcon-aanroep'
  );
});

test('een bewegende ring wordt wél elke keer opnieuw getekend', async () => {
  const chromeStub = makeChrome();
  stubs.push(chromeStub);
  await loadBackground(chromeStub);
  await flush();

  // Tijdens inademen loopt de voortgang op, dus elk frame ziet er anders uit.
  for (let i = 0; i <= 10; i++) {
    chromeStub.__listeners.message({ type: 'frame', imageData: {}, phase: 'inhale', progress: i / 10 });
  }
  assert.ok(chromeStub.__setIconCalls >= 10, 'de animatie blijft zichtbaar');
});

test('bij een water-herinnering stopt het tekenen, bij bevestigen niet', async () => {
  const chromeStub = makeChrome({ waterDue: true });
  stubs.push(chromeStub);
  await loadBackground(chromeStub);
  await flush();

  const frame = { type: 'frame', imageData: {}, phase: 'inhale', progress: 0.5 };
  for (let i = 0; i < 10; i++) chromeStub.__listeners.message(frame);
  assert.equal(chromeStub.__setIconCalls, 1, 'de druppel is statisch');

  // Bevestig je de herinnering, dan moet het icoon weer veranderen.
  chromeStub.__listeners.message({ type: 'waterDrunk' });
  await flush();
  chromeStub.__listeners.message({ ...frame, progress: 0.9 });
  assert.ok(chromeStub.__setIconCalls > 1, 'na bevestiging wordt weer getekend');
});

test('het pauzeren zelf tekent wel, want het icoon verandert', async () => {
  const chromeStub = makeChrome();
  stubs.push(chromeStub);
  await loadBackground(chromeStub);
  await flush();

  chromeStub.__listeners.message({ type: 'frame', imageData: {}, phase: 'inhale', progress: 0.5 });
  const before = chromeStub.__setIconCalls;

  chromeStub.__listeners.message({ type: 'togglePause' });
  await flush();
  chromeStub.__listeners.message({ type: 'frame', imageData: {}, phase: 'inhale', progress: 0.5 });

  assert.ok(chromeStub.__setIconCalls > before, 'na pauzeren verandert het icoon');
});