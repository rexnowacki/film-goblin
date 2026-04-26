import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _logWatch, _editWatch, _deleteWatch } from "../../lib/actions/watched";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let userB: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  userB = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 600000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
  if (userB?.id) await deleteTestUser(userB.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("watched").delete().eq("user_id", userA.id);
  await admin.from("watched").delete().eq("user_id", userB.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
  await admin.from("activity").delete().eq("actor_user_id", userA.id).eq("kind", "watch_logged");
});

describe.skipIf(!hasEnv)("actions/watched", () => {
  it("_logWatch with no opts — inserts row with today's date, no note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId);
    expect(id).toBeTruthy();

    const { data } = await adminClient()
      .from("watched")
      .select("user_id, film_id, watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.user_id).toBe(userA.id);
    expect(data?.film_id).toBe(filmId);
    expect(data?.note).toBeNull();
    // watched_at should be today's ISO date
    expect(data?.watched_at).toBe(new Date().toISOString().slice(0, 10));
  });

  it("_logWatch honors explicit watched_at and note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId, { watched_at: "2026-04-15", note: "moonlit" });

    const { data } = await adminClient()
      .from("watched")
      .select("watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.watched_at).toBe("2026-04-15");
    expect(data?.note).toBe("moonlit");
  });

  it("_logWatch silently deletes any matching watchlist row", async () => {
    const admin = adminClient();
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: filmId, max_price_usd: 5.99 });

    const c = await signedInClient(userA.email, userA.password);
    await _logWatch(c as any, filmId);

    const { data: wlRows } = await admin
      .from("watchlists")
      .select("*")
      .eq("user_id", userA.id)
      .eq("film_id", filmId);
    expect(wlRows).toHaveLength(0);
  });

  it("_logWatch allows multiple inserts for same (user, film)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _logWatch(c as any, filmId, { watched_at: "2026-04-01" });
    await _logWatch(c as any, filmId, { watched_at: "2026-04-15" });
    await _logWatch(c as any, filmId, { watched_at: "2026-04-15" }); // same date OK

    const { data } = await adminClient()
      .from("watched")
      .select("id")
      .eq("user_id", userA.id)
      .eq("film_id", filmId);
    expect(data).toHaveLength(3);
  });

  it("_editWatch updates watched_at + note", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId, { watched_at: "2026-04-01", note: "old" });
    await _editWatch(c as any, id, { watched_at: "2026-04-22", note: "new" });

    const { data } = await adminClient()
      .from("watched")
      .select("watched_at, note")
      .eq("id", id)
      .single();
    expect(data?.watched_at).toBe("2026-04-22");
    expect(data?.note).toBe("new");
  });

  it("_deleteWatch deletes own row", async () => {
    const c = await signedInClient(userA.email, userA.password);
    const { id } = await _logWatch(c as any, filmId);
    await _deleteWatch(c as any, id);

    const { data } = await adminClient().from("watched").select("id").eq("id", id);
    expect(data).toHaveLength(0);
  });

  it("_deleteWatch on another user's row — RLS-filtered no-op", async () => {
    const admin = adminClient();
    const ins = await admin
      .from("watched")
      .insert({ user_id: userA.id, film_id: filmId })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw ins.error;

    const c = await signedInClient(userB.email, userB.password);
    await _deleteWatch(c as any, ins.data.id);

    const { data } = await adminClient().from("watched").select("id").eq("id", ins.data.id);
    expect(data).toHaveLength(1); // still there — RLS filtered the delete
  });

  it("_logWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_logWatch(anon as any, filmId)).rejects.toThrow(/unauthenticated/i);
  });

  it("_editWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_editWatch(anon as any, "00000000-0000-0000-0000-000000000000", { note: "x" })).rejects.toThrow(/unauthenticated/i);
  });

  it("_deleteWatch throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_deleteWatch(anon as any, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/unauthenticated/i);
  });
});
