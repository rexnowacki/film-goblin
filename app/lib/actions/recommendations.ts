"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { requireAuthUser } from "@/lib/auth/require-auth-user";

type Client = SupabaseClient<Database>;

export async function _recommendFilm(
  client: Client,
  filmId: string,
  toUserId: string,
  note: string
): Promise<{ id: string }> {
  const user = await requireAuthUser(client);
  if (user.id === toUserId) throw new Error("cannot recommend to self");

  const { data, error } = await client
    .from("recommendations")
    .insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      film_id: filmId,
      note: note ?? "",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

export async function recommendFilm(filmId: string, toUserId: string, note: string) {
  const supabase = await createClient();
  const res = await _recommendFilm(supabase, filmId, toUserId, note);
  revalidatePath("/home");
  return res;
}
