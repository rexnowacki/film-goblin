// Daily NEXT IN THE PIT review progress. The browser supplies localStorage,
// while tests inject a tiny in-memory implementation. Storage is only a
// convenience: unavailable/corrupt storage must never break the queue.

export interface ReturnContractProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ReturnContractProgressScope {
  userId: string;
  utcDay: string;
}

interface StoredReturnContractProgress {
  utcDay: string;
  reviewedKeys: string[];
}

const STORAGE_PREFIX = "fg_return_contract_progress:";

export function returnContractProgressStorageKey(userId: string, utcDay: string): string {
  return `${STORAGE_PREFIX}${userId}:${utcDay}`;
}

function isStoredProgress(value: unknown): value is StoredReturnContractProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredReturnContractProgress>;
  return typeof candidate.utcDay === "string"
    && Array.isArray(candidate.reviewedKeys)
    && candidate.reviewedKeys.every(key => typeof key === "string" && key.length > 0 && key.length <= 160);
}

export function readReturnContractProgress(
  storage: ReturnContractProgressStorage | null,
  userId: string,
  utcDay: string,
): Set<string> {
  try {
    if (!storage) return new Set();
    const raw = storage.getItem(returnContractProgressStorageKey(userId, utcDay));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredProgress(parsed) || parsed.utcDay !== utcDay) return new Set();
    return new Set(parsed.reviewedKeys);
  } catch {
    return new Set();
  }
}

export function reconcileReturnContractProgress(
  storage: ReturnContractProgressStorage | null,
  scope: ReturnContractProgressScope,
  previousScope: ReturnContractProgressScope | null,
  currentMountProgress: Iterable<string> = [],
): Set<string> {
  const reviewed = readReturnContractProgress(storage, scope.userId, scope.utcDay);
  if (previousScope?.userId === scope.userId && previousScope.utcDay === scope.utcDay) {
    for (const key of currentMountProgress) reviewed.add(key);
  }
  return reviewed;
}

export function markReturnContractReviewed(
  storage: ReturnContractProgressStorage | null,
  userId: string,
  utcDay: string,
  contractKey: string,
  currentMountProgress: Iterable<string> = [],
): Set<string> {
  const reviewed = readReturnContractProgress(storage, userId, utcDay);
  for (const key of currentMountProgress) reviewed.add(key);
  reviewed.add(contractKey);

  try {
    storage?.setItem(returnContractProgressStorageKey(userId, utcDay), JSON.stringify({
      utcDay,
      reviewedKeys: [...reviewed],
    } satisfies StoredReturnContractProgress));
  } catch {
    // Keep the returned in-memory set useful even when Safari denies storage.
  }

  return reviewed;
}

export function firstUnreviewedReturnContractIndex(
  contractKeys: readonly string[],
  reviewedKeys: ReadonlySet<string>,
): number {
  return contractKeys.findIndex(key => !reviewedKeys.has(key));
}

export function isReturnContractQueueExhausted(
  contractKeys: readonly string[],
  reviewedKeys: ReadonlySet<string>,
): boolean {
  return contractKeys.length > 0 && contractKeys.every(key => reviewedKeys.has(key));
}
