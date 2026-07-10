const STORAGE_KEY = "fg_product_session";
const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProductSession {
  id: string;
  startedAt: number;
  lastActiveAt: number;
  isNew: boolean;
}

interface StoredSession {
  id: string;
  startedAt: number;
  lastActiveAt: number;
}

function fresh(nowMs: number, randomUUID: () => string): ProductSession {
  return { id: randomUUID(), startedAt: nowMs, lastActiveAt: nowMs, isNew: true };
}

export function getOrCreateProductSession(
  storage: StorageLike,
  nowMs = Date.now(),
  randomUUID: () => string = () => crypto.randomUUID(),
): ProductSession {
  let stored: StoredSession | null = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as StoredSession;
  } catch {
    stored = null;
  }

  const valid = stored
    && typeof stored.id === "string"
    && Number.isFinite(stored.startedAt)
    && Number.isFinite(stored.lastActiveAt)
    && nowMs >= stored.lastActiveAt
    && nowMs - stored.lastActiveAt < SESSION_IDLE_MS;

  const session = valid
    ? { ...stored!, lastActiveAt: nowMs, isNew: false }
    : fresh(nowMs, randomUUID);
  storage.setItem(STORAGE_KEY, JSON.stringify({
    id: session.id,
    startedAt: session.startedAt,
    lastActiveAt: session.lastActiveAt,
  }));
  return session;
}

export function touchProductSession(storage: StorageLike, session: ProductSession, nowMs = Date.now()): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({
    id: session.id,
    startedAt: session.startedAt,
    lastActiveAt: nowMs,
  }));
}
