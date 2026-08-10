// Breathe — opties-pagina: laadt en bewaart instellingen in chrome.storage.local.
(() => {
  const DEFAULTS = {
    inhaleSec: 4,
    holdSec: 0,
    exhaleSec: 6,
    widgetEnabled: true,
    widgetSize: 26,
    colors: 'default',
    waterReminderMin: 60,
    breatheReminderMin: 0,
    eyeReminderMin: 20,
    standReminderMin: 60,
  };

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');

  function showStatus(msg) {
    statusEl.textContent = msg;
    setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = '';
    }, 2500);
  }

  chrome.storage.local.get('settings').then((v) => {
    const s = { ...DEFAULTS, ...(v.settings || {}) };
    $('inhaleSec').value = s.inhaleSec;
    $('holdSec').value = s.holdSec;
    $('exhaleSec').value = s.exhaleSec;
    $('widgetEnabled').checked = !!s.widgetEnabled;
    $('widgetSize').value = String(s.widgetSize);
    const colorRadio = document.querySelector(`input[name="colors"][value="${s.colors}"]`);
    if (colorRadio) colorRadio.checked = true;
    $('breatheReminderMin').value = String(s.breatheReminderMin);
    $('waterReminderMin').value = String(s.waterReminderMin);
    $('eyeReminderMin').value = String(s.eyeReminderMin);
    $('standReminderMin').value = String(s.standReminderMin);
  });

  $('save').addEventListener('click', () => {
    const settings = {
      inhaleSec: Math.max(1, Math.min(30, parseInt($('inhaleSec').value, 10) || 4)),
      holdSec: Math.max(0, Math.min(30, parseInt($('holdSec').value, 10) || 0)),
      exhaleSec: Math.max(1, Math.min(30, parseInt($('exhaleSec').value, 10) || 6)),
      widgetEnabled: $('widgetEnabled').checked,
      widgetSize: parseInt($('widgetSize').value, 10) || 26,
      colors: document.querySelector('input[name="colors"]:checked')?.value || 'default',
      breatheReminderMin: parseInt($('breatheReminderMin').value, 10) || 0,
      waterReminderMin: parseInt($('waterReminderMin').value, 10) || 0,
      eyeReminderMin: parseInt($('eyeReminderMin').value, 10) || 0,
      standReminderMin: parseInt($('standReminderMin').value, 10) || 0,
    };
    chrome.storage.local.set({ settings }).then(() => {
      showStatus('Opgeslagen ✓ — wijzigingen zijn direct actief.');
    });
  });
})();
