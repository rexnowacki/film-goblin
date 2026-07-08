import { describe, it, expect } from "vitest";
import {
  addPendingBuy,
  nextEligibleBuy,
  resolvePendingBuy,
  type StorageLike,
} from "../../lib/purchase/pending";

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function brokenStorage(): StorageLike {
  return {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
}

const T0 = new Date("2026-07-07T12:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const iso = (d: Date) => d.toISOString();

const buy = (filmId: string, clickedAt: Date, price: number | null = 9.99) => ({
  filmId,
  title: `Film ${filmId}`,
  price,
  clickedAt: iso(clickedAt),
});

describe("addPendingBuy", () => {
  it("adds an entry retrievable once past the 2-minute floor", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    expect(nextEligibleBuy(s, minutes(1))).toBeNull();          // too fresh
    expect(nextEligibleBuy(s, minutes(3))?.filmId).toBe("a");   // eligible
  });

  it("replaces an older entry for the same film", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0, 14.99));
    addPendingBuy(s, buy("a", minutes(1), 9.99));
    const next = nextEligibleBuy(s, minutes(5));
    expect(next?.price).toBe(9.99);
  });

  it("caps the queue at 10, evicting the oldest", () => {
    const s = memStorage();
    for (let i = 0; i < 12; i++) addPendingBuy(s, buy(`f${i}`, minutes(i)));
    const raw = JSON.parse(s.map.get("fg_pending_buys")!);
    expect(raw).toHaveLength(10);
    expect(raw[0].filmId).toBe("f2"); // f0, f1 evicted
  });

  it("no-ops silently when storage throws", () => {
    expect(() => addPendingBuy(brokenStorage(), buy("a", T0))).not.toThrow();
  });
});

describe("nextEligibleBuy", () => {
  it("returns the most recent eligible entry when several qualify", () => {
    const s = memStorage();
    addPendingBuy(s, buy("old", T0));
    addPendingBuy(s, buy("new", minutes(10)));
    expect(nextEligibleBuy(s, minutes(20))?.filmId).toBe("new");
  });

  it("prunes entries older than 48h and returns null when all expired", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    expect(nextEligibleBuy(s, minutes(49 * 60))).toBeNull();
    const raw = JSON.parse(s.map.get("fg_pending_buys")!);
    expect(raw).toHaveLength(0); // pruned, not just skipped
  });

  it("returns null on empty or corrupt storage", () => {
    const s = memStorage();
    expect(nextEligibleBuy(s, T0)).toBeNull();
    s.setItem("fg_pending_buys", "{not json");
    expect(nextEligibleBuy(s, T0)).toBeNull();
    expect(nextEligibleBuy(brokenStorage(), T0)).toBeNull();
  });
});

describe("resolvePendingBuy", () => {
  it("removes the entry on confirmed and declined", () => {
    for (const outcome of ["confirmed", "declined"] as const) {
      const s = memStorage();
      addPendingBuy(s, buy("a", T0));
      resolvePendingBuy(s, "a", outcome);
      expect(nextEligibleBuy(s, minutes(5))).toBeNull();
    }
  });

  it("defers once on dismissed, removes on second dismissal", () => {
    const s = memStorage();
    addPendingBuy(s, buy("a", T0));
    resolvePendingBuy(s, "a", "dismissed");
    expect(nextEligibleBuy(s, minutes(5))?.deferred).toBe(true); // still asked once more
    resolvePendingBuy(s, "a", "dismissed");
    expect(nextEligibleBuy(s, minutes(5))).toBeNull();           // gone
  });

  it("no-ops on unknown film or broken storage", () => {
    const s = memStorage();
    expect(() => resolvePendingBuy(s, "ghost", "declined")).not.toThrow();
    expect(() => resolvePendingBuy(brokenStorage(), "a", "dismissed")).not.toThrow();
  });
});
