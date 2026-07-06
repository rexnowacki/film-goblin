// Pure lunar-phase arithmetic — no API, no dependency. Mean synodic month
// from a known new-moon epoch gives full-moon instants accurate to a few
// hours over decades, which is ample for a daily "is tonight a full moon"
// check with a ±12h window. Do not use for astronomy.

const SYNODIC_DAYS = 29.530588853;
// Well-documented new moon: 2000-01-06 18:14 UTC.
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
const FULL_OFFSET_DAYS = SYNODIC_DAYS / 2;
const DAY_MS = 86_400_000;
const WINDOW_MS = 12 * 60 * 60 * 1000; // ±12h around syzygy

/** True when any instant of the given UTC calendar day is within ±12h of a full moon. */
export function isFullMoonUTCDate(date: Date): boolean {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayEnd = dayStart + DAY_MS;

  // Nearest full-moon instant to the middle of this day.
  const mid = dayStart + DAY_MS / 2;
  const ageDays = (mid - NEW_MOON_EPOCH_MS) / DAY_MS;
  const cycles = Math.round((ageDays - FULL_OFFSET_DAYS) / SYNODIC_DAYS);
  const fullMs = NEW_MOON_EPOCH_MS + (cycles * SYNODIC_DAYS + FULL_OFFSET_DAYS) * DAY_MS;

  return fullMs + WINDOW_MS > dayStart && fullMs - WINDOW_MS < dayEnd;
}
