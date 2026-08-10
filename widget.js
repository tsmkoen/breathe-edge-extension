// Breathe — kleine discrete ademhalingswidget in de pagina (content script).
// Toont dezelfde 4s/6s-cyclus als het toolbar-icoon: groen oplopend, blauw aflopend.
// - Slepen: verplaats de widget naar een hoek van je scherm
// - Klik: pauzeren/hervatten (gesynchroniseerd met het toolbar-icoon)
(() => {
  if (window.__breatheWidgetInstalled) return;
  window.__breatheWidgetInstalled = true;

  // Duplicaat van de formule uit cycle.js (content scripts kunnen geen ES-modules laden)
  const INHALE_MS = 4000;
  const EXHALE_MS = 6000;
  const CYCLE_MS = INHALE_MS + EXHALE_MS;
  function phaseAt(elapsed) {
    const t = ((elapsed % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
    const inhaling = t < INHALE_MS;
    const local = inhaling ? t / INHALE_MS : (t - INHALE_MS) / EXHALE_MS;
    return { inhaling, progress: inhaling ? local : 1 - local };
  }

  const CANVAS = 96; // interne resolutie (scherp op elk scherm)
  const CSS = 26; // weergavegrootte in pixels

  let paused = false;

  const host = document.createElement('div');
  host.id = '__breathe_widget__';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .wrap {
        position: fixed; right: 14px; bottom: 14px;
        width: ${CSS}px; height: ${CSS}px;
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
  (document.body || document.documentElement).appendChild(host);

  const wrap = shadow.querySelector('.wrap');
  const canvas = shadow.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  // Pauze-status synchroniseren via chrome.storage
  chrome.storage.local.get('paused').then((v) => {
    paused = !!v.paused;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.paused) paused = !!changes.paused.newValue;
  });

  function draw(now) {
    const { inhaling, progress } = phaseAt(now);
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    const cx = CANVAS / 2;
    const cy = CANVAS / 2;
    const stroke = CANVAS * 0.1;
    const radius = CANVAS / 2 - CANVAS * 0.07;
    const mid = radius - stroke / 2;

    // achtergrondring
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.30)';
    ctx.beginPath();
    ctx.arc(cx, cy, mid, 0, Math.PI * 2);
    ctx.stroke();

    if (paused) {
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.arc(cx, cy, CANVAS * 0.09, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // voortgangsboog
    ctx.strokeStyle = inhaling ? '#22c55e' : '#3b82f6';
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * progress;
    ctx.beginPath();
    ctx.arc(cx, cy, mid, start, end);
    ctx.stroke();

    // gevulde kern die groeit (inademen) en krimpt (uitademen) — extra duidelijk
    const rMin = CANVAS * 0.06;
    const rMax = mid - stroke * 0.9;
    const r = rMin + (rMax - rMin) * progress;
    ctx.fillStyle = inhaling ? '#22c55e' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop(now) {
    draw(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Slepen + klik (klik zonder verplaatsing = pauze togglen)
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
    if (!moved) {
      chrome.runtime.sendMessage({ type: 'togglePause' }).catch(() => {});
    }
  });
})();
