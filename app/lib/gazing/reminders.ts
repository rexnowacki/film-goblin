import type { GazingReminderKind } from "./types";
export interface ReminderInvite { status: "scheduled" | "happened" | "cancelled"; startsAt: string; reminder24hSentAt: string | null; reminder2hSentAt: string | null; aftermathSentAt: string | null; }
export function getReminderDue(invite: ReminderInvite, now: Date): GazingReminderKind[] {
  const delta = Date.parse(invite.startsAt) - now.getTime(); const out: GazingReminderKind[] = [];
  if (invite.status === "scheduled" && delta > 2 * 60 * 60 * 1000 && delta <= 24 * 60 * 60 * 1000 && !invite.reminder24hSentAt) out.push("gazing_reminder_24h");
  if (invite.status === "scheduled" && delta > 0 && delta <= 2 * 60 * 60 * 1000 && !invite.reminder2hSentAt) out.push("gazing_reminder_2h");
  if ((invite.status === "happened" && delta <= 0 || invite.status === "scheduled" && delta <= -2 * 60 * 60 * 1000) && !invite.aftermathSentAt) out.push("gazing_aftermath");
  return out;
}
