"use server";

import { createClient } from "@/lib/supabase/server";
import { getForYou } from "@/lib/queries/fyp/forYou";

export async function loadMoreForYou(cursor: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], filmsByIdEntries: [], nextCursor: null, done: true };
  const page = await getForYou(supabase, user.id, { cursor, limit: 20 });
  return {
    items: page.items,
    filmsByIdEntries: Array.from(page.filmsById.entries()),
    nextCursor: page.nextCursor,
    done: page.done,
  };
}
