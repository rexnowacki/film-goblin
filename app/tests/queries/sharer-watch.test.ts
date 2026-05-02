import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSharerWatchForFilm } from "@/lib/queries/sharer-watch";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let userA: TestUser;
let filmId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  userA = await createTestUser();
  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 950000 + Math.floor(Math.random() * 50000), title: "Sharer Test", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
});

describe.skipIf(!hasEnv)("getSharerWatchForFilm", () => {
  it("returns null when username doesn't exist", async () => {
    const result = await getSharerWatchForFilm("nonexistent_user_xyz", filmId);
    expect(result).toBeNull();
  });

  it("returns null when user exists but has no watches for this film", async () => {
    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).toBeNull();
  });

  it("returns the most recent watch when one exists", async () => {
    const admin = adminClient();
    await admin.from("watched").insert([
      { user_id: userA.id, film_id: filmId, watched_at: "2026-02-01", note: "the older one", recommended: true },
      { user_id: userA.id, film_id: filmId, watched_at: "2026-04-15", note: "the newer one", recommended: true },
    ]);

    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).not.toBeNull();
    expect(result?.username).toBe(userA.username);
    expect(result?.watched_at).toBe("2026-04-15");
    expect(result?.note).toBe("the newer one");
    expect(result?.recommended).toBe(true);

    await admin.from("watched").delete().eq("user_id", userA.id).eq("film_id", filmId);
  });

  it("ignores broadcast_watched (service-role bypass)", async () => {
    const admin = adminClient();
    await admin.from("profiles").update({ broadcast_watched: false }).eq("id", userA.id);
    await admin.from("watched").insert({ user_id: userA.id, film_id: filmId, watched_at: "2026-03-01", note: "private", recommended: false });

    const result = await getSharerWatchForFilm(userA.username, filmId);
    expect(result).not.toBeNull();
    expect(result?.note).toBe("private");

    await admin.from("watched").delete().eq("user_id", userA.id).eq("film_id", filmId);
    await admin.from("profiles").update({ broadcast_watched: true }).eq("id", userA.id);
  });
});
