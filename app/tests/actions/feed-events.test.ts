import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _recordPitImpressions } from "../../lib/actions/feed-events";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;
let eventId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin.from("films").insert({ itunes_id: 840000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 }).select("id").single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
  const ev = await admin.from("feed_events").insert({ event_type: "price_drop", film_id: filmId, copy: "x", priority: 90 }).select("id").single();
  if (ev.error || !ev.data) throw ev.error;
  eventId = ev.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("feed_events").delete().eq("id", eventId);
  await admin.from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  if (!hasEnv) return;
  await adminClient().from("pit_impressions").delete().eq("user_id", userA.id);
});

describe.skipIf(!hasEnv)("actions/recordPitImpressions", () => {
  it("inserts an impression row for the signed-in user", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _recordPitImpressions(c as any, [eventId]);

    const admin = adminClient();
    const { data } = await admin.from("pit_impressions").select("*").eq("user_id", userA.id).eq("event_id", eventId);
    expect(data).toHaveLength(1);
  });

  it("is a no-op for an empty array (no RPC call, no error)", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await expect(_recordPitImpressions(c as any, [])).resolves.toBeUndefined();
  });

  it("calling twice does not error or duplicate", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _recordPitImpressions(c as any, [eventId]);
    await _recordPitImpressions(c as any, [eventId]);

    const admin = adminClient();
    const { data } = await admin.from("pit_impressions").select("*").eq("user_id", userA.id).eq("event_id", eventId);
    expect(data).toHaveLength(1);
  });
});
