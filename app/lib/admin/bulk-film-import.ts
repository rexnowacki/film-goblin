export interface BulkFilmSeed {
  lineNumber: number;
  raw: string;
  title: string;
  year: number | null;
  normalizedKey: string;
}

export type BulkFilmParseStatus = "ready" | "duplicate_input" | "ignored";

export interface BulkFilmParsedLine {
  lineNumber: number;
  raw: string;
  status: BulkFilmParseStatus;
  seed?: BulkFilmSeed;
  message?: string;
}

const MAX_IMPORT_ROWS = 75;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/,\s*(the|a|an)$/, "")
    .replace(/&/g, "and")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripMarkdownPrefix(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

function isIgnoredMarkdownLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^\|.*\|$/.test(trimmed)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true;
  if (/^```/.test(trimmed)) return true;
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return true;
  return false;
}

function parseTitleAndYear(cleanedLine: string): { title: string; year: number | null } | null {
  let value = cleanedLine.trim();
  if (!value) return null;

  if (value.startsWith("|") && value.endsWith("|")) {
    const cells = value.split("|").map(cell => cell.trim()).filter(Boolean);
    if (cells.length > 0) value = cells.slice(0, 2).join(" | ");
  }

  let year: number | null = null;
  const patterns = [
    /^(.*?)\s*\(((?:19|20)\d{2})\)\s*$/,
    /^(.*?)\s*[-–—|]\s*((19|20)\d{2})\s*$/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      value = match[1].trim();
      year = Number(match[2]);
      break;
    }
  }

  value = value
    .replace(/\s+\[[^\]]+\]\s*$/, "")
    .replace(/\s+https?:\/\/\S+\s*$/, "")
    .trim();

  if (!value || value.length > 200) return null;
  return { title: value, year };
}

export function parseBulkFilmInput(rawText: string, limit = MAX_IMPORT_ROWS): BulkFilmParsedLine[] {
  const seen = new Set<string>();
  const parsed: BulkFilmParsedLine[] = [];
  let readyCount = 0;

  rawText.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    if (isIgnoredMarkdownLine(raw)) {
      parsed.push({ lineNumber, raw, status: "ignored", message: "Blank or Markdown structure." });
      return;
    }

    const cleaned = stripMarkdownPrefix(raw);
    const titleYear = parseTitleAndYear(cleaned);
    if (!titleYear) {
      parsed.push({ lineNumber, raw, status: "ignored", message: "No movie title found." });
      return;
    }

    const normalizedTitle = normalizeTitle(titleYear.title);
    if (!normalizedTitle) {
      parsed.push({ lineNumber, raw, status: "ignored", message: "No movie title found." });
      return;
    }

    const normalizedKey = `${normalizedTitle}:${titleYear.year ?? ""}`;
    const seed: BulkFilmSeed = {
      lineNumber,
      raw,
      title: titleYear.title,
      year: titleYear.year,
      normalizedKey,
    };

    if (seen.has(normalizedKey)) {
      parsed.push({ lineNumber, raw, status: "duplicate_input", seed, message: "Duplicate in this import." });
      return;
    }

    seen.add(normalizedKey);
    readyCount += 1;
    if (readyCount > limit) {
      parsed.push({ lineNumber, raw, status: "ignored", message: `Import preview is limited to ${limit} movies.` });
      return;
    }

    parsed.push({ lineNumber, raw, status: "ready", seed });
  });

  return parsed;
}
