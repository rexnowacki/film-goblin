import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _completeOnboarding } from "../../lib/actions/onboarding";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let user: TestUser;
let filmA: string;
let filmB: string;

beforeAll(async () => {
  if (!hasEnv) return;
  user = await createTestUser();
  const admin = adminClient();
  const a = await admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "A", director: "D", year: 2024 }).select("id").single();
  const b = await admin.from("films").insert({ itunes_id: 700000 + Math.floor(Math.random() * 10000), title: "B", director: "D", year: 2024 }).select("id").single();
  filmA = a.data!.id;
  filmB = b.data!.id;
  // Seed a price history for filmA so threshold calc has something
  await admin.from("price_history").insert({ film_id: filmA, price_usd: 9.99 });
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("watchlists").delete().eq("user_id", user.id);
  await admin.from("price_history").delete().eq("film_id", filmA);
  await admin.from("films").delete().in("id", [filmA, filmB]);
  await deleteTestUser(user.id);
});

describe.skipIf(!hasEnv)("actions/onboarding", () => {
  it("completeOnboarding sets profile handle + inserts watchlists with threshold-derived max_price_usd", async () => {
    const c = await signedInClient(user.email, user.password);
    await _completeOnboarding(c, {
      handle: "moss.witch",
      watchlistFilmIds: [filmA, filmB],
      thresholdPct: 30,
    });

    const admin = adminClient();
    const p = await admin.from("profiles").select("*").eq("id", user.id).single();
    expect(p.data?.handle).toBe("moss.witch");
    expect(p.data?.broadcast_watchlist_adds).toBe(true);

    const wl = await admin.from("watchlists").select("*").eq("user_id", user.id);
    expect(wl.data).toHaveLength(2);
    const filmAWl = wl.data!.find(w => w.film_id === filmA);
    // 9.99 * 0.7 = 6.993 ≈ 6.99 after storage coercion
    expect(Number(filmAWl!.max_price_usd)).toBeCloseTo(9.99 * 0.7, 1);
  });
});
