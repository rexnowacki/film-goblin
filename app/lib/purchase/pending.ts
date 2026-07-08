// Pending buy-click queue for The Claiming (spec 2026-07-07). Pure functions
// over an injected StorageLike so the logic is testable without a browser;
// callers pass window.localStorage. Every operation swallows storage errors
// (private-mode Safari etc.) — the feature degrades to "no prompt", never
// breaks the page.

export interface PendingBuy {
  filmId: string;
  title: string;
  price: number | null; // price shown at click time; null if the surface had none
  clickedAt: string;    // ISO timestamp
  deferred?: boolean;   // dismissed once already — one more ask, then drop
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "fg_pending_buys";
const MAX_QUEUE = 10;
export const MIN_AGE_MS = 2 * 60 * 1000;       // don't ambush an instant bounce-back
export const MAX_AGE_MS = 48 * 60 * 60 * 1000; // stale questions die

function read(storage: StorageLike): PendingBuy[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PendingBuy =>
        !!e && typeof e === "object" &&
        typeof (e as PendingBuy).filmId === "string" &&
        typeof (e as PendingBuy).clickedAt === "string"
    );
  } catch {
    return [];
  }
}

function write(storage: StorageLike, entries: PendingBuy[]): void {
  try {
    storage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — degrade silently */
  }
}

export function addPendingBuy(storage: StorageLike, buy: Omit<PendingBuy, "deferred">): void {
  const entries = read(storage).filter(e => e.filmId !== buy.filmId);
  entries.push({ ...buy });
  while (entries.length > MAX_QUEUE) entries.shift();
  write(storage, entries);
}

/** Most recent entry inside the (2min, 48h) window; expired entries pruned. */
export function nextEligibleBuy(storage: StorageLike, now: Date): PendingBuy | null {
  const entries = read(storage);
  const fresh = entries.filter(e => {
    const age = now.getTime() - Date.parse(e.clickedAt);
    return Number.isFinite(age) && age < MAX_AGE_MS;
  });
  if (fresh.length !== entries.length) write(storage, fresh);
  const eligible = fresh.filter(e => now.getTime() - Date.parse(e.clickedAt) > MIN_AGE_MS);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (Date.parse(b.clickedAt) > Date.parse(a.clickedAt) ? b : a));
}

export function resolvePendingBuy(
  storage: StorageLike,
  filmId: string,
  outcome: "confirmed" | "declined" | "dismissed",
): void {
  const entries = read(storage);
  const idx = entries.findIndex(e => e.filmId === filmId);
  if (idx === -1) return;
  if (outcome === "dismissed" && !entries[idx].deferred) {
    entries[idx] = { ...entries[idx], deferred: true };
  } else {
    entries.splice(idx, 1);
  }
  write(storage, entries);
}
