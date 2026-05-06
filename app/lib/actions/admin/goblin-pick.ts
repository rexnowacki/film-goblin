"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";

export async function setGoblinPick(filmId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);

  const { error } = await supabase
    .from("goblin_pick")
    .upsert({ id: 1, film_id: filmId, set_at: new Date().toISOString(), set_by: user.id });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/home");
  return { ok: true };
}
