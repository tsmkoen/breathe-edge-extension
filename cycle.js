// Breathe — ademhalingscyclus (pure logica, testbaar in Node)
// Ondersteunt: inademen → (optioneel) vasthouden → uitademen, in een loop.

export const DEFAULT_SETTINGS = {
  inhaleSec: 4,
  holdSec: 0,
  exhaleSec: 6,
  widgetEnabled: false, // widget in de pagina: standaard UIT (alles via toolbar-icoon)
  widgetSize: 26, // px
  pageFrame: true, // subtiel kader rond het venster bij een actieve herinnering
  colors: 'default', // 'default' | 'soft'
  // Let op: dit is de enige bron van waarheid voor de standaardinstellingen.
  // options.js importeert DEFAULT_SETTINGS; widget.js dupliceert ze omdat een
  // content script geen modules kan laden — houd dat blok synchroon.
  waterReminderMin: 60, // 0 = uit — standaard "elk uur", zoals de opties-pagina liet zien
  breatheReminderMin: 0, // 0 = uit
  eyeReminderMin: 20, // 20-20-20 oogregel: 0 = uit
  standReminderMin: 60, // opsta-herinnering: 0 = uit
};

/** Bouwt een cyclus op basis van instellingen (seconden). */
export function cycleFromSettings(s) {
  const inhaleMs = Math.max(1, Math.round(s.inhaleSec)) * 1000;
  const holdMs = Math.max(0, Math.round(s.holdSec)) * 1000;
  const exhaleMs = Math.max(1, Math.round(s.exhaleSec)) * 1000;
  const total = inhaleMs + holdMs + exhaleMs;
  return {
    inhaleMs,
    holdMs,
    exhaleMs,
    total,
    /**
     * Bepaalt de fase voor een verstreken tijd (ms) binnen de cyclus.
     * @returns {{ phase: 'inhale'|'hold'|'exhale', inhaling: boolean, progress: number }}
     *   progress: 0..1 — inademen 0→1, vasthouden = 1 (volle ring), uitademen 1→0
     */
    phaseAt(elapsed) {
      const t = ((elapsed % total) + total) % total;
      if (t < inhaleMs) return { phase: 'inhale', inhaling: true, progress: t / inhaleMs };
      if (t < inhaleMs + holdMs) return { phase: 'hold', inhaling: true, progress: 1 };
      return { phase: 'exhale', inhaling: false, progress: 1 - (t - inhaleMs - holdMs) / exhaleMs };
    },
  };
}
