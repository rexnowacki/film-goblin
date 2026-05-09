import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  getCovenWatchersForFilm,
  getOtherWatchersForFilm,
} from "@/lib/queries/film-watchers";
import type { Database } from "@/lib/supabase/types";

const hasEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

type AdminClient = ReturnType<typeof createClient<Database>>;

// Outer describe owns shared fixtures so both inner describes see the same
// users/films/bonds. The previous structure had two separate beforeAll's that
// raced (the second describe assumed the first's fixtures still existed even
// though afterAll had torn them down).

describe.skipIf(!hasEnv)("film-watchers queries", () => {
  let client: AdminClient;
  let FILM_ID = "";
  let OTHER_FILM_ID = "";
  let USER_A = "";
  let USER_B = "";
  let USER_C = "";
  let USER_D = "";
  let USER_E = "";

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Films — minimal shape (title + year are enough; everything else has
    // defaults). Suffix the title so re-runs don't collide on any unique
    // constraint that might exist on (title, year) in future migrations.
    const stamp = Date.now().toString(36);
    const insertFilm = async (suffix: string) => {
      const { data, error } = await client
        .from("films")
        .insert({ title: `__fwtest-${stamp}-${suffix}`, year: 2020 })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    };
    FILM_ID = await insertFilm("primary");
    OTHER_FILM_ID = await insertFilm("other");

    // Users — usernames must match /^[a-z0-9._]+$/ (≤24 chars). Pass via
    // user_metadata so the on_auth_user_created trigger writes them directly
    // and we don't need a follow-up UPDATE to set username.
    const create = async (suffix: string, discoverable = true) => {
      const username = `fw${stamp}${suffix}`.toLowerCase().slice(0, 24);
      const { data, error } = await client.auth.admin.createUser({
        email: `${username}@filmgoblin.test`,
        password: "testpass123",
        email_confirm: true,
        user_metadata: { username },
      });
      if (error) throw error;
      const id = data.user.id;
      if (!discoverable) {
        const { error: updateErr } = await client
          .from("profiles")
          .update({ discoverable: false })
          .eq("id", id);
        if (updateErr) throw updateErr;
      }
      return id;
    };
    USER_A = await create("a");
    USER_B = await create("b");
    USER_C = await create("c");
    USER_D = await create("d");
    USER_E = await create("e", false);

    // Coven bonds — the table has a CHECK that user_a_id < user_b_id, so
    // sort the pair before inserting.
    const bond = async (x: string, y: string) => {
      const [a, b] = x < y ? [x, y] : [y, x];
      const { error } = await client
        .from("coven_members")
        .insert({ user_a_id: a, user_b_id: b });
      if (error) throw error;
    };
    await bond(USER_A, USER_B);
    await bond(USER_A, USER_C);

    // Fixture: B + C have FILM_ID in their lists (via watchlist + library);
    // D has it on watchlist (non-coven, discoverable);
    // E has it on watchlist (non-coven, NOT discoverable).
    await client.from("watchlists").insert({ user_id: USER_B, film_id: FILM_ID });
    await client.from("library").insert({ user_id: USER_C, film_id: FILM_ID });
    await client.from("watchlists").insert({ user_id: USER_D, film_id: FILM_ID });
    await client.from("watchlists").insert({ user_id: USER_E, film_id: FILM_ID });
  });

  afterAll(async () => {
    if (!hasEnv) return;
    // Deleting users cascades through profiles, watchlists, library, and
    // coven_members (all have ON DELETE CASCADE on auth.users). Then the
    // films, which have no FK back to users.
    for (const id of [USER_A, USER_B, USER_C, USER_D, USER_E]) {
      if (id) await client.auth.admin.deleteUser(id);
    }
    if (FILM_ID) await client.from("films").delete().eq("id", FILM_ID);
    if (OTHER_FILM_ID) await client.from("films").delete().eq("id", OTHER_FILM_ID);
  });

  describe("getCovenWatchersForFilm", () => {
    it("returns coven members who have the film on watchlist", async () => {
      const result = await getCovenWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.map(r => r.id);
      expect(ids).toContain(USER_B);
    });

    it("returns coven members who have the film in library", async () => {
      const result = await getCovenWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.map(r => r.id);
      expect(ids).toContain(USER_C);
    });

    it("does not return non-coven users", async () => {
      const result = await getCovenWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.map(r => r.id);
      expect(ids).not.toContain(USER_D);
      expect(ids).not.toContain(USER_E);
    });

    it("returns empty array when no coven members have the film", async () => {
      const result = await getCovenWatchersForFilm(client as never, USER_A, OTHER_FILM_ID);
      expect(result).toHaveLength(0);
    });

    it("returns profile shape: id, username, avatar_url", async () => {
      const result = await getCovenWatchersForFilm(client as never, USER_A, FILM_ID);
      expect(result[0]).toMatchObject({ id: expect.any(String), username: expect.any(String) });
      expect("avatar_url" in result[0]).toBe(true);
    });
  });

  describe("getOtherWatchersForFilm", () => {
    it("returns non-coven discoverable users who have the film", async () => {
      const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.users.map(r => r.id);
      expect(ids).toContain(USER_D);
    });

    it("excludes non-discoverable users", async () => {
      const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.users.map(r => r.id);
      expect(ids).not.toContain(USER_E);
    });

    it("excludes the current user", async () => {
      await client.from("watchlists").insert({ user_id: USER_A, film_id: FILM_ID });
      try {
        const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
        const ids = result.users.map(r => r.id);
        expect(ids).not.toContain(USER_A);
      } finally {
        await client.from("watchlists").delete().eq("user_id", USER_A).eq("film_id", FILM_ID);
      }
    });

    it("excludes coven members", async () => {
      const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
      const ids = result.users.map(r => r.id);
      expect(ids).not.toContain(USER_B);
      expect(ids).not.toContain(USER_C);
    });

    it("returns correct totalCount", async () => {
      const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
      expect(result.totalCount).toBe(1);
      expect(result.users).toHaveLength(1);
    });

    it("orders users by username", async () => {
      const result = await getOtherWatchersForFilm(client as never, USER_A, FILM_ID);
      const usernames = result.users.map(r => r.username);
      expect(usernames).toEqual([...usernames].sort());
    });
  });
});
