const PHOENIX = "America/Phoenix";

export function normalizeTheaterName(name: string): string {
  return name === "The Loft Cinema" ? "The Loft" : name;
}

function dayTime(iso: string): string {
  // Format weekday and time separately so we avoid Intl's "Fri, 8:30 PM" comma.
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: PHOENIX, weekday: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: PHOENIX, hour: "numeric", minute: "2-digit" }).format(d);
  return `${weekday} ${time}`;
}

/** "The Loft · Fri 8:30 PM · 70mm" — format segment omitted when null. */
export function formatSummonMeta(theaterName: string, startsAt: string, formatLabel: string | null): string {
  const parts = [normalizeTheaterName(theaterName), dayTime(startsAt)];
  if (formatLabel) parts.push(formatLabel);
  return parts.join(" · ");
}
