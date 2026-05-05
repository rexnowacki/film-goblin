import type { DatePrecision } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface ParsedDateLabel {
  startsOn: string | null;
  datePrecision: DatePrecision;
  dateLabel: string;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferYear(month: number, day: number, now = new Date()): number {
  const year = now.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Coming-soon calendars can cross the new year. If the parsed date is more
  // than 45 days in the past, treat it as next year.
  return candidate < today - 45 * 24 * 60 * 60 * 1000 ? year + 1 : year;
}

export function parseDateLabel(label: string, now = new Date()): ParsedDateLabel {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return { startsOn: null, datePrecision: "unknown", dateLabel: clean };
  if (/^now playing$/i.test(clean)) {
    return { startsOn: null, datePrecision: "label", dateLabel: clean };
  }

  // The Loft: Starts May 8, Wednesday, May 6, Saturday, Jun 20.
  const exact = clean.match(/^(?:starts\s+)?(?:[a-z]+,\s*)?([a-z]+)\s+(\d{1,2})$/i);
  if (exact) {
    const month = MONTHS[exact[1].toLowerCase()];
    const day = Number(exact[2]);
    if (month && day >= 1 && day <= 31) {
      return {
        startsOn: isoDate(inferYear(month, day, now), month, day),
        datePrecision: "date",
        dateLabel: clean,
      };
    }
  }

  // Guild: May 15 is safe. Ranges like May 6 & 7 plus 29 stay label-only.
  const guildSingle = clean.match(/^([a-z]+)\s+(\d{1,2})$/i);
  if (guildSingle) {
    const month = MONTHS[guildSingle[1].toLowerCase()];
    const day = Number(guildSingle[2]);
    if (month && day >= 1 && day <= 31) {
      return {
        startsOn: isoDate(inferYear(month, day, now), month, day),
        datePrecision: "date",
        dateLabel: clean,
      };
    }
  }

  return { startsOn: null, datePrecision: "label", dateLabel: clean };
}
