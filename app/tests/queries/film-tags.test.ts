import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getFilmTags, getAllSubgenres, getAllVibes } from "@/lib/queries/film-tags";
import { adminClient } from "../helpers/users";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let filmId: string;
let witchcraftTagId: string;
let occultTagId: string;
let slowBurnTagId: string;

beforeAll(async () => {
  if (!hasEnv) return;
  const admin = adminClient();
  const film = await admin
    .from("films")
    .insert({ itunes_id: 970000 + Math.floor(Math.random() * 30000), title: "Tag Test Film", director: "D", year: 2024 })
    .select("id")
    .single();
  if (film.error || !film.data) throw film.error;
  filmId = film.data.id;

  const ws = await admin.from("tags").select("id").eq("name", "witchcraft").single();
  witchcraftTagId = ws.data!.id;
  const oc = await admin.from("tags").select("id").eq("name", "occult").single();
  occultTagId = oc.data!.id;
  const sb = await admin.from("tags").select("id").eq("name", "slow-burn").single();
  slowBurnTagId = sb.data!.id;
});

afterAll(async () => {
  if (!hasEnv) return;
  if (filmId) await adminClient().from("films").delete().eq("id", filmId);
});

describe.skipIf(!hasEnv)("getFilmTags", () => {
  it("returns null subgenre and empty vibes for an untagged film", async () => {
    const result = await getFilmTags(adminClient() as never, filmId);
    expect(result).toEqual({ subgenre: null, vibes: [] });
  });

  it("returns subgenre + vibe names when tagged", async () => {
    const admin = adminClient();
    await admin.from("film_tags").insert([
      { film_id: filmId, tag_id: witchcraftTagId },
      { film_id: filmId, tag_id: occultTagId },
      { film_id: filmId, tag_id: slowBurnTagId },
    ]);

    const result = await getFilmTags(admin as never, filmId);
    expect(result.subgenre).toBe("witchcraft");
    expect(result.vibes.sort()).toEqual(["occult", "slow-burn"]);

    await admin.from("film_tags").delete().eq("film_id", filmId);
  });
});

describe.skipIf(!hasEnv)("getAllSubgenres / getAllVibes", () => {
  it("returns all 18 sub-genres alphabetically", async () => {
    const sg = await getAllSubgenres(adminClient() as never);
    expect(sg).toHaveLength(18);
    expect(sg[0].name).toBe("body horror");
    expect(sg.at(-1)?.name).toBe("zombies");
  });

  it("returns all 36 vibes alphabetically", async () => {
    const v = await getAllVibes(adminClient() as never);
    expect(v).toHaveLength(36);
  });
});
