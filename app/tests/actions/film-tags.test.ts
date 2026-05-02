import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// _setFilmTags is the testable private form (Supabase client injected).
import { _setFilmTags } from "@/lib/actions/admin/film-tags";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = !!(url && serviceKey);

describe.skipIf(!hasEnv)("_setFilmTags v2 — validation paths", () => {
  if (!hasEnv) return;
  const service = createClient<Database>(url!, serviceKey!);
  let filmId: string;
  const tag: Record<string, string> = {};

  async function tagId(name: string): Promise<string> {
    if (tag[name]) return tag[name];
    const r = await service.from("tags").select("id").eq("name", name).single();
    if (r.error || !r.data) throw new Error(`tag not found: ${name}`);
    tag[name] = r.data.id;
    return r.data.id;
  }

  beforeAll(async () => {
    if (!hasEnv) return;
    const film = await service.from("films").insert({
      itunes_id: 999000002, title: "Test Film for Action",
      year: 2024, director: "test director", runtime_min: 90, genre_primary: "Horror",
      artwork_url: "x", itunes_url: "x", tracking: false, available: true,
    }).select("id").single();
    if (film.error || !film.data) throw film.error;
    filmId = film.data.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    if (filmId) await service.from("films").delete().eq("id", filmId);
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await service.from("film_tags").delete().eq("film_id", filmId);
    await service.from("films").update({ horror_adjacent: false }).eq("id", filmId);
  });

  it("rejects when no Primary subgenre is provided", async () => {
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: "",
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [await tagId("fever dream")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [await tagId("fever dream")],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/primary/i);
  });

  it("rejects when Primary tag is not subgenre type", async () => {
    const wrongPrimary = await tagId("fever dream"); // tone, not subgenre
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: wrongPrimary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [await tagId("bleak")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [wrongPrimary, await tagId("bleak")],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects more than 2 secondary subgenres", async () => {
    const primary = await tagId("folk horror");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [await tagId("gothic"), await tagId("horror comedy"), await tagId("slasher")],
      subjectIds: [],
      toneIds: [await tagId("bleak")],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, await tagId("bleak"), await tagId("gothic"), await tagId("horror comedy"), await tagId("slasher")],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/secondary/i);
  });

  it("rejects when secondary subgenre appears at position < 5", async () => {
    const primary = await tagId("folk horror");
    const secondary = await tagId("religious horror");
    const tone = await tagId("fever dream");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [secondary],
      subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      // Secondary at index 1 (= position 2). Should be rejected.
      orderedTagIds: [primary, secondary, tone],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/secondary.*tail/i);
  });

  it("rejects 0 tones (need at least 1)", async () => {
    const primary = await tagId("folk horror");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tone/i);
  });

  it("rejects more than 3 tones", async () => {
    const primary = await tagId("folk horror");
    const tones = [
      await tagId("bleak"), await tagId("fever dream"),
      await tagId("dreamlike"), await tagId("psychedelic"),
    ];
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: tones,
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, ...tones],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when orderedTagIds is missing a picked tag", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const theme = await tagId("grief");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [theme],
      settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone], // theme missing
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when orderedTagIds[0] is not the Primary subgenre", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [tone, primary], // wrong order
    });
    expect(r.ok).toBe(false);
  });

  it("commits a valid tag set and writes positions correctly", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("fever dream");
    const theme1 = await tagId("family trauma");
    const subject = await tagId("witches");
    const setting = await tagId("period setting");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [],
      subjectIds: [subject],
      toneIds: [tone],
      themeIds: [theme1],
      settingIds: [setting],
      contentIds: [],
      orderedTagIds: [primary, theme1, subject, tone, setting],
    });
    expect(r.ok).toBe(true);
    const written = await service.from("film_tags")
      .select("position, is_primary, tag_id")
      .eq("film_id", filmId).order("position");
    expect(written.data).toEqual([
      { position: 1, is_primary: true, tag_id: primary },
      { position: 2, is_primary: false, tag_id: theme1 },
      { position: 3, is_primary: false, tag_id: subject },
      { position: 4, is_primary: false, tag_id: tone },
      { position: 5, is_primary: false, tag_id: setting },
    ]);
  });

  it("sets horror_adjacent=true when Primary is thriller", async () => {
    const primary = await tagId("thriller");
    const tone = await tagId("bleak");
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone],
    });
    expect(r.ok).toBe(true);
    const film = await service.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(film.data?.horror_adjacent).toBe(true);
  });

  it("clears horror_adjacent back to false when Primary changes off thriller", async () => {
    // Tag once with thriller as Primary (sets flag true).
    const thriller = await tagId("thriller");
    const tone = await tagId("bleak");
    await _setFilmTags(service, {
      filmId,
      primarySubgenreId: thriller,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [thriller, tone],
    });
    // Re-tag with folk horror as Primary.
    const folk = await tagId("folk horror");
    await _setFilmTags(service, {
      filmId,
      primarySubgenreId: folk,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: [], settingIds: [], contentIds: [],
      orderedTagIds: [folk, tone],
    });
    const film = await service.from("films").select("horror_adjacent").eq("id", filmId).single();
    expect(film.data?.horror_adjacent).toBe(false);
  });

  it("rejects > 3 themes, > 3 subjects, > 2 settings", async () => {
    const primary = await tagId("folk horror");
    const tone = await tagId("bleak");
    const themes = [await tagId("grief"), await tagId("isolation"), await tagId("paranoia"), await tagId("obsession")];
    const r = await _setFilmTags(service, {
      filmId,
      primarySubgenreId: primary,
      secondarySubgenreIds: [], subjectIds: [],
      toneIds: [tone],
      themeIds: themes,
      settingIds: [], contentIds: [],
      orderedTagIds: [primary, tone, ...themes],
    });
    expect(r.ok).toBe(false);
  });
});
