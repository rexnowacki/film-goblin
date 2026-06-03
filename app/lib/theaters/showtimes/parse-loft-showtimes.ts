import { absoluteUrl } from "../html";
import type { ScrapedShowtime } from "./types";

const SOURCE_URL = "https://loftcinema.org/showtimes/";
const BLOCK_RE = /<div\b[^>]*class=["'][^"']*\bdate-showings\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bdate-showings\b|$)/gi;
const FILM_LINK_RE = /<h3>\s*<a\b[^>]*href=["']([^"']+)["']/i;
const SLOT_RE = /<div\b(?=[^>]*class=["'][^"']*\bselectable-date\b[^"']*["'])([^>]*)>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;
const ATTR_RE = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrs(tagAttrs: string): Map<string, string> {
  const out = new Map<string, string>();
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tagAttrs))) {
    out.set(m[1].toLowerCase(), decodeEntities(m[2]));
  }
  return out;
}

export function parseLoftShowtimes(html: string): ScrapedShowtime[] {
  const out: ScrapedShowtime[] = [];
  const blocks = html.match(BLOCK_RE) ?? [];

  for (const block of blocks) {
    const href = block.match(FILM_LINK_RE)?.[1];
    const filmUrl = href ? absoluteUrl(SOURCE_URL, href) : null;
    if (!filmUrl) continue;

    SLOT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SLOT_RE.exec(block))) {
      const slotAttrs = attrs(m[1]);
      const sid = slotAttrs.get("data-sid");
      const title = slotAttrs.get("data-title");
      const rawDate = slotAttrs.get("data-date");
      if (!sid || !title || !rawDate) continue;

      out.push({
        sid,
        title,
        rawDate,
        screenLabel: decodeEntities(m[2]),
        filmUrl,
      });
    }
  }

  return out;
}
