import type { FeedEventType } from "./copy";
import type { SystemFeedEvent } from "./types";

export const DIGEST_MIN_SIZE = 2;
export const DIGEST_MAX_MEMBERS = 10;

export const DIGEST_EXEMPT_TYPES: ReadonlySet<FeedEventType> = new Set([
  "all_time_low",
  "last_showing",
]);

export interface PitDigestFilm {
  id: string;
  title: string;
  artwork_url: string | null;
}

export interface PitDigestPayload extends Record<string, unknown> {
  digest: true;
  memberIds: string[];
  memberFilms: PitDigestFilm[];
  memberCount: number;
  digestKey: string;
}

const COPY: Partial<Record<FeedEventType, (count: number) => string>> = {
  now_free: (count) => `The goblin heaped the free pile higher. **${count} films** are free right now.`,
  left_free: (count) => `The goblin watched ${count} films slip back behind the tollgate.`,
  price_drop: (count) => `The goblin pried the price tags off **${count} films** tonight.`,
  price_rise: (count) => `${count} prices crept back up while the goblin glared.`,
  new_film: (count) => `The goblin dragged **${count} new films** into the pit.`,
  now_on_apple: (count) => `${count} films crossed over — now on Apple TV.`,
};

function digestCopy(type: FeedEventType, count: number): string {
  return COPY[type]?.(count) ?? `The goblin surfaced **${count} omens** from the pit.`;
}

function isDigestPayload(payload: Record<string, unknown>): payload is PitDigestPayload {
  return payload.digest === true
    && Array.isArray(payload.memberIds)
    && payload.memberIds.every((id) => typeof id === "string")
    && Array.isArray(payload.memberFilms)
    && typeof payload.memberCount === "number"
    && typeof payload.digestKey === "string";
}

export function getPitDigestPayload(event: SystemFeedEvent): PitDigestPayload | null {
  return isDigestPayload(event.payload) ? event.payload : null;
}

export function isPitDigest(event: SystemFeedEvent): boolean {
  return getPitDigestPayload(event) !== null;
}

function newestFirst(events: SystemFeedEvent[]): SystemFeedEvent[] {
  return [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function digestFilms(events: SystemFeedEvent[]): PitDigestFilm[] {
  const seen = new Set<string>();
  const films: PitDigestFilm[] = [];
  for (const event of events) {
    if (!event.film || seen.has(event.film.id)) continue;
    seen.add(event.film.id);
    films.push(event.film);
    if (films.length === 3) break;
  }
  return films;
}

/**
 * Replaces same-type, non-personal survivors with synthetic digest units.
 * Only selected members enter a digest: overflow remains un-impressed and is
 * therefore eligible to form a separate, differently keyed later batch.
 */
export function bundlePitDigests(
  events: SystemFeedEvent[],
  watchlistFilmIds: string[],
  now: Date,
): SystemFeedEvent[] {
  const watchlist = new Set(watchlistFilmIds);
  const passthrough: SystemFeedEvent[] = [];
  const groups = new Map<FeedEventType, SystemFeedEvent[]>();

  for (const event of events) {
    if (DIGEST_EXEMPT_TYPES.has(event.event_type) || (event.film_id != null && watchlist.has(event.film_id))) {
      passthrough.push(event);
      continue;
    }
    const group = groups.get(event.event_type);
    if (group) group.push(event);
    else groups.set(event.event_type, [event]);
  }

  const day = now.toISOString().slice(0, 10);
  const digested: SystemFeedEvent[] = [];
  for (const [eventType, group] of groups) {
    if (group.length < DIGEST_MIN_SIZE) {
      digested.push(...group);
      continue;
    }
    const members = newestFirst(group).slice(0, DIGEST_MAX_MEMBERS);
    const memberIds = members.map((member) => member.id);
    const digestKey = `digest:${eventType}:${day}:${memberIds.join(",")}`;
    const payload: PitDigestPayload = {
      digest: true,
      memberIds,
      memberFilms: digestFilms(members),
      memberCount: members.length,
      digestKey,
    };
    digested.push({
      id: digestKey,
      event_type: eventType,
      film_id: null,
      payload,
      copy: digestCopy(eventType, members.length),
      priority: Math.max(...members.map((member) => member.priority)),
      created_at: members[0].created_at,
      film: null,
    });
  }

  return [...passthrough, ...digested];
}
