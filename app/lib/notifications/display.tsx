import type { EnrichedNotification } from "@/lib/queries/notifications";

function textSnippet(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.length > max ? raw.slice(0, max - 1) + "..." : raw;
}

function richSnippet(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
}

export function notificationTarget(n: EnrichedNotification): string {
  switch (n.kind) {
    case "coven_invite_pending":
      return "/coven#requests";
    case "coven_invite_accepted":
      return n.actor ? `/coven/shared/${encodeURIComponent(n.actor.username)}` : "/coven";
    case "recommendation_received":
    case "price_drop": {
      const filmId = (n.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "comment_on_activity":
    case "like_on_comment":
    case "reply_on_comment": {
      const activityId = (n.payload as { activity_id?: string }).activity_id;
      return activityId ? `/home?activity=${encodeURIComponent(activityId)}` : "/home";
    }
    case "rate_reminder": {
      const watchedId = (n.payload as { watched_id?: string }).watched_id;
      return watchedId ? `/watched?rate=${encodeURIComponent(watchedId)}` : "/watched";
    }
    case "theater_showing_match": {
      const showingId = (n.payload as { showing_id?: string }).showing_id;
      return showingId ? `/local-haunts/${encodeURIComponent(showingId)}` : "/home";
    }
    case "film_request_fulfilled": {
      const filmId = (n.payload as { film_id?: string }).film_id;
      return filmId ? `/film/${filmId}` : "/home";
    }
    case "gazing_rsvp": {
      const token = (n.payload as { token?: string }).token;
      return token ? `/gazing/${token}` : "/home";
    }
    case "gazing_reminder_24h":
    case "gazing_reminder_2h":
    case "gazing_aftermath": { const token=(n.payload as {token?:string}).token; return token?`/gazing/${token}?src=notification&event=${n.kind}`:"/home"; }
    case "goblin_summon": {
      const pickId = (n.payload as { pick_id?: number }).pick_id;
      const messageId = (n.payload as { message_id?: string }).message_id;
      if (!pickId) return "/ritual";
      return messageId
        ? `/ritual/${pickId}?message=${encodeURIComponent(messageId)}`
        : `/ritual/${pickId}`;
    }
  }
}

export function notificationRichCopy(n: EnrichedNotification): React.ReactNode {
  const actorName = n.actor?.username ?? "Someone";
  const title = n.film?.title ?? "a film";

  switch (n.kind) {
    case "coven_invite_pending":
      return <><strong>{actorName}</strong> invited you to their coven.</>;
    case "coven_invite_accepted":
      return <><strong>{actorName}</strong> joined your coven.</>;
    case "recommendation_received":
      return <><strong>{actorName}</strong> recommended <em>{title}</em>.</>;
    case "price_drop": {
      const p = n.payload as { new_price_usd?: number };
      return <>Price drop: <em>{title}</em>{p.new_price_usd !== undefined ? ` - $${p.new_price_usd.toFixed(2)}` : ""}.</>;
    }
    case "comment_on_activity": {
      const snippet = richSnippet((n.payload as { body?: string }).body, 60);
      const subject = n.film?.title ?? "your activity";
      return <><strong>{actorName}</strong> commented on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "like_on_comment": {
      const snippet = richSnippet((n.payload as { body?: string }).body, 60);
      const subject = n.film?.title ?? "your activity";
      return <><strong>{actorName}</strong> liked your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "reply_on_comment": {
      const snippet = richSnippet((n.payload as { body?: string }).body, 60);
      const subject = n.film?.title ?? "your comment";
      return <><strong>{actorName}</strong> replied to your comment on <em>{subject}</em>: &ldquo;{snippet}&rdquo;</>;
    }
    case "rate_reminder": {
      const count = (n.payload as { unrated_count?: number }).unrated_count ?? 1;
      return count > 1
        ? <>You have <strong>{count}</strong> unrated watches. Tell the coven what you thought.</>
        : <>Got a verdict on <em>{title}</em>? Rate it for the coven.</>;
    }
    case "theater_showing_match": {
      const p = n.payload as { title?: string; theater_name?: string; date_label?: string };
      return <><strong>Your Hoard has found a screen.</strong> <em>{p.title ?? title}</em> is coming to {p.theater_name ?? "a local theater"}{p.date_label ? ` - ${p.date_label}` : ""}.</>;
    }
    case "film_request_fulfilled": {
      const filmTitle = (n.payload as { film_title?: string }).film_title ?? "A film you requested";
      return <>Your spell of summoning was answered. <em>{filmTitle}</em> is now available.</>;
    }
    case "gazing_rsvp":
      return <><strong>{actorName}</strong> is in for your gazing of <em>{title}</em>.</>;
    case "gazing_reminder_24h": return <>Your gazing of <em>{title}</em> begins within 24 hours.</>;
    case "gazing_reminder_2h": return <>Your gazing of <em>{title}</em> begins within two hours.</>;
    case "gazing_aftermath": return <>Did the gazing of <em>{title}</em> happen? Confirm attendance and leave a verdict.</>;
    case "goblin_summon": {
      const snippet = richSnippet((n.payload as { body?: string }).body, 80);
      return <><strong>{actorName}</strong> mentioned you in ritual chat{snippet ? <>: &ldquo;{snippet}&rdquo;</> : "."}</>;
    }
  }
}

export function notificationToastText(n: EnrichedNotification): string {
  const actorName = n.actor?.username ?? "Someone";
  const title = n.film?.title ?? "a film";

  switch (n.kind) {
    case "goblin_summon": {
      const body = textSnippet((n.payload as { body?: string }).body, 72);
      return body ? `${actorName} mentioned you in ritual chat: "${body}"` : `${actorName} mentioned you in ritual chat`;
    }
    case "comment_on_activity":
      return `${actorName} commented on your activity`;
    case "reply_on_comment":
      return `${actorName} replied to your comment`;
    case "like_on_comment":
      return `${actorName} liked your comment`;
    case "recommendation_received":
      return `${actorName} recommended ${title}`;
    case "coven_invite_pending":
      return `${actorName} invited you to their coven`;
    case "coven_invite_accepted":
      return `${actorName} joined your coven`;
    case "price_drop":
      return `Price drop: ${title}`;
    case "rate_reminder":
      return "New rating reminder";
    case "theater_showing_match":
      return "A film from your Hoard found a screen";
    case "film_request_fulfilled":
      return "A film request was fulfilled";
    case "gazing_rsvp":
      return `${actorName} is in for your gazing of ${title}`;
    case "gazing_reminder_24h": return `Your gazing of ${title} begins within 24 hours`;
    case "gazing_reminder_2h": return `Your gazing of ${title} begins within two hours`;
    case "gazing_aftermath": return `Close the loop on your gazing of ${title}`;
  }
}
