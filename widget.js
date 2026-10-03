// Breathe — kleine discrete ademhalingswidget in de pagina (content script).
// Toont dezelfde cyclus als het toolbar-icoon (instelbaar: inhale/hold/exhale).
// - Slepen: verplaats de widget naar een hoek van je scherm (positie wordt onthouden)
// - Klik: pauzeren/hervatten — MAAR als een herinnering actief is: die bevestigen
//
// Een content script kan geen statische imports gebruiken, maar wél een dynamic
// import met chrome.runtime.getURL. Daarmee deelt dit bestand de cycluslogica
// en de pictogrammen met de service worker in plaats van ze te dupliceren.
// De modules zijn daarom als web_accessible_resources in de manifest opgenomen.
(async () => {
  if (window.__breatheWidgetInstalled) return;
  window.__breatheWidgetInstalled = true;

  const CANVAS = 96; // interne resolutie (scherp op elk scherm)

  // --- gedeelde modules laden (cycle.js + drawing.js) ---
  let DEFAULT_SETTINGS, cycleFromSettings, paletteFor, symbolBackground, drawDrop, drawPerson,
      drawEye, drawPause, drawBreathRing;
  try {
    [{ DEFAULT_SETTINGS, cycleFromSettings }, drawing] = await Promise.all([
      import(chrome.runtime.getURL('cycle.js')),
      import(chrome.runtime.getURL('drawing.js')),
    ]);
    ({ paletteFor, symbolBackground, drawDrop, drawPerson, drawEye, drawPause, drawBreathRing } = drawing);
  } catch (e) {
    // Zonder de modules kan de widget niet betrouwbaar tekenen. Liever niets
    // tonen dan een kapotte widget: het toolbar-icoon blijft gewoon werken.
    console.error('[Breathe] widget kon de gedeelde modules niet laden:', e?.message || e);
    return;
  }

  const DEFAULTS = DEFAULT_SETTINGS;

  let settings = { ...DEFAULTS };
  let paused = false;
  let waterDue = false;
  let remind = false;
  let eyeDue = false;
  let standDue = false;
  let cycleStartedAt = 0;
  let cycle = cycleFromSettings(settings);
  let lastTitleKey = '';
  let mounted = false;

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
    cycle = cycleFromSettings(settings);
  }

  function updateTitle() {
    let key;
    let title;
    if (waterDue) {
      key = 'water';
      title = '💧 Tijd voor een glas water — klik om te bevestigen';
    } else if (standDue) {
      key = 'stand';
      title = '🧍 Tijd om even op te staan en te bewegen — klik om te bevestigen';
    } else if (eyeDue) {
      key = 'eye';
      title = '👀 20-20-20: kijk 20 seconden in de verte — klik om te bevestigen';
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

  // --- pagina-kader: subtiele zacht pulserende rand rond het venster bij een
  // actieve herinnering (water/opstaan/ogen) — onafhankelijk van de widget ---
  const frameHost = document.createElement('div');
  frameHost.id = '__breathe_frame__';
  const frameShadow = frameHost.attachShadow({ mode: 'closed' });
  frameShadow.innerHTML = `
    <style>
      .frame {
        position: fixed; inset: 0; pointer-events: none; box-sizing: border-box;
        z-index: 2147483647; opacity: 0; transition: opacity .5s;
      }
      .frame.visible {
        opacity: 1;
        animation: breathePulse 2.4s ease-in-out infinite;
      }
      @keyframes breathePulse {
        0%, 100% { opacity: .45; }
        50% { opacity: 1; }
      }
    </style>
    <div class="frame"></div>
  `;
  const frame = frameShadow.querySelector('.frame');
  let frameMounted = false;

  function mountFrame() {
    if (frameMounted || !settings.pageFrame) return;
    frameMounted = true;
    (document.body || document.documentElement).appendChild(frameHost);
  }
  function unmountFrame() {
    if (!frameMounted) return;
    frameMounted = false;
    if (frameHost.parentNode) frameHost.parentNode.removeChild(frameHost);
  }
  function updateFrame() {
    const pal = paletteFor(settings);
    let color = null;
    if (waterDue) color = pal.water;
    else if (standDue) color = pal.stand;
    else if (eyeDue) color = pal.eye;
    if (color) {
      frame.style.border = `3px solid ${color}`;
      frame.style.boxShadow = `0 0 16px ${color}55`;
      frame.classList.add('visible');
    } else {
      frame.classList.remove('visible');
    }
  }

  // --- state uit storage (content scripts mogen storage wél gebruiken) ---
  /** Tijdgestabiliseerde cyclus: loopt gelijk met het toolbar-icoon. */
  function cycleElapsed() {
    return cycleStartedAt ? Date.now() - cycleStartedAt : 0;
  }

  function applyStorage(v) {
    if (v.settings) settings = { ...DEFAULTS, ...v.settings };
    paused = !!v.paused;
    waterDue = !!v.waterDue;
    // De adem-herinnering is tijdelijk: een `remind` zonder geldig `remindUntil`
    // is een achtergebleven restje van een afgebroken sessie en wordt genegeerd.
    remind = !!v.remind && typeof v.remindUntil === 'number' && v.remindUntil > Date.now();
    eyeDue = !!v.eyeDue;
    standDue = !!v.standDue;
    cycleStartedAt = v.cycleStartedAt || Date.now();
    if (v.widgetPos) {
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      wrap.style.left = `${v.widgetPos.left}px`;
      wrap.style.top = `${v.widgetPos.top}px`;
    }
    applySettings();
    updateTitle();
    mountFrame();
    updateFrame();
    mount();
  }

  const STORAGE_KEYS = [
    'settings', 'paused', 'waterDue', 'remind', 'remindUntil',
    'eyeDue', 'standDue', 'widgetPos', 'cycleStartedAt',
  ];
  chrome.storage.local.get(STORAGE_KEYS).then(applyStorage);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = { ...DEFAULTS, ...changes.settings.newValue };
      applySettings();
      if (settings.widgetEnabled) mount();
      else unmount();
      if (settings.pageFrame) mountFrame();
      else unmountFrame();
    }
    if (changes.paused) paused = !!changes.paused.newValue;
    if (changes.waterDue) waterDue = !!changes.waterDue.newValue;
    if (changes.remind) remind = !!changes.remind.newValue;
    if (changes.remindUntil) {
      const until = typeof changes.remindUntil.newValue === 'number' ? changes.remindUntil.newValue : 0;
      remind = remind && until > Date.now();
    }
    if (changes.eyeDue) eyeDue = !!changes.eyeDue.newValue;
    if (changes.standDue) standDue = !!changes.standDue.newValue;
    if (changes.cycleStartedAt) cycleStartedAt = changes.cycleStartedAt.newValue || Date.now();
    updateFrame();
    updateTitle();
  });

  // --- tekenen ---
  function draw() {
    const pal = paletteFor(settings);
    const cx = CANVAS / 2;
    const cy = CANVAS / 2;
    ctx.clearRect(0, 0, CANVAS, CANVAS);

    // herinnerings-pictogrammen: 💧 water, 🧍 opstaan, 👀 ogen, ⏸ pauze
    if (waterDue) {
      symbolBackground(ctx, cx, cy, CANVAS, pal.water);
      drawDrop(ctx, cx, cy, CANVAS, '#ffffff');
      return;
    }
    if (standDue) {
      symbolBackground(ctx, cx, cy, CANVAS, pal.stand);
      drawPerson(ctx, cx, cy, CANVAS, '#ffffff');
      return;
    }
    if (eyeDue) {
      symbolBackground(ctx, cx, cy, CANVAS, pal.eye);
      drawEye(ctx, cx, cy, CANVAS, pal.eye);
      return;
    }
    if (paused) {
      symbolBackground(ctx, cx, cy, CANVAS, pal.paused);
      drawPause(ctx, cx, cy, CANVAS, '#ffffff');
      return;
    }

    // ademhalingsring — dezelfde tekenaar als het toolbar-icoon
    const { phase, progress } = cycle.phaseAt(cycleElapsed());
    const { radius, stroke, color } = drawBreathRing(ctx, CANVAS, phase, progress, pal, { halo: remind });

    // gevulde kern die groeit (inademen) en krimpt (uitademen) — extra duidelijk
    const rMin = CANVAS * 0.06;
    const rMax = radius - stroke * 0.9;
    const r = rMin + (rMax - rMin) * progress;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    if (!mounted) return;
    draw();
    requestAnimationFrame(loop);
  }

  // --- widget aan/uit (op basis van opgeslagen instelling) ---
  function mount() {
    if (mounted || !settings.widgetEnabled) return;
    mounted = true;
    (document.body || document.documentElement).appendChild(host);
    requestAnimationFrame(loop);
    updateTitle();
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    if (host.parentNode) host.parentNode.removeChild(host);
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
    } else if (standDue) {
      // teal widget = opsta-reminder actief: klik bevestigt "opgestaan"
      chrome.runtime.sendMessage({ type: 'standDone' }).catch?.(() => {});
    } else if (eyeDue) {
      // violette widget = oog-reminder (20-20-20) actief: klik bevestigt "weggekeken"
      chrome.runtime.sendMessage({ type: 'eyeDone' }).catch?.(() => {});
    } else {
      chrome.runtime.sendMessage({ type: 'togglePause' }).catch?.(() => {});
    }
  });
})();