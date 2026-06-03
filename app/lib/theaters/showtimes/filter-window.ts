const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function withinWindow(startsAtIso: string, now: Date = new Date()): boolean {
  const startsAt = new Date(startsAtIso).getTime();
  if (Number.isNaN(startsAt)) return false;
  return startsAt >= now.getTime() && startsAt < now.getTime() + WINDOW_MS;
}
