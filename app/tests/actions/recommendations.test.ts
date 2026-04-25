import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _recommendFilm } from "../../lib/actions/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let sender: TestUser;
let receiver: TestUser;
let stranger: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  sender = await createTestUser();
  receiver = await createTestUser();
  stranger = await createTestUser();

  const admin = adminClient();
  // Bind sender + receiver as coven members so recommendations are allowed.
  const a = sender.id < receiver.id ? sender.id : receiver.id;
  const b = sender.id < receiver.id ? receiver.id : sender.id;
  await admin.from("coven_members").insert({ user_a_id: a, user_b_id: b });

  const { data } = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "R", director: "D", year: 2024 })
    .select("id").single();
  if (!data) throw new Error("film insert failed");
  filmId = data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  await admin.from("recommendations").delete().eq("film_id", filmId);
  await admin.from("films").delete().eq("id", filmId);
  const a = sender.id < receiver.id ? sender.id : receiver.id;
  const b = sender.id < receiver.id ? receiver.id : sender.id;
  await admin.from("coven_members").delete().eq("user_a_id", a).eq("user_b_id", b);
  await deleteTestUser(sender.id);
  await deleteTestUser(receiver.id);
  await deleteTestUser(stranger.id);
});

describe.skipIf(!hasEnv)("actions/recommendations", () => {
  it("sender can recommend a film to a coven member", async () => {
    const c = await signedInClient(sender.email, sender.password);
    const { id } = await _recommendFilm(c, filmId, receiver.id, "watch this");
    expect(id).toBeTruthy();
    const admin = adminClient();
    const { data } = await admin.from("recommendations").select("*").eq("id", id).single();
    expect(data?.from_user_id).toBe(sender.id);
    expect(data?.to_user_id).toBe(receiver.id);
    expect(data?.note).toBe("watch this");
  });

  it("rejects self-recommendation", async () => {
    const c = await signedInClient(sender.email, sender.password);
    await expect(_recommendFilm(c, filmId, sender.id, "")).rejects.toThrow(/self/i);
  });

  it("rejects recommendation to a non-coven user", async () => {
    const c = await signedInClient(sender.email, sender.password);
    await expect(_recommendFilm(c, filmId, stranger.id, "hey")).rejects.toThrow();
  });
});
