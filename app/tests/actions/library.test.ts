import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { _addToLibrary, _removeFromLibrary } from "../../lib/actions/library";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { signedInClient } from "../helpers/supabase";

let userA: TestUser;
let filmId: string;

beforeAll(async () => {
  userA = await createTestUser();

  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 800000 + Math.floor(Math.random() * 100000), title: "T", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;
});

afterAll(async () => {
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
  if (userA?.id) await deleteTestUser(userA.id);
});

beforeEach(async () => {
  const admin = adminClient();
  await admin.from("library").delete().eq("user_id", userA.id);
  await admin.from("watchlists").delete().eq("user_id", userA.id);
});

describe("actions/library", () => {
  it("addToLibrary inserts the row and deletes any matching watchlist row", async () => {
    const admin = adminClient();
    // Pre-seed a watchlist row.
    await admin.from("watchlists").insert({ user_id: userA.id, film_id: filmId, max_price_usd: 5.99 });

    const c = await signedInClient(userA.email, userA.password);
    await _addToLibrary(c as any, filmId);

    const { data: libRows } = await admin.from("library").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(libRows).toHaveLength(1);

    const { data: wlRows } = await admin.from("watchlists").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(wlRows).toHaveLength(0);
  });

  it("addToLibrary is idempotent — calling twice does not throw", async () => {
    const c = await signedInClient(userA.email, userA.password);
    await _addToLibrary(c as any, filmId);
    await expect(_addToLibrary(c as any, filmId)).resolves.toBeUndefined();

    const { data: libRows } = await adminClient().from("library").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(libRows).toHaveLength(1);
  });

  it("addToLibrary throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_addToLibrary(anon as any, filmId)).rejects.toThrow(/unauthenticated/i);
  });

  it("removeFromLibrary deletes own row; calling on a missing row is a no-op", async () => {
    const c = await signedInClient(userA.email, userA.password);
    // Insert so there is something to delete.
    await adminClient().from("library").insert({ user_id: userA.id, film_id: filmId });
    await _removeFromLibrary(c as any, filmId);

    const { data: libRows } = await adminClient().from("library").select("*").eq("user_id", userA.id).eq("film_id", filmId);
    expect(libRows).toHaveLength(0);

    // Calling again on a missing row should not throw.
    await expect(_removeFromLibrary(c as any, filmId)).resolves.toBeUndefined();
  });

  it("removeFromLibrary throws when unauthenticated", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await expect(_removeFromLibrary(anon as any, filmId)).rejects.toThrow(/unauthenticated/i);
  });
});
