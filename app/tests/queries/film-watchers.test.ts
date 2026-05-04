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

const FILM_ID = "f1lm0000-0000-0000-0000-000000000001";
const OTHER_FILM_ID = "f1lm0000-0000-0000-0000-000000000002";
let USER_A: string;
let USER_B: string;
let USER_C: string;
let USER_D: string;
let USER_E: string;

describe.skipIf(!hasEnv)("getCovenWatchersForFilm", () => {
  let client: AdminClient;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const create = async (username: string, discoverable = true) => {
      const { data, error } = await client.auth.admin.createUser({
        email: `${username}-fw-test@filmgoblin.test`,
        password: "testpass123",
        email_confirm: true,
      });
      if (error) throw error;
      const id = data.user.id;
      await client.from("profiles").update({ username, discoverable }).eq("id", id);
      return id;
    };

    USER_A = await create("fw-user-a");
    USER_B = await create("fw-user-b");
    USER_C = await create("fw-user-c");
    USER_D = await create("fw-user-d");
    USER_E = await create("fw-user-e", false);

    const bond = async (x: string, y: string) => {
      const [a, b] = x < y ? [x, y] : [y, x];
      await client.from("coven_members").insert({ user_a_id: a, user_b_id: b });
    };
    await bond(USER_A, USER_B);
    await bond(USER_A, USER_C);

    await client.from("watchlists").insert({ user_id: USER_B, film_id: FILM_ID });
    await client.from("library").insert({ user_id: USER_C, film_id: FILM_ID });
    await client.from("watchlists").insert({ user_id: USER_D, film_id: FILM_ID });
    await client.from("watchlists").insert({ user_id: USER_E, film_id: FILM_ID });
  });

  afterAll(async () => {
    if (!hasEnv) return;
    await client.from("watchlists").delete().in("user_id", [USER_B, USER_D, USER_E]);
    await client.from("library").delete().eq("user_id", USER_C);
    const [ab_a, ab_b] = USER_A < USER_B ? [USER_A, USER_B] : [USER_B, USER_A];
    const [ac_a, ac_b] = USER_A < USER_C ? [USER_A, USER_C] : [USER_C, USER_A];
    await client.from("coven_members").delete().eq("user_a_id", ab_a).eq("user_b_id", ab_b);
    await client.from("coven_members").delete().eq("user_a_id", ac_a).eq("user_b_id", ac_b);
    for (const id of [USER_A, USER_B, USER_C, USER_D, USER_E]) {
      await client.auth.admin.deleteUser(id);
    }
  });

  it("returns coven members who have the film on watchlist", async () => {
    const result = await getCovenWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.map(r => r.id);
    expect(ids).toContain(USER_B);
  });

  it("returns coven members who have the film in library", async () => {
    const result = await getCovenWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.map(r => r.id);
    expect(ids).toContain(USER_C);
  });

  it("does not return non-coven users", async () => {
    const result = await getCovenWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.map(r => r.id);
    expect(ids).not.toContain(USER_D);
    expect(ids).not.toContain(USER_E);
  });

  it("returns empty array when no coven members have the film", async () => {
    const result = await getCovenWatchersForFilm(client as any, USER_A, OTHER_FILM_ID);
    expect(result).toHaveLength(0);
  });

  it("returns profile shape: id, username, avatar_url", async () => {
    const result = await getCovenWatchersForFilm(client as any, USER_A, FILM_ID);
    expect(result[0]).toMatchObject({ id: expect.any(String), username: expect.any(String) });
    expect("avatar_url" in result[0]).toBe(true);
  });
});

describe.skipIf(!hasEnv)("getOtherWatchersForFilm", () => {
  let client: AdminClient;

  beforeAll(async () => {
    if (!hasEnv) return;
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("returns non-coven discoverable users who have the film", async () => {
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.users.map(r => r.id);
    expect(ids).toContain(USER_D);
  });

  it("excludes non-discoverable users", async () => {
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_E);
  });

  it("excludes the current user", async () => {
    await client.from("watchlists").insert({ user_id: USER_A, film_id: FILM_ID });
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_A);
    await client.from("watchlists").delete().eq("user_id", USER_A).eq("film_id", FILM_ID);
  });

  it("excludes coven members", async () => {
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    const ids = result.users.map(r => r.id);
    expect(ids).not.toContain(USER_B);
    expect(ids).not.toContain(USER_C);
  });

  it("returns correct totalCount", async () => {
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    expect(result.totalCount).toBe(1);
    expect(result.users).toHaveLength(1);
  });

  it("orders users by username", async () => {
    const result = await getOtherWatchersForFilm(client as any, USER_A, FILM_ID);
    const usernames = result.users.map(r => r.username);
    expect(usernames).toEqual([...usernames].sort());
  });
});
