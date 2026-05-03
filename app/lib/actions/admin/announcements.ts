"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireAdminUser } from "@/lib/auth/require-admin";
import {
  validateAnnouncement,
  type AnnouncementInput,
} from "./announcement-validation";

export interface PublishResult {
  ok: true;
  announcementId: string;
}
export interface ActionError {
  ok: false;
  error: string;
}

export async function adminPublishAnnouncement(
  fields: AnnouncementInput,
): Promise<PublishResult | ActionError> {
  const supabase = await createClient();
  const user = await requireAdminUser(supabase);

  const err = validateAnnouncement(fields);
  if (err) return { ok: false, error: err };

  const trimmedLabel = fields.cta_label?.trim() ?? null;
  const trimmedHref = fields.cta_href?.trim() ?? null;

  // 1) Insert the announcement row.
  const { data: created, error: insertErr } = await supabase
    .from("announcements")
    .insert({
      title: fields.title.trim(),
      body: fields.body.trim(),
      cta_label: trimmedLabel,
      cta_href: trimmedHref,
      audience: fields.audience,
      created_by: user.id,
      panel_color: fields.panel_color,
      title_color: fields.title_color,
      body_color: fields.body_color,
      cta_color: fields.cta_color,
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? "Failed to create announcement." };
  }

  // 2) When audience='specific', insert the recipient rows. If this fails we
  // delete the parent row to keep things consistent. (No transactional API
  // through PostgREST; manual cleanup is the next-best thing.)
  if (fields.audience === "specific") {
    const uniqueIds = Array.from(new Set(fields.recipient_ids));
    const recipientRows = uniqueIds.map(uid => ({
      announcement_id: created.id,
      user_id: uid,
    }));
    const { error: recErr } = await supabase
      .from("announcement_recipients")
      .insert(recipientRows);
    if (recErr) {
      const { error: deleteErr } = await supabase
        .from("announcements")
        .delete()
        .eq("id", created.id);
      if (deleteErr) {
        // Rollback failed — orphaned audience='specific' row with no recipients
        // would otherwise sit silently in the table. Surface a specific error.
        console.error("Rollback failed for announcement", created.id, deleteErr.message);
        return {
          ok: false,
          error: `Recipient insert failed and cleanup failed (${deleteErr.message}). Announcement ${created.id} may need manual deletion.`,
        };
      }
      return { ok: false, error: `Recipient insert failed: ${recErr.message}` };
    }
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
  return { ok: true, announcementId: created.id };
}

export async function adminArchiveAnnouncement(id: string): Promise<
  | { ok: true }
  | ActionError
> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { error } = await supabase
    .from("announcements")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
  return { ok: true };
}
