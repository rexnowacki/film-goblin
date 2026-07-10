export type CovenSection = "pending" | "actions" | "members" | "discovery" | "invite";

export function getCovenSectionOrder(input: { pendingCount: number; memberCount: number }): CovenSection[] {
  const sections: CovenSection[] = [];
  if (input.pendingCount > 0) sections.push("pending");
  sections.push("actions");
  if (input.memberCount > 0) sections.push("members", "discovery", "invite");
  else sections.push("discovery", "invite");
  return sections;
}
