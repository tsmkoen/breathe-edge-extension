// Breathe — timing/cyclus-logica (pure functies, ook testbaar in Node)
export const INHALE_MS = 4000; // 4s inademen
export const EXHALE_MS = 6000; // 6s uitademen
export const CYCLE_MS = INHALE_MS + EXHALE_MS;
const INHALE_FRACTION = INHALE_MS / CYCLE_MS;

/**
 * Bepaalt de fase voor een verstreken tijd (ms) binnen de cyclus.
 * @param {number} elapsed - verstreken tijd in ms (mag groter zijn dan CYCLE_MS of negatief)
 * @returns {{ inhaling: boolean, progress: number }}
 *   inhaling: true tijdens de inademfase
 *   progress: 0..1 — bij inademen oplopend 0→1, bij uitademen aflopend 1→0
 */
export function phaseAt(elapsed) {
  const t = ((elapsed % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const inhaling = t < INHALE_MS;
  const local = inhaling ? t / INHALE_MS : (t - INHALE_MS) / EXHALE_MS;
  return { inhaling, progress: inhaling ? local : 1 - local };
}
