export function formatProfileJoinedDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Joined the pit";
  return `Joined ${new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)}`;
}

export function formatProfileStat(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export const PROFILE_COVEN_INLINE_LIMIT = 8;

export function getProfileCovenPreview<T>(members: T[]): T[] {
  return members.slice(0, PROFILE_COVEN_INLINE_LIMIT);
}

export type PublicProfileRole = "goblin" | "witch" | "high_goblin";

/**
 * The pentagram is an admin verification mark, so the authoritative staff
 * role wins even when a legacy profile row still says "goblin".
 */
export function getVerifiedProfileRole(
  profileRole: PublicProfileRole,
  staffRole: "admin" | "reviewer" | null | undefined,
): PublicProfileRole {
  return staffRole === "admin" ? "witch" : profileRole;
}
