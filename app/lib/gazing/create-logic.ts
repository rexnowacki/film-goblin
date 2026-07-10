export const GAZING_MAX_DAYS = 180; export const LOCATION_MAX = 240;
export interface HomeGazingDraft { filmId: string; startsAt: string; timezoneLabel: string; locationNote?: string | null; broadcast: boolean; inviteeIds: string[]; }
export function validateHomeGazingDraft(input: HomeGazingDraft, now = new Date()): HomeGazingDraft {
  const starts = Date.parse(input.startsAt); if (!input.filmId || !Number.isFinite(starts) || starts <= now.getTime()) throw new Error("Choose a future date and time");
  if (starts > now.getTime() + GAZING_MAX_DAYS * 86400000) throw new Error("Watch nights may be planned up to 180 days ahead");
  if (!input.timezoneLabel || input.timezoneLabel.length > 80) throw new Error("A valid timezone is required");
  if ((input.locationNote?.length ?? 0) > LOCATION_MAX) throw new Error("Location note is too long");
  const inviteeIds=[...new Set(input.inviteeIds)]; if (input.broadcast && inviteeIds.length) throw new Error("Choose individual invitees or the whole coven, not both");
  if (!input.broadcast && !inviteeIds.length) throw new Error("Choose at least one coven member or broadcast to the coven");
  return {...input,startsAt:new Date(starts).toISOString(),inviteeIds,locationNote:input.locationNote?.trim()||null};
}
