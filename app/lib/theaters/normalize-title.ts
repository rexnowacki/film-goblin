export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+[-–—]\s+spanish subtitles$/i, "")
    .replace(/\s+with live commentary.*$/i, "")
    .replace(/\s+in 70mm$/i, "")
    .replace(/\s+4k restoration!?$/i, "")
    .replace(/\s+\(\d{4}\)$/i, "")
    .replace(/^the\s+/i, "")
    .replace(/^a\s+/i, "")
    .replace(/^an\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractYearFromTitle(title: string): number | null {
  const m = title.match(/\((\d{4})\)\s*$/);
  return m ? Number(m[1]) : null;
}

export function stripYearFromTitle(title: string): string {
  return title.replace(/\s+\(\d{4}\)\s*$/, "").trim();
}
