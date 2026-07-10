// Pure payload builder for Web Push. Consumed by /api/push/fanout.
// v1 allowlist = social kinds + price drops (spec 2026-07-03). Kinds outside
// the set return null — the fanout drops them silently.

export const PUSH_KINDS: ReadonlySet<string> = new Set([
  "coven_invite_pending",
  "coven_invite_accepted",
  "recommendation_received",
  "comment_on_activity",
  "reply_on_comment",
  "gazing_rsvp",
  "price_drop",
  "gazing_reminder_24h",
  "gazing_reminder_2h",
  "gazing_aftermath",
]);

export interface PushPayloadInput {
  kind: string;
  payload: Record<string, unknown>;
  actor: { username: string; display_name: string | null } | null;
  filmTitle: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const BODY_MAX = 90;

function truncate(s: string): string {
  return s.length > BODY_MAX ? `${s.slice(0, BODY_MAX)}…` : s;
}

function usd(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "a new low";
}

export function buildPushPayload(input: PushPayloadInput): PushPayload | null {
  const { kind, payload, actor, filmTitle } = input;
  if (!PUSH_KINDS.has(kind)) return null;

  const who = actor ? (actor.display_name ?? actor.username) : "Someone";
  const film = filmTitle ?? "a film";
  const str = (k: string): string | null =>
    typeof payload[k] === "string" ? (payload[k] as string) : null;

  switch (kind) {
    case "coven_invite_pending":
      return {
        title: "A summons to your coven",
        body: `${who} wants to join your coven.`,
        url: "/coven#requests",
        tag: `coven_invite_pending:${str("coven_request_id") ?? "x"}`,
      };
    case "coven_invite_accepted":
      return {
        title: "Your coven grows",
        body: `${who} accepted your summons.`,
        url: actor ? `/coven/shared/${encodeURIComponent(actor.username)}` : "/coven",
        tag: `coven_invite_accepted:${str("coven_request_id") ?? "x"}`,
      };
    case "recommendation_received":
      return {
        title: "A film is pressed into your hands",
        body: `${who} recommends ${film}.`,
        url: str("film_id") ? `/film/${str("film_id")}` : "/home",
        tag: `recommendation_received:${str("recommendation_id") ?? "x"}`,
      };
    case "comment_on_activity":
    case "reply_on_comment": {
      const activityId = str("activity_id");
      return {
        title: kind === "comment_on_activity" ? `${who} commented` : `${who} replied`,
        body: truncate(str("body") ?? ""),
        url: activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home",
        tag: `${kind}:${str("comment_id") ?? "x"}`,
      };
    }
    case "gazing_rsvp":
      return {
        title: "Another gazer joins",
        body: `${who} will be there for ${film}.`,
        url: str("token") ? `/gazing/${str("token")}` : "/home",
        tag: `gazing_rsvp:${str("invite_id") ?? "x"}`,
      };
    case "gazing_reminder_24h":
    case "gazing_reminder_2h":
    case "gazing_aftermath": {
      const token=str("token");const inviteId=str("invite_id")??"x";
      const aftermath=kind==="gazing_aftermath";
      return {title:aftermath?"The gazing awaits its verdict":kind==="gazing_reminder_2h"?"The gazing begins in two hours":"The gazing begins tomorrow",body:aftermath?`Did ${film} happen? Close the loop with your verdict.`:`${film} is waiting for the coven.`,url:token?`/gazing/${token}?src=push&event=${kind}`:"/home",tag:`${kind}:${inviteId}`};
    }
    case "price_drop":
      return {
        title: `${film} — the price fell`,
        body: `Now ${usd(payload.new_price_usd)} on Apple TV (was ${usd(payload.old_price_usd)}).`,
        url: str("film_id") ? `/film/${str("film_id")}` : "/home",
        tag: `price_drop:${str("price_alert_id") ?? "x"}`,
      };
    default:
      return null;
  }
}
