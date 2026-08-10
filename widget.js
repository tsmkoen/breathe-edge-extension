// Breathe — kleine discrete ademhalingswidget in de pagina (content script).
// Toont dezelfde cyclus als het toolbar-icoon (instelbaar: inhale/hold/exhale).
// - Slepen: verplaats de widget naar een hoek van je scherm (positie wordt onthouden)
// - Klik: pauzeren/hervatten — MAAR als de water-reminder actief is: "gedronken" bevestigen
(() => {
  if (window.__breatheWidgetInstalled) return;
  window.__breatheWidgetInstalled = true;

  // --- defaults + formule (duplicaat van cycle.js; content scripts kunnen geen modules laden) ---
  const DEFAULTS = {
    inhaleSec: 4, holdSec: 0, exhaleSec: 6,
    widgetEnabled: true, widgetSize: 26, colors: 'default',
    waterReminderMin: 0, breatheReminderMin: 0,
  };
  function makeCycle(s) {
    const inhaleMs = Math.max(1, Math.round(s.inhaleSec)) * 1000;
    const holdMs = Math.max(0, Math.round(s.holdSec)) * 1000;
    const exhaleMs = Math.max(1, Math.round(s.exhaleSec)) * 1000;
    const total = inhaleMs + holdMs + exhaleMs;
    return {
      inhaleMs, holdMs, exhaleMs, total,
      phaseAt(elapsed) {
        const t = ((elapsed % total) + total) % total;
        if (t < inhaleMs) return { phase: 'inhale', inhaling: true, progress: t / inhaleMs };
        if (t < inhaleMs + holdMs) return { phase: 'hold', inhaling: true, progress: 1 };
        return { phase: 'exhale', inhaling: false, progress: 1 - (t - inhaleMs - holdMs) / exhaleMs };
      },
    };
  }
  // duplicaat van de kleurenpaletten in icon-renderer.js — houd synchroon
  const PALETTES = {
    default: { inhale: '#22c55e', exhale: '#3b82f6', hold: '#f59e0b', water: '#ef4444', paused: '#9ca3af', track: 'rgba(128,128,128,0.30)', halo: 'rgba(255,255,255,0.45)' },
    soft: { inhale: '#7fb69a', exhale: '#8ab4d8', hold: '#e2c07e', water: '#e08a8a', paused: '#b0b0b0', track: 'rgba(128,128,128,0.24)', halo: 'rgba(255,255,255,0.35)' },
  };

  const CANVAS = 96; // interne resolutie (scherp op elk scherm)

  let settings = { ...DEFAULTS };
  let paused = false;
  let waterDue = false;
  let remind = false;
  let cycle = makeCycle(settings);
  let lastTitleKey = '';

  const host = document.createElement('div');
  host.id = '__breathe_widget__';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .wrap {
        position: fixed; right: 14px; bottom: 14px;
        width: ${settings.widgetSize}px; height: ${settings.widgetSize}px;
        z-index: 2147483647; cursor: grab; opacity: .9;
        user-select: none; -webkit-user-select: none; touch-action: none;
      }
      .wrap.dragging { cursor: grabbing; }
      canvas { display: block; width: 100%; height: 100%; }
    </style>
    <div class="wrap" title="Breathe — ademhaling (klik = pauze, slepen = verplaatsen)">
      <canvas width="${CANVAS}" height="${CANVAS}"></canvas>
    </div>
  `;

  const wrap = shadow.querySelector('.wrap');
  const canvas = shadow.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  function applySettings() {
    wrap.style.width = `${settings.widgetSize}px`;
    wrap.style.height = `${settings.widgetSize}px`;
    cycle = makeCycle(settings);
  }

  function updateTitle() {
    let key;
    let title;
    if (waterDue) {
      key = 'water';
      title = '💧 Tijd voor een glas water — klik om te bevestigen';
    } else if (paused) {
      key = 'paused';
      title = 'Breathe — gepauzeerd (klik om te hervatten)';
    } else if (remind) {
      key = 'remind';
      title = 'Breathe — tijd voor een paar rustige ademhalingen';
    } else {
      key = 'phase';
      title = 'Breathe — ademhaling (klik = pauze, slepen = verplaatsen)';
    }
    if (key !== lastTitleKey) {
      lastTitleKey = key;
      wrap.setAttribute('title', title);
    }
  }

  // --- state uit storage (content scripts mogen storage wél gebruiken) ---
  chrome.storage.local.get(['settings', 'paused', 'waterDue', 'remind', 'widgetPos']).then((v) => {
    if (v.settings) settings = { ...DEFAULTS, ...v.settings };
    paused = !!v.paused;
    waterDue = !!v.waterDue;
    remind = !!v.remind;
    if (v.widgetPos) {
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = `${v.widgetPos.left}px`;
      wrap.style.top = `${v.widgetPos.top}px`;
    }
    applySettings();
    updateTitle();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = { ...DEFAULTS, ...changes.settings.newValue };
      applySettings();
    }
    if (changes.paused) paused = !!changes.paused.newValue;
    if (changes.waterDue) waterDue = !!changes.waterDue.newValue;
    if (changes.remind) remind = !!changes.remind.newValue;
    updateTitle();
  });

  // --- tekenen ---
  function draw(now) {
    const pal = PALETTES[settings.colors === 'soft' ? 'soft' : 'default'];
    const { phase, progress } = cycle.phaseAt(now);
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    const cx = CANVAS / 2;
    const cy = CANVAS / 2;
    const stroke = CANVAS * 0.1;
    const radius = CANVAS / 2 - CANVAS * 0.07;
    const mid = radius - stroke / 2;

    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';

    if (remind && !paused) {
      ctx.strokeStyle = pal.halo;
      ctx.beginPath();
      ctx.arc(cx, cy, mid + stroke * 0.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // achtergrondring: rood bij water-reminder
    ctx.strokeStyle = waterDue ? pal.water : pal.track;
    ctx.beginPath();
    ctx.arc(cx, cy, mid, 0, Math.PI * 2);
    ctx.stroke();

    if (paused) {
      ctx.fillStyle = pal.paused;
      ctx.beginPath();
      ctx.arc(cx, cy, CANVAS * 0.09, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // voortgangsboog (kleur per fase)
    const color = phase === 'hold' ? pal.hold : phase === 'inhale' ? pal.inhale : pal.exhale;
    ctx.strokeStyle = color;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * progress;
    ctx.beginPath();
    ctx.arc(cx, cy, mid, start, end);
    ctx.stroke();

    // gevulde kern die groeit (inademen) en krimpt (uitademen) — extra duidelijk
    const rMin = CANVAS * 0.06;
    const rMax = mid - stroke * 0.9;
    const r = rMin + (rMax - rMin) * progress;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop(now) {
    draw(now);
    requestAnimationFrame(loop);
  }

  // --- widget aan/uit ---
  if (settings.widgetEnabled) {
    (document.body || document.documentElement).appendChild(host);
    requestAnimationFrame(loop);
    updateTitle();
  }

  // --- slepen + klik ---
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  wrap.addEventListener('mousedown', (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const r = wrap.getBoundingClientRect();
    startLeft = r.left;
    startTop = r.top;
    wrap.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (moved) {
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = `${Math.max(0, startLeft + dx)}px`;
      wrap.style.top = `${Math.max(0, startTop + dy)}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('dragging');
    if (moved) {
      // positie onthouden voor volgende pagina's
      chrome.storage.local.set({
        widgetPos: { left: parseFloat(wrap.style.left) || 0, top: parseFloat(wrap.style.top) || 0 },
      }).catch?.(() => {});
    } else if (waterDue) {
      // rode widget = water-reminder actief: klik bevestigt "gedronken"
      chrome.runtime.sendMessage({ type: 'waterDrunk' }).catch?.(() => {});
    } else {
      chrome.runtime.sendMessage({ type: 'togglePause' }).catch?.(() => {});
    }
  });
})();
