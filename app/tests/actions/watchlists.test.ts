import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _addToWatchlist, _removeFromWatchlist, _setWatchlistThreshold } from "../../lib/actions/watchlists";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let user: TestUser;
let filmId: string;

beforeAll(async () => {
  user = await createTestUser();
  const admin = adminClient();
  const { data, error } = await admin
    .from("films")
    .insert({ itunes_id: 900000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (error || !data) throw error;
  filmId = data.id;
});

afterAll(async () => {
  if (user?.id) await deleteTestUser(user.id);
  if (filmId) {
    await adminClient().from("films").delete().eq("id", filmId);
  }
});

describe("actions/watchlists", () => {
  it("addToWatchlist inserts a row owned by the caller", async () => {
    const c = await signedInClient(user.email, user.password);
    const { id } = await _addToWatchlist(c, filmId, 6.00);
    expect(id).toBeTruthy();

    const admin = adminClient();
    const { data } = await admin.from("watchlists").select("*").eq("id", id).single();
    expect(data?.user_id).toBe(user.id);
    expect(data?.film_id).toBe(filmId);
    expect(Number(data?.max_price_usd)).toBe(6.00);
    await adminClient().from("watchlists").delete().eq("id", id);
  });

  it("removeFromWatchlist deletes the caller's row", async () => {
    const c = await signedInClient(user.email, user.password);
    // ensure a row exists
    await _addToWatchlist(c, filmId);
    await _removeFromWatchlist(c, filmId);
    const admin = adminClient();
    const { data } = await admin.from("watchlists").select("id").eq("user_id", user.id).eq("film_id", filmId);
    expect(data).toHaveLength(0);
  });

  it("cannot add to watchlist when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await expect(_addToWatchlist(anon, filmId)).rejects.toThrow(/unauthenticated/i);
  });
});

describe("_setWatchlistThreshold", () => {
  let userA: TestUser;
  let userB: TestUser;
  let thresholdFilmId: string;

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    const admin = adminClient();
    const { data, error } = await admin
      .from("films")
      .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "T2", director: "D2", year: 2024 })
      .select("id")
      .single();
    if (error || !data) throw error;
    thresholdFilmId = data.id;
  });

  afterAll(async () => {
    if (userA?.id) await deleteTestUser(userA.id);
    if (userB?.id) await deleteTestUser(userB.id);
    if (thresholdFilmId) {
      await adminClient().from("watchlists").delete().eq("film_id", thresholdFilmId);
      await adminClient().from("films").delete().eq("id", thresholdFilmId);
    }
  });

  it("happy path: updates max_price_usd to provided value", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _addToWatchlist(c, thresholdFilmId, 5.00);
    await _setWatchlistThreshold(c, thresholdFilmId, 9.99);
    const { data } = await adminClient().from("watchlists").select("max_price_usd").eq("id", id).single();
    expect(Number(data?.max_price_usd)).toBeCloseTo(9.99);
    await adminClient().from("watchlists").delete().eq("id", id);
  });

  it("clear threshold: sets max_price_usd to null", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _addToWatchlist(c, thresholdFilmId, 5.00);
    await _setWatchlistThreshold(c, thresholdFilmId, null);
    const { data } = await adminClient().from("watchlists").select("max_price_usd").eq("id", id).single();
    expect(data?.max_price_usd).toBeNull();
    await adminClient().from("watchlists").delete().eq("id", id);
  });

  it.each([0, -1, 1001, NaN, Infinity, -Infinity])(
    "invalid threshold %s throws 'invalid threshold'",
    async (badValue) => {
      const c = await signedInClient(userA.email, userA.password);
      const { id } = await _addToWatchlist(c, thresholdFilmId, 5.00);
      await expect(_setWatchlistThreshold(c, thresholdFilmId, badValue)).rejects.toThrow(/invalid threshold/i);
      const { data } = await adminClient().from("watchlists").select("max_price_usd").eq("id", id).single();
      expect(Number(data?.max_price_usd)).toBeCloseTo(5.00);
      await adminClient().from("watchlists").delete().eq("id", id);
    }
  );

  it("unauthenticated: throws 'unauthenticated'", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await expect(_setWatchlistThreshold(anon, thresholdFilmId, 9.99)).rejects.toThrow(/unauthenticated/i);
  });

  it("cross-user attempt: userB cannot update userA's row (RLS no-op)", async () => {
    // Seed userA's watchlist row via adminClient (bypasses RLS)
    const admin = adminClient();
    const { data: row, error } = await admin
      .from("watchlists")
      .insert({ user_id: userA.id, film_id: thresholdFilmId, max_price_usd: 5 })
      .select("id")
      .single();
    if (error || !row) throw error;

    // userB attempts to set userA's threshold
    const cB = await signedInClient(userB.email, userB.password);
    // Should not throw — RLS filters out userA's row, 0 rows updated
    await expect(_setWatchlistThreshold(cB, thresholdFilmId, 99)).resolves.toBeUndefined();

    // userA's row must be unchanged
    const { data: after } = await admin.from("watchlists").select("max_price_usd").eq("id", row.id).single();
    expect(Number(after?.max_price_usd)).toBeCloseTo(5);

    await admin.from("watchlists").delete().eq("id", row.id);
  });
});
