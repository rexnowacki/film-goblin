import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _addToWatchlist, _removeFromWatchlist } from "../../lib/actions/watchlists";
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

