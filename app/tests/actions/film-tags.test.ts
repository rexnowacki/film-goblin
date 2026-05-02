import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setFilmTags } from "@/lib/actions/admin/film-tags";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let filmId: string;
let witchcraftId: string;
let folkHorrorId: string;
let occultId: string;
let slowBurnId: string;
let surrealId: string;
let staffUser: TestUser;
let civilianUser: TestUser;

beforeAll(async () => {
  if (!hasEnv) return;
  staffUser = await createTestUser();
  civilianUser = await createTestUser();

  const admin = adminClient();
  await admin.from("staff").insert({ user_id: staffUser.id, role: "admin" });

  const film = await admin
    .from("films")
    .insert({ itunes_id: 980000 + Math.floor(Math.random() * 20000), title: "Action Test Film", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  for (const [name, into] of [
    ["witchcraft", (id: string) => (witchcraftId = id)],
    ["folk horror", (id: string) => (folkHorrorId = id)],
    ["occult", (id: string) => (occultId = id)],
    ["slow-burn", (id: string) => (slowBurnId = id)],
    ["surreal", (id: string) => (surrealId = id)],
  ] as const) {
    const r = await admin.from("tags").select("id").eq("name", name).single();
    into(r.data!.id);
  }
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (staffUser?.id) await deleteTestUser(staffUser.id);
  if (civilianUser?.id) await deleteTestUser(civilianUser.id);
});

describe.skipIf(!hasEnv)("setFilmTags", () => {
  it("inserts subgenre + 2 vibes (DB-level shape verification)", async () => {
    const admin = adminClient();
    await admin.from("film_tags").delete().eq("film_id", filmId);
    await admin.from("film_tags").insert([
      { film_id: filmId, tag_id: witchcraftId },
      { film_id: filmId, tag_id: occultId },
      { film_id: filmId, tag_id: slowBurnId },
    ]);
    const r = await admin.from("film_tags").select("tag_id").eq("film_id", filmId);
    expect(r.data).toHaveLength(3);
  });

  it("rejects duplicate vibes via validation", async () => {
    const result = await setFilmTags({
      filmId,
      subgenreTagId: witchcraftId,
      vibeTagIds: [occultId, slowBurnId, occultId /* dup */],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.toLowerCase()).toMatch(/duplicate/);
    }
  });

  it("rejects more than 3 vibes", async () => {
    const result = await setFilmTags({
      filmId,
      subgenreTagId: witchcraftId,
      vibeTagIds: [occultId, slowBurnId, surrealId, folkHorrorId],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.toLowerCase()).toMatch(/3 vibes|up to/);
    }
  });
});
