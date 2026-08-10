// Breathe — background service worker (Manifest V3)
// De animatie zelf draait in een offscreen document (offscreen.html/offscreen.js),
// want een MV3 service worker wordt na ~30s in slaap gezet.
// Deze SW doet alleen: offscreen document beheren + het toolbar-icoon zetten.
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
// Berichten van de widget: pauze togglen via storage (offscreen + widget luisteren mee).
chrome.runtime.onMessage.addListener((msg) => {
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
    chrome.storage.local.set({ paused: !paused });
  });
}
