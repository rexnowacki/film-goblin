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
