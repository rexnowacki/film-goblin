import { htmlToLines, absoluteUrl } from "../html";
import { normalizeTitle } from "../normalize-title";
import { parseDateLabel } from "../date-label";
import type { ScrapedTheaterShowing, TheaterScraperProvider } from "../types";

const SOURCE_URL = "https://loftcinema.org/coming-soon/";

function isRuntime(line: string): boolean {
  return /^\d+\s*HR\s+\d+\s*MIN\s+\|\s+.+$/i.test(line);
}

function isDateLike(line: string): boolean {
  return /^now playing$/i.test(line)
    || /^starts\s+[a-z]+\s+\d{1,2}$/i.test(line)
    || /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),\s+[a-z]+\s+\d{1,2}$/i.test(line);
}

function splitRuntimeRating(line: string): { runtimeLabel?: string; ratingLabel?: string } {
  const [runtime, rating] = line.split("|").map((part) => part.trim());
  return { runtimeLabel: runtime || undefined, ratingLabel: rating || undefined };
}

function titleHrefMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = htmlToLines(m[2]).join(" ").trim();
    if (text) out.set(normalizeTitle(text), absoluteUrl(SOURCE_URL, m[1]) ?? SOURCE_URL);
  }
  return out;
}

export function parseLoftComingSoon(html: string, now = new Date()): ScrapedTheaterShowing[] {
  const lines = htmlToLines(html);
  const links = titleHrefMap(html);
  const out: ScrapedTheaterShowing[] = [];

  for (let i = 0; i < lines.length; i++) {
    const title = lines[i];
    if (!title || title.length > 120) continue;
    if (!isRuntime(lines[i + 1] ?? "")) continue;

    const { runtimeLabel, ratingLabel } = splitRuntimeRating(lines[i + 1]);
    const labels: string[] = [];
    let j = i + 2;
    while (j < lines.length && labels.length < 4 && !/^view our showtimes$/i.test(lines[j])) {
      if (/^get tickets$/i.test(lines[j])) break;
      if (isRuntime(lines[j]) || isRuntime(lines[j + 1] ?? "")) break;
      labels.push(lines[j]);
      if (isDateLike(lines[j])) break;
      j++;
    }

    const dateLabel = labels.find(isDateLike);
    if (!dateLabel) continue;
    const categoryLabels = labels.filter((label) => label !== dateLabel);
    const parsed = parseDateLabel(dateLabel, now);
    out.push({
      title,
      rawTitle: title,
      theaterSlug: "loft-cinema",
      sourceUrl: links.get(normalizeTitle(title)) ?? SOURCE_URL,
      runtimeLabel,
      ratingLabel,
      categoryLabels,
      dateLabel: parsed.dateLabel,
      rawDateText: dateLabel,
      startsOn: parsed.startsOn ?? undefined,
      datePrecision: parsed.datePrecision,
    });
  }

  return out;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "FilmGoblinBot/0.1 (+local-haunts)" },
    });
    if (!res.ok) throw new Error(`Loft fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export const loftProvider: TheaterScraperProvider = {
  theaterSlug: "loft-cinema",
  sourceName: "The Loft Cinema Coming Soon",
  sourceUrl: SOURCE_URL,
  scrapeComingSoon: async () => parseLoftComingSoon(await fetchText(SOURCE_URL)),
};
