import { absoluteUrl, htmlToLines } from "../html";
import { extractYearFromTitle, stripYearFromTitle } from "../normalize-title";
import { parseDateLabel } from "../date-label";
import type { ScrapedTheaterShowing, TheaterScraperProvider } from "../types";

const SOURCE_URL = "https://www.guildcinema.com/comingsoon";

function isTitle(line: string): boolean {
  return /^[A-Z0-9][A-Z0-9 '.:!?&\-()]+$/.test(line)
    && line.length <= 140
    && !/^WHAT'S COMING SOON\??$/i.test(line)
    && !/^ALBUQUERQUE'S/i.test(line);
}

function isDateLine(line: string): boolean {
  return /^may\s+\d/i.test(line)
    || /^jun[e]?\s+\d/i.test(line)
    || /^jul[y]?\s+\d/i.test(line)
    || /^aug(ust)?\s+\d/i.test(line)
    || /^sep(t|tember)?\s+\d/i.test(line)
    || /^oct(ober)?\s+\d/i.test(line)
    || /^nov(ember)?\s+\d/i.test(line)
    || /^dec(ember)?\s+\d/i.test(line)
    || /^jan(uary)?\s+\d/i.test(line)
    || /^feb(ruary)?\s+\d/i.test(line)
    || /^mar(ch)?\s+\d/i.test(line)
    || /^apr(il)?\s+\d/i.test(line);
}

interface GuildBlock {
  html: string;
  link: string | undefined;
}

function itemBlocks(html: string): GuildBlock[] {
  const blocks: GuildBlock[] = [];
  const re = /(<div role=["']listitem["'][\s\S]*?)(?=<div role=["']listitem["']|<\/body>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const block = m[1];
    const linkMatch = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*aria-label=["']Read More["']/i)
      ?? block.match(/<a\b[^>]*aria-label=["']Read More["'][^>]*href=["']([^"']+)["']/i);
    blocks.push({ html: block, link: absoluteUrl(SOURCE_URL, linkMatch?.[1]) });
  }
  return blocks.length ? blocks : [{ html, link: undefined }];
}

function nextPageUrl(html: string): string | null {
  const m = html.match(/<link\b[^>]*rel=["']next["'][^>]*href=["']([^"']+)["']/i)
    ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']next["']/i);
  return absoluteUrl(SOURCE_URL, m?.[1]) ?? null;
}

export function parseGuildComingSoon(html: string, now = new Date()): ScrapedTheaterShowing[] {
  const out: ScrapedTheaterShowing[] = [];
  for (const block of itemBlocks(html)) {
    const lines = htmlToLines(block.html);
    for (let i = 0; i < lines.length; i++) {
      const rawTitle = lines[i];
      if (!isTitle(rawTitle)) continue;
      const dateIdx = [i + 2, i + 3, i + 4].find((idx) => isDateLine(lines[idx] ?? ""));
      if (dateIdx == null) continue;

      const description = lines.slice(i + 1, dateIdx).filter((line) => !/^read more$/i.test(line)).join(" ") || undefined;
      const dateLabel = lines[dateIdx];
      const showtimeLabel = lines[dateIdx + 1] && !isTitle(lines[dateIdx + 1]) && !/^read more$/i.test(lines[dateIdx + 1])
        ? lines[dateIdx + 1]
        : undefined;
      const parsed = parseDateLabel(dateLabel, now);
      const year = extractYearFromTitle(rawTitle);
      const title = stripYearFromTitle(rawTitle);

      out.push({
        title,
        rawTitle,
        sourceId: year ? `${title}-${year}` : undefined,
        theaterSlug: "guild-cinema",
        sourceUrl: block.link ?? SOURCE_URL,
        description,
        categoryLabels: [],
        dateLabel: parsed.dateLabel,
        rawDateText: dateLabel,
        startsOn: parsed.startsOn ?? undefined,
        datePrecision: parsed.datePrecision,
        showtimeLabel,
        rawShowtimeText: showtimeLabel,
      });
      break;
    }
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
    if (!res.ok) throw new Error(`Guild fetch failed: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeGuildComingSoon(): Promise<ScrapedTheaterShowing[]> {
  const seen = new Set<string>();
  const pages: string[] = [];
  let url: string | null = SOURCE_URL;
  while (url && !seen.has(url) && pages.length < 10) {
    seen.add(url);
    const html = await fetchText(url);
    pages.push(html);
    url = nextPageUrl(html);
  }
  const all = pages.flatMap((html) => parseGuildComingSoon(html));
  const byKey = new Map<string, ScrapedTheaterShowing>();
  for (const showing of all) {
    byKey.set(`${showing.title}|${showing.dateLabel}|${showing.showtimeLabel ?? ""}`, showing);
  }
  return Array.from(byKey.values());
}

export const guildProvider: TheaterScraperProvider = {
  theaterSlug: "guild-cinema",
  sourceName: "Guild Cinema Coming Soon",
  sourceUrl: SOURCE_URL,
  scrapeComingSoon: scrapeGuildComingSoon,
};
