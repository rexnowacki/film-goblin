import { describe, expect, it } from "vitest";
import {
  firstUnreviewedReturnContractIndex,
  isReturnContractQueueExhausted,
  markReturnContractReviewed,
  readReturnContractProgress,
  reconcileReturnContractProgress,
  returnContractProgressStorageKey,
  type ReturnContractProgressScope,
  type ReturnContractProgressStorage,
} from "@/lib/return-contract/progress";

function memStorage(): ReturnContractProgressStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function brokenStorage(): ReturnContractProgressStorage {
  return {
    getItem: () => { throw new Error("storage denied"); },
    setItem: () => { throw new Error("storage denied"); },
  };
}

const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const DAY = "2026-07-11";

describe("return-contract daily progress", () => {
  it("persists reviewed keys for the same user and UTC day without duplicates", () => {
    const storage = memStorage();

    let reviewed = markReturnContractReviewed(storage, USER_A, DAY, "recommendation:a");
    reviewed = markReturnContractReviewed(storage, USER_A, DAY, "recommendation:a", reviewed);
    reviewed = markReturnContractReviewed(storage, USER_A, DAY, "daily_omen:2026-07-11", reviewed);

    expect([...reviewed]).toEqual(["recommendation:a", "daily_omen:2026-07-11"]);
    expect([...readReturnContractProgress(storage, USER_A, DAY)]).toEqual([
      "recommendation:a",
      "daily_omen:2026-07-11",
    ]);
  });

  it("resets progress at the next UTC day", () => {
    const storage = memStorage();
    markReturnContractReviewed(storage, USER_A, DAY, "daily_omen:2026-07-11");

    expect([...readReturnContractProgress(storage, USER_A, "2026-07-12")]).toEqual([]);
  });

  it("does not let a stale prior-day tab erase the current UTC day's progress", () => {
    const storage = memStorage();
    const nextDay = "2026-07-12";

    markReturnContractReviewed(storage, USER_A, nextDay, "daily_omen:2026-07-12");
    markReturnContractReviewed(storage, USER_A, DAY, "daily_omen:2026-07-11");

    expect([...readReturnContractProgress(storage, USER_A, nextDay)])
      .toEqual(["daily_omen:2026-07-12"]);
  });

  it("isolates progress between authenticated users on the same browser", () => {
    const storage = memStorage();
    markReturnContractReviewed(storage, USER_A, DAY, "daily_omen:2026-07-11");

    expect([...readReturnContractProgress(storage, USER_A, DAY)]).toEqual(["daily_omen:2026-07-11"]);
    expect([...readReturnContractProgress(storage, USER_B, DAY)]).toEqual([]);
    expect(returnContractProgressStorageKey(USER_A, DAY))
      .not.toBe(returnContractProgressStorageKey(USER_B, DAY));
  });

  it("fails open for corrupt or unavailable storage while retaining in-memory progress", () => {
    const corrupt = memStorage();
    corrupt.map.set(returnContractProgressStorageKey(USER_A, DAY), "{not json");
    expect([...readReturnContractProgress(corrupt, USER_A, DAY)]).toEqual([]);

    const inMemory = new Set(["recommendation:a"]);
    expect(() => markReturnContractReviewed(brokenStorage(), USER_A, DAY, "recommendation:b", inMemory))
      .not.toThrow();
    expect([...markReturnContractReviewed(brokenStorage(), USER_A, DAY, "recommendation:b", inMemory)])
      .toEqual(["recommendation:a", "recommendation:b"]);
    expect([...markReturnContractReviewed(null, USER_A, DAY, "recommendation:b", inMemory)])
      .toEqual(["recommendation:a", "recommendation:b"]);
  });

  it("preserves same-scope in-memory progress across rehydration when storage is unavailable", () => {
    const scope: ReturnContractProgressScope = { userId: USER_A, utcDay: DAY };
    const inMemory = new Set(["recommendation:a", "recommendation:b"]);

    expect([...reconcileReturnContractProgress(brokenStorage(), scope, scope, inMemory)])
      .toEqual(["recommendation:a", "recommendation:b"]);
    expect([...reconcileReturnContractProgress(
      brokenStorage(),
      { userId: USER_A, utcDay: "2026-07-12" },
      scope,
      inMemory,
    )]).toEqual([]);
  });

  it("merges persisted and current-mount progress before writing", () => {
    const storage = memStorage();
    markReturnContractReviewed(storage, USER_A, DAY, "recommendation:a");

    const reviewed = markReturnContractReviewed(
      storage,
      USER_A,
      DAY,
      "recommendation:c",
      new Set(["recommendation:b"]),
    );

    expect([...reviewed]).toEqual(["recommendation:a", "recommendation:b", "recommendation:c"]);
  });

  it("finds the first unseen card and reports exhaustion only for a non-empty queue", () => {
    const keys = ["a", "b", "c"];
    const partial = new Set(["a", "b"]);

    expect(firstUnreviewedReturnContractIndex(keys, partial)).toBe(2);
    expect(isReturnContractQueueExhausted(keys, partial)).toBe(false);
    expect(firstUnreviewedReturnContractIndex(keys, new Set(keys))).toBe(-1);
    expect(isReturnContractQueueExhausted(keys, new Set(keys))).toBe(true);
    expect(isReturnContractQueueExhausted([], new Set())).toBe(false);
  });

  it("reopens an exhausted queue when a new same-day key arrives", () => {
    const reviewed = new Set(["a", "b"]);

    expect(isReturnContractQueueExhausted(["a", "b"], reviewed)).toBe(true);
    expect(isReturnContractQueueExhausted(["a", "b", "urgent-gazing"], reviewed)).toBe(false);
    expect(firstUnreviewedReturnContractIndex(["a", "b", "urgent-gazing"], reviewed)).toBe(2);
  });
});
