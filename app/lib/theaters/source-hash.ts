import { createHash } from "node:crypto";
import type { ScrapedTheaterShowing } from "./types";
import { normalizeTitle } from "./normalize-title";

function normalizedDateKey(s: Pick<ScrapedTheaterShowing, "startsAt" | "startsOn" | "dateLabel">): string {
  return s.startsAt ?? s.startsOn ?? (s.dateLabel ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function sourceHash(showing: Pick<ScrapedTheaterShowing, "theaterSlug" | "title" | "sourceUrl" | "startsAt" | "startsOn" | "dateLabel">): string {
  const raw = [
    showing.theaterSlug,
    normalizeTitle(showing.title),
    showing.sourceUrl.trim().toLowerCase(),
    normalizedDateKey(showing),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}
