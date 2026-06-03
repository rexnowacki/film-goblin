const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PHOENIX_OFFSET = "-07:00";
const FORMAT_RE = /\b(70mm|35mm|16mm|imax|4k restoration|open air)\b/i;

interface ParsedRawDate {
  weekday: string;
  month: number;
  day: number;
  hour24: number;
  minute: number;
}

function parseRawDate(raw: string): ParsedRawDate | null {
  const match = raw.match(/^([A-Za-z]{3})\s+(\d{1,2})\/(\d{1,2})\s+@\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) return null;

  const [, weekday, month, day, hour, minute, meridiem] = match;
  let hour24 = Number(hour) % 12;
  if (meridiem.toLowerCase() === "pm") hour24 += 12;

  return {
    weekday: weekday.slice(0, 3),
    month: Number(month),
    day: Number(day),
    hour24,
    minute: Number(minute),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function phoenixYear(date: Date): number {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
  }).format(date);
  return Number(year);
}

function calendarWeekday(year: number, month: number, day: number): string | null {
  const noonPhoenix = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00.000${PHOENIX_OFFSET}`);
  if (Number.isNaN(noonPhoenix.getTime())) return null;
  return WEEKDAYS[noonPhoenix.getUTCDay()];
}

export function resolveShowtimeDate(raw: string, now: Date = new Date()): string | null {
  const parsed = parseRawDate(raw);
  if (!parsed) return null;

  const wantedWeekday = parsed.weekday.toLowerCase();
  const baseYear = phoenixYear(now);

  for (const year of [baseYear, baseYear + 1]) {
    const actualWeekday = calendarWeekday(year, parsed.month, parsed.day);
    if (!actualWeekday || actualWeekday.toLowerCase() !== wantedWeekday) continue;

    const date = new Date(
      `${year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour24)}:${pad(parsed.minute)}:00.000${PHOENIX_OFFSET}`,
    );
    if (Number.isNaN(date.getTime())) continue;
    if (date.getTime() < now.getTime() - 36 * 60 * 60 * 1000) continue;
    return date.toISOString();
  }

  return null;
}

function normalizeFormatLabel(label: string): string {
  return label
    .replace(/imax/i, "IMAX")
    .replace(/4k restoration/i, "4K Restoration")
    .replace(/open air/i, "Open Air")
    .replace(/mm/i, "mm");
}

export function detectFormatLabel(title: string, screenLabel: string): string | null {
  const fromTitle = title.match(FORMAT_RE);
  if (fromTitle) return normalizeFormatLabel(fromTitle[1]);
  if (/open air/i.test(screenLabel)) return screenLabel.trim();
  return null;
}
