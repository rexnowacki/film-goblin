import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _confirmPurchase } from "../../lib/actions/library";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 810000 + Math.floor(Math.random() * 100000), title: "Claim Test", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
  // Price history: peak 19.99, later 4.99.
  const { error: histErr } = await admin.from("price_history").insert([
    { film_id: filmId, price_usd: 19.99, captured_at: "2026-01-01T00:00:00Z" },
    { film_id: filmId, price_usd: 4.99, captured_at: "2026-06-01T00:00:00Z" },
  ]);
  if (histErr) throw histErr;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) {
    const admin = adminClient();
    await admin.from("price_history").delete().eq("film_id", filmId);
    await admin.from("films").delete().eq("id", filmId);
  }
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("library").delete().eq("user_id", userA.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
});

describe.skipIf(!hasEnv)("actions/confirmPurchase", () => {
  it("inserts a library row with price paid and removes any watchlist row", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: filmId, max_price_usd: 5.99 });

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 4.99);

    expect(res.alreadyOwnedWithPrice).toBe(false);
    expect(res.peak).toBe(19.99);

    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib).toHaveLength(1);
    expect(Number(lib![0].price_paid_usd)).toBe(4.99);

    const { data: wl } = await admin.from("watchlists").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(wl).toHaveLength(0);
  });

  it("fills a NULL price on an already-owned film without duplicating the row", async () => {
    const admin = adminClient();
    await admin.from("library").insert({ user_id: userA.id, film_id: filmId }); // manual add, no price

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 7.99);

    expect(res.alreadyOwnedWithPrice).toBe(false);
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib).toHaveLength(1);
    expect(Number(lib![0].price_paid_usd)).toBe(7.99);
  });

  it("never overwrites an existing price", async () => {
    const admin = adminClient();
    await admin.from("library").insert({ user_id: userA.id, film_id: filmId, price_paid_usd: 3.99 });

    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, 9.99);

    expect(res.alreadyOwnedWithPrice).toBe(true);
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(Number(lib![0].price_paid_usd)).toBe(3.99);
  });

  it("accepts a null price (claim without a known figure)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const res = await _confirmPurchase(c as any, filmId, null);
    expect(res.alreadyOwnedWithPrice).toBe(false);
    const admin = adminClient();
    const { data: lib } = await admin.from("library").select("price_paid_usd").eq("user_id", userA.id).eq("film_id", filmId);
    expect(lib![0].price_paid_usd).toBeNull();
  });

  it("rejects out-of-range prices", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_confirmPurchase(c as any, filmId, 0)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, -1)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, 1000)).rejects.toThrow();
    await expect(_confirmPurchase(c as any, filmId, NaN)).rejects.toThrow();
  });
});
