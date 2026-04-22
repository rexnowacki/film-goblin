import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { _recommendFilm } from "../../lib/actions/recommendations";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let sender: TestUser;
let receiver: TestUser;
let filmId: string;

beforeAll(async () => {
  sender = await createTestUser();
  receiver = await createTestUser();
  const admin = adminClient();
  const { data } = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "R", director: "D", year: 2024 })
    .select("id")
    .single();
  if (!data) throw new Error("film insert failed");
  filmId = data.id;
});

afterAll(async () => {
  const admin = adminClient();
  await admin.from("recommendations").delete().eq("film_id", filmId);
  await admin.from("films").delete().eq("id", filmId);
  await deleteTestUser(sender.id);
  await deleteTestUser(receiver.id);
});

describe("actions/recommendations", () => {
  it("sender can recommend a film to a recipient", async () => {
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
});
