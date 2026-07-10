"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthUser } from "@/lib/auth/require-auth-user";
import { getPitArchiveEvents } from "@/lib/feed-events/query";
import { PIT_ARCHIVE_PAGE_SIZE } from "@/lib/feed-events/pitArchive";
import type { SystemFeedEvent } from "@/lib/feed-events/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface LoadMorePitArchiveResult {
  events: SystemFeedEvent[];
  nextCursor: string | null;
  done: boolean;
}

export async function _loadMorePitArchive(
  client: Client,
  args: { before: string; limit?: number },
): Promise<LoadMorePitArchiveResult> {
  await requireAuthUser(client);
  const before = args.before?.trim();
  if (!before) throw new Error("archive cursor required");

  const limit = Math.max(1, Math.min(args.limit ?? PIT_ARCHIVE_PAGE_SIZE, 100));
  const events = await getPitArchiveEvents(client, { before, limit });
  return {
    events,
    nextCursor: events.at(-1)?.created_at ?? null,
    done: events.length < limit,
  };
}

/** Read-only, RLS-bound archive pagination. No revalidation is needed. */
export async function loadMorePitArchive(args: {
  before: string;
  limit?: number;
}): Promise<LoadMorePitArchiveResult> {
  const client = await createClient();
  return _loadMorePitArchive(client, args);
}
