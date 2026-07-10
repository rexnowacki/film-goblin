import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getEligiblePitEventsForUser, PIT_DAILY_CAP } from "../../lib/feed-events/pitSelection";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;
let watchlistedFilmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const f1 = await admin.from("films").insert({ itunes_id: 820000 + Math.floor(Math.random() * 100000), title: "T1", director: "D", year: 2024 }).select("id").single();
  const f2 = await admin.from("films").insert({ itunes_id: 830000 + Math.floor(Math.random() * 100000), title: "T2", director: "D", year: 2024 }).select("id").single();
  if (f1.error || !f1.data || f2.error || !f2.data) throw f1.error ?? f2.error;
  filmId = f1.data.id;
  watchlistedFilmId = f2.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("feed_events").delete().in("film_id", [filmId, watchlistedFilmId]);
  await admin.from("films").delete().in("id", [filmId, watchlistedFilmId]);
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("pit_impressions").delete().eq("user_id", userA.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
  await admin.from("feed_events").delete().in("film_id", [filmId, watchlistedFilmId]);
});

describe.skipIf(!hasEnv)("getEligiblePitEventsForUser", () => {
  it("excludes an already-impressed event permanently", async () => {
    const admin = adminClient();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "x", priority: 90 }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;
    await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: ins.data.id });

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });

  it("returns [] once the daily cap is reached", async () => {
    const admin = adminClient();
    for (let i = 0; i < PIT_DAILY_CAP; i++) {
      const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: `x${i}`, priority: 90 }).select("id").single();
      if (ins.error || !ins.data) throw ins.error;
      await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: ins.data.id });
    }
    const ins2 = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "fresh", priority: 90 }).select("id").single();
    if (ins2.error || !ins2.data) throw ins2.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out).toEqual([]);
  });

  it("permanently excludes a backdated impression without counting it toward today's cap", async () => {
    const admin = adminClient();

    // Backdated (2 days ago) impression on its own event.
    const oldIns = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "old", priority: 90 }).select("id").single();
    if (oldIns.error || !oldIns.data) throw oldIns.error;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const oldImp = await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: oldIns.data.id, shown_at: twoDaysAgo });
    if (oldImp.error) throw oldImp.error;

    // The backdated event must never resurface, regardless of cap state.
    const c = await signedInClient(userA.email, userA.password);
    const outBeforeFreshImpressions = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(outBeforeFreshImpressions.find(e => e.id === oldIns.data!.id)).toBeUndefined();

    // Now add exactly PIT_DAILY_CAP - 1 fresh (today-dated) impressions on
    // other events. This count is deliberately ONE SHORT of the cap: if the
    // 2-day-old impression wrongly counted toward today's budget, the
    // effective today-count would read PIT_DAILY_CAP (backdated + these) and
    // the function would already return [] -- a false "cap reached". If the
    // backdated impression correctly does NOT count toward today, the real
    // today-count is only PIT_DAILY_CAP - 1, still under the cap, and a
    // fresh, never-impressed candidate must still be admitted. Using exactly
    // PIT_DAILY_CAP fresh impressions here (as a naive version of this test
    // might) would return [] under BOTH the correct and the buggy
    // implementation, failing to distinguish them -- PIT_DAILY_CAP - 1 is
    // the tight boundary that actually proves the day-scoping is correct.
    for (let i = 0; i < PIT_DAILY_CAP - 1; i++) {
      const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: `fresh${i}`, priority: 90 }).select("id").single();
      if (ins.error || !ins.data) throw ins.error;
      const imp = await admin.from("pit_impressions").insert({ user_id: userA.id, event_id: ins.data.id });
      if (imp.error) throw imp.error;
    }
    const freshCandidate = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "should-still-be-eligible", priority: 90 }).select("id").single();
    if (freshCandidate.error || !freshCandidate.data) throw freshCandidate.error;

    const outWithBudgetRemaining = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(outWithBudgetRemaining.find(e => e.id === freshCandidate.data!.id)).toBeDefined();
    expect(outWithBudgetRemaining.find(e => e.id === oldIns.data!.id)).toBeUndefined();
  });

  it("a watchlist match is returned ahead of a higher-priority non-match", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "high priority, not watchlisted", priority: 90 });
    await admin.from("feed_events").insert({ event_type: "milestone", film_id: watchlistedFilmId, copy: "low priority, watchlisted", priority: 10 });

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 10);
    expect(out[0].film_id).toBe(watchlistedFilmId);
  });

  it("does not return a stale (>48h) unseen event even if its film is watchlisted", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    const staleAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: watchlistedFilmId, copy: "stale", priority: 90, created_at: staleAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });

  it("returns a 24-48h event whose film is watchlisted", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: watchlistedFilmId, max_price_usd: 9.99 });
    const agingAt = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: watchlistedFilmId, copy: "aging watchlisted", priority: 90, created_at: agingAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeDefined();
  });

  it("does not return a 24-48h event whose film is NOT watchlisted", async () => {
    const admin = adminClient();
    const agingAt = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const ins = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "aging not watchlisted", priority: 90, created_at: agingAt }).select("id").single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userA.email, userA.password);
    const out = await getEligiblePitEventsForUser(c as any, userA.id, 12);
    expect(out.find(e => e.id === ins.data!.id)).toBeUndefined();
  });
});
