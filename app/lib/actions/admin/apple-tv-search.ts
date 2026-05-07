"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { searchAppleTv, type AppleTvSearchResult } from "@/lib/search/apple-tv";
import type { ITunesSearchHit } from "@/lib/search/itunes-hit";

export type SearchCandidate = ITunesSearchHit;
export type SearchResult = AppleTvSearchResult;

export async function adminSearchAppleTv(term: string): Promise<SearchResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const trimmed = term.trim();
  if (!trimmed) return { ok: true, candidates: [] };

  return await searchAppleTv(trimmed);
}
