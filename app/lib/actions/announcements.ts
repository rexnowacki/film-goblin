"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Records a dismissal for the calling user. Treats unique-violation (PK
 * collision from a concurrent dismissal in another tab) as success.
 *
 * Not admin-gated — every authenticated user calls this for themselves.
 */
export async function dismissAnnouncement(announcementId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("announcement_dismissals")
    .insert({ user_id: user.id, announcement_id: announcementId });

  if (error) {
    // Postgres unique-violation code; both tabs dismissed → second is a no-op.
    if (error.code === "23505") {
      revalidatePath("/", "layout");
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
