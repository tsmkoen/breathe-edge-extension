// Breathe — background service worker (Manifest V3)
// De animatie zelf draait in een offscreen document (offscreen.html/offscreen.js),
// want een MV3 service worker wordt na ~30s in slaap gezet.
// Deze SW doet: offscreen document beheren, toolbar-icoon zetten, en de
// pauze-status beheren (storage) die via berichten naar het offscreen document
// en via storage-events naar de widget in de pagina gaat.
const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen() {
  try {
    if (typeof chrome.offscreen?.hasDocument === 'function') {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
    }
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas-animatie (rAF) voor het geanimeerde Breathe toolbar-icoon.',
    });
  } catch {
    // Document bestaat al of offscreen wordt niet ondersteund — niets te doen.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
});

// Frames van het offscreen document: icoon + tooltip bijwerken.
// Statusaanvraag van het offscreen document: huidige pauze-status teruggeven.
// Toggle van de widget (of toolbar-icoon): pauze omzetten via storage + doorgeven.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'frame') {
    try {
      chrome.action.setIcon({ imageData: msg.imageData });
    } catch {
      // volgende frame probeert opnieuw
    }
    const title = msg.paused
      ? 'Breathe — gepauzeerd (klik om te hervatten)'
      : msg.inhaling
        ? 'Breathe — inademen (4s)'
        : 'Breathe — uitademen (6s)';
    chrome.action.setTitle({ title });
  } else if (msg?.type === 'getState') {
    chrome.storage.local.get('paused').then(({ paused }) => {
      sendResponse({ paused: !!paused });
    });
    return true; // async sendResponse
  } else if (msg?.type === 'togglePause') {
    togglePause();
  }
});

// Klik op het toolbar-icoon = pauzeren/hervatten (geen popup).
chrome.action.onClicked.addListener(() => {
  togglePause();
});

function togglePause() {
  chrome.storage.local.get('paused').then(({ paused }) => {
    const next = !paused;
    chrome.storage.local.set({ paused: next });
    // Doorgeven aan het offscreen document (heeft geen storage-toegang)
    chrome.runtime.sendMessage({ type: 'setPaused', paused: next }).catch(() => {});
  });
}
