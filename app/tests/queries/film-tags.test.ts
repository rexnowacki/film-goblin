import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getFilmTags, getAllTagsGroupedByType } from "@/lib/queries/film-tags";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(url && serviceKey);

describe.skipIf(!hasEnv)("getFilmTags + getAllTagsGroupedByType", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);
  let filmId: string;
  let primaryTagId: string;
  let tagB: string;
  let tagC: string;
  let tagD: string;
  let tagE: string;
  let tagF: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    const film = await service.from("films").insert({
      itunes_id: 999000001, title: "Test Film for Tag Queries",
      year: 2024, director: "test director", runtime_min: 90, genre_primary: "Horror",
      artwork_url: "x", itunes_url: "x", tracking: false, available: true,
    }).select("id").single();
    if (film.error || !film.data) throw film.error;
    filmId = film.data.id;
    primaryTagId = (await service.from("tags").select("id").eq("name", "folk horror").single()).data!.id;
    tagB = (await service.from("tags").select("id").eq("name", "fever dream").single()).data!.id;
    tagC = (await service.from("tags").select("id").eq("name", "family trauma").single()).data!.id;
    tagD = (await service.from("tags").select("id").eq("name", "witches").single()).data!.id;
    tagE = (await service.from("tags").select("id").eq("name", "period setting").single()).data!.id;
    tagF = (await service.from("tags").select("id").eq("name", "religious horror").single()).data!.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    if (filmId) await service.from("films").delete().eq("id", filmId);
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await service.from("film_tags").delete().eq("film_id", filmId);
  });

  it("returns visible (positions 1-4) and hidden (positions 5+) split", async () => {
    await service.from("film_tags").insert([
      { film_id: filmId, tag_id: primaryTagId, position: 1, is_primary: true },
      { film_id: filmId, tag_id: tagB, position: 2, is_primary: false },
      { film_id: filmId, tag_id: tagC, position: 3, is_primary: false },
      { film_id: filmId, tag_id: tagD, position: 4, is_primary: false },
      { film_id: filmId, tag_id: tagE, position: 5, is_primary: false },
      { film_id: filmId, tag_id: tagF, position: 6, is_primary: false },
    ]);
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible.map(t => t.position)).toEqual([1, 2, 3, 4]);
    expect(tags.hidden.map(t => t.position)).toEqual([5, 6]);
    expect(tags.visible[0].is_primary).toBe(true);
    expect(tags.visible[0].name).toBe("folk horror");
  });

  it("returns empty arrays for an untagged film", async () => {
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible).toEqual([]);
    expect(tags.hidden).toEqual([]);
  });

  it("orders visible array by position even if rows came back unordered", async () => {
    await service.from("film_tags").insert([
      { film_id: filmId, tag_id: tagD, position: 4, is_primary: false },
      { film_id: filmId, tag_id: primaryTagId, position: 1, is_primary: true },
      { film_id: filmId, tag_id: tagC, position: 3, is_primary: false },
      { film_id: filmId, tag_id: tagB, position: 2, is_primary: false },
    ]);
    const tags = await getFilmTags(service, filmId);
    expect(tags.visible.map(t => t.position)).toEqual([1, 2, 3, 4]);
  });
});

describe.skipIf(!hasEnv)("getAllTagsGroupedByType", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);

  it("groups tags by type and returns canonical counts", async () => {
    const grouped = await getAllTagsGroupedByType(service);
    expect(grouped.subgenre.length).toBe(24);
    expect(grouped.subject.length).toBe(17);
    expect(grouped.tone.length).toBe(16);
    expect(grouped.theme.length).toBe(21);
    expect(grouped.setting.length).toBe(6);
    expect(grouped.content.length).toBe(4);
    // breakup horror is in themes
    expect(grouped.theme.some(t => t.name === "breakup horror")).toBe(true);
  });
});
