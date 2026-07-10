import { describe, expect, it } from "vitest";
import { getOrCreateProductSession, touchProductSession, type StorageLike } from "@/lib/product-events/session";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("product event session", () => {
  it("creates once and reuses within 30 idle minutes", () => {
    const storage = memoryStorage();
    const first = getOrCreateProductSession(storage, 1_000, () => "session-a");
    const second = getOrCreateProductSession(storage, 1_000 + 29 * 60_000, () => "session-b");
    expect(first).toMatchObject({ id: "session-a", isNew: true });
    expect(second).toMatchObject({ id: "session-a", isNew: false });
  });

  it("rolls over at the 30-minute idle boundary", () => {
    const storage = memoryStorage();
    getOrCreateProductSession(storage, 1_000, () => "session-a");
    const next = getOrCreateProductSession(storage, 1_000 + 30 * 60_000, () => "session-b");
    expect(next).toMatchObject({ id: "session-b", isNew: true });
  });

  it("touch extends the idle window", () => {
    const storage = memoryStorage();
    const first = getOrCreateProductSession(storage, 1_000, () => "session-a");
    touchProductSession(storage, first, 20 * 60_000);
    const next = getOrCreateProductSession(storage, 40 * 60_000, () => "session-b");
    expect(next.id).toBe("session-a");
  });

  it("recovers from corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem("fg_product_session", "not-json");
    expect(getOrCreateProductSession(storage, 1_000, () => "fresh").id).toBe("fresh");
  });
});
