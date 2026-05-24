"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseFilm, searchFilms } from "film-goblin-worker";
import { toHit } from "@/lib/search/itunes-hit";
import { searchAppleTv } from "@/lib/search/apple-tv";
import { lookupTmdb, searchTmdb } from "@/lib/search/tmdb";
import { adminCreateFilm, type FilmFormFields } from "@/lib/actions/admin/films";
import { parseBulkFilmInput, type BulkFilmSeed } from "@/lib/admin/bulk-film-import";

export type BulkFilmStatus =
  | "matched_itunes"
  | "matched_tmdb"
  | "already_exists"
  | "duplicate_input"
  | "needs_review"
  | "ignored"
  | "created"
  | "error";

export interface BulkFilmPreviewRow {
  lineNumber: number;
  raw: string;
  inputTitle: string;
  inputYear: number | null;
  status: BulkFilmStatus;
  source: "itunes" | "tmdb" | "manual" | null;
  fields: FilmFormFields | null;
  existingFilmId: string | null;
  message: string | null;
  selectable: boolean;
}

export interface BulkFilmCreateInput {
  lineNumber: number;
  fields: FilmFormFields;
}

export interface BulkFilmCreateResult {
  lineNumber: number;
  title: string;
  status: "created" | "already_exists" | "error";
  filmId: string | null;
  message: string | null;
}

const MAX_BULK_CREATE = 75;

function blankRow(parsed: {
  lineNumber: number;
  raw: string;
  status: BulkFilmStatus;
  message?: string | null;
  seed?: BulkFilmSeed;
}): BulkFilmPreviewRow {
  return {
    lineNumber: parsed.lineNumber,
    raw: parsed.raw,
    inputTitle: parsed.seed?.title ?? "",
    inputYear: parsed.seed?.year ?? null,
    status: parsed.status,
    source: null,
    fields: null,
    existingFilmId: null,
    message: parsed.message ?? null,
    selectable: false,
  };
}

function fieldsFromItunesHit(hit: ReturnType<typeof toHit>): FilmFormFields {
  return {
    itunes_id: hit.itunes_id,
    title: hit.title,
    director: hit.director,
    year: hit.year,
    runtime_min: hit.runtime_min,
    genre_primary: hit.genre_primary,
    description: hit.description,
    content_advisory: hit.content_advisory,
    artwork_url: hit.artwork_url,
    itunes_url: hit.itunes_url,
    tracking: true,
    available: true,
    tmdb_id: null,
    theatrical_release_date: null,
    series_id: null,
    series_new_name: "",
    series_order: null,
  };
}

async function findExistingFilm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fields: Pick<FilmFormFields, "itunes_id" | "tmdb_id" | "title" | "year">,
): Promise<string | null> {
  if (fields.itunes_id) {
    const { data } = await supabase
      .from("films")
      .select("id")
      .eq("itunes_id", fields.itunes_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (fields.tmdb_id) {
    const { data } = await supabase
      .from("films")
      .select("id")
      .eq("tmdb_id", fields.tmdb_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (fields.title.trim() && fields.year) {
    const { data } = await supabase
      .from("films")
      .select("id")
      .eq("title", fields.title.trim())
      .eq("year", fields.year)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

async function resolveSeed(seed: BulkFilmSeed): Promise<
  | { status: "matched_itunes"; source: "itunes"; fields: FilmFormFields; message: string | null }
  | { status: "matched_tmdb"; source: "tmdb"; fields: FilmFormFields; message: string | null }
  | { status: "needs_review"; source: "manual"; fields: null; message: string }
  | { status: "error"; source: null; fields: null; message: string }
> {
  const query = seed.year ? `${seed.title} ${seed.year}` : seed.title;

  try {
    const itunesRes = await searchFilms(query, { limit: 3 });
    const parsed = itunesRes.results?.[0] ? parseFilm(itunesRes.results[0]) : null;
    if (parsed) {
      return { status: "matched_itunes", source: "itunes", fields: fieldsFromItunesHit(toHit(parsed)), message: null };
    }
  } catch (e) {
    console.debug("adminPreviewBulkFilms: iTunes direct failed:", e);
  }

  try {
    const appleRes = await searchAppleTv(query);
    if (appleRes.ok && appleRes.candidates.length > 0) {
      return { status: "matched_itunes", source: "itunes", fields: fieldsFromItunesHit(appleRes.candidates[0]), message: null };
    }
  } catch (e) {
    console.debug("adminPreviewBulkFilms: Apple TV search failed:", e);
  }

  try {
    const tmdbRes = await searchTmdb(query);
    if (tmdbRes.ok && tmdbRes.candidates.length > 0) {
      const best = seed.year
        ? tmdbRes.candidates.find(c => c.year === seed.year) ?? tmdbRes.candidates[0]
        : tmdbRes.candidates[0];
      const lookup = await lookupTmdb(best.tmdb_id);
      if (lookup.ok) {
        return { status: "matched_tmdb", source: "tmdb", fields: lookup.fields, message: "No iTunes match; TMDB row will be visible but not price-tracked." };
      }
      return { status: "error", source: null, fields: null, message: lookup.error };
    }
  } catch (e) {
    console.debug("adminPreviewBulkFilms: TMDB search failed:", e);
  }

  return { status: "needs_review", source: "manual", fields: null, message: "No confident iTunes or TMDB match. Add manually." };
}

export async function adminPreviewBulkFilms(rawText: string): Promise<
  | { ok: true; rows: BulkFilmPreviewRow[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const parsed = parseBulkFilmInput(rawText);
  const rows: BulkFilmPreviewRow[] = [];

  for (const item of parsed) {
    if (item.status === "ignored") {
      if (item.raw.trim()) rows.push(blankRow({ ...item, status: "ignored" }));
      continue;
    }
    if (item.status === "duplicate_input" || !item.seed) {
      rows.push(blankRow({ ...item, status: "duplicate_input" }));
      continue;
    }

    const resolved = await resolveSeed(item.seed);
    if (!resolved.fields) {
      rows.push({
        ...blankRow({ ...item, status: resolved.status, message: resolved.message, seed: item.seed }),
        source: resolved.source,
      });
      continue;
    }

    const existingFilmId = await findExistingFilm(supabase, resolved.fields);
    rows.push({
      lineNumber: item.lineNumber,
      raw: item.raw,
      inputTitle: item.seed.title,
      inputYear: item.seed.year,
      status: existingFilmId ? "already_exists" : resolved.status,
      source: resolved.source,
      fields: resolved.fields,
      existingFilmId,
      message: existingFilmId ? "Already in the catalog." : resolved.message,
      selectable: !existingFilmId,
    });
  }

  return { ok: true, rows };
}

export async function adminCreateBulkFilms(rows: BulkFilmCreateInput[]): Promise<
  | { ok: true; results: BulkFilmCreateResult[] }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const limitedRows = rows.slice(0, MAX_BULK_CREATE);
  const results: BulkFilmCreateResult[] = [];

  for (const row of limitedRows) {
    const title = row.fields.title.trim();
    try {
      const existingFilmId = await findExistingFilm(supabase, row.fields);
      if (existingFilmId) {
        results.push({ lineNumber: row.lineNumber, title, status: "already_exists", filmId: existingFilmId, message: "Already in the catalog." });
        continue;
      }

      const created = await adminCreateFilm(row.fields);
      if (created.ok) {
        results.push({ lineNumber: row.lineNumber, title, status: "created", filmId: created.filmId, message: null });
      } else {
        results.push({ lineNumber: row.lineNumber, title, status: "error", filmId: null, message: created.error });
      }
    } catch (e) {
      results.push({
        lineNumber: row.lineNumber,
        title,
        status: "error",
        filmId: null,
        message: e instanceof Error ? e.message : "Create failed.",
      });
    }
  }

  revalidatePath("/admin/films");
  return { ok: true, results };
}
