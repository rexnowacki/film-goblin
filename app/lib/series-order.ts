// Heuristic series detection for film listings. Two films are considered
// part of the same series when they share a director AND a normalized title
// "root" — the title with a trailing sequel marker stripped. Series order
// comes from the parsed numeral (Arabic or Roman). Films without a numeral
// suffix get order 1 ("Terrifier" → 1; "Terrifier 2" → 2; "Halloween III:
// Season of the Witch" → 3).
//
// Limits (accepted for v1, no schema needed): un-numbered sequels like
// "Friday the 13th: A New Beginning" are treated as standalone; "Saw 3D"
// degrades to a standalone because the regex won't match a 3D suffix.
// Refine by adding films.series_id / series_order columns later if needed.

const SEQUEL_RE = /\s+(?:Part\s+)?(\d+|[IVX]+)(?:\s*[:—–-].*)?$/i;
const ROMAN: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};

function parseOrder(token: string): number {
  const t = token.trim().toUpperCase();
  if (/^\d+$/.test(t)) return Number(t);
  return ROMAN[t] ?? 1;
}

export interface SeriesKey {
  root: string;
  order: number;
  key: string;
}

export function getSeriesKey(title: string, director: string | null): SeriesKey {
  const m = title.match(SEQUEL_RE);
  const dirKey = (director ?? "").toLowerCase().trim();
  if (!m) {
    const root = title.toLowerCase().trim();
    return { root, order: 1, key: `${dirKey}|${root}` };
  }
  const root = title.slice(0, m.index).toLowerCase().trim();
  const order = parseOrder(m[1]);
  return { root, order, key: `${dirKey}|${root}` };
}

interface FilmShape {
  title: string;
  year: number | null;
  director: string | null;
}

/**
 * Group films into series and emit them in series order, with the series
 * anchored by the result of `anchorCompare(firstFilm, firstFilm)` applied
 * to each group's first entry. Standalones (group of 1) participate in
 * the same anchor sort.
 */
export function groupAndSortBySeries<T extends FilmShape>(
  films: T[],
  anchorCompare: (a: T, b: T) => number,
): T[] {
  const groups = new Map<string, T[]>();
  for (const f of films) {
    const { key } = getSeriesKey(f.title, f.director);
    const arr = groups.get(key);
    if (arr) arr.push(f);
    else groups.set(key, [f]);
  }

  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      const oa = getSeriesKey(a.title, a.director).order;
      const ob = getSeriesKey(b.title, b.director).order;
      if (oa !== ob) return oa - ob;
      return (a.year ?? 0) - (b.year ?? 0);
    });
  }

  const sortedGroups = [...groups.values()].sort((g1, g2) => anchorCompare(g1[0], g2[0]));
  return sortedGroups.flatMap(g => g);
}
