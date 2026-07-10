"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { requestTasteTwin, suppressTasteTwin } from "@/lib/actions/taste-twins";
import { trackProductEvent } from "@/lib/product-events/browser";
import type { TasteTwinSuggestion } from "@/lib/queries/taste-twins";

export default function TasteTwinCard({ suggestion }: { suggestion: TasteTwinSuggestion }) {
  const ref = useRef<HTMLElement>(null); const [pending, start] = useTransition(); const [state, setState] = useState<"idle" | "requested" | "hidden">("idle");
  useEffect(() => { const node = ref.current; if (!node || typeof IntersectionObserver === "undefined") return; const observer = new IntersectionObserver(entries => { if (!entries.some(e => e.isIntersecting && e.intersectionRatio >= .5)) return; trackProductEvent({ event_name: "taste_twin_viewed", subject_type: "profile", subject_id: suggestion.user.id, properties: { source: suggestion.source } }); observer.disconnect(); }, { threshold: .5 }); observer.observe(node); return () => observer.disconnect(); }, [suggestion]);
  if (state === "hidden") return null;
  const label = suggestion.source === "taste" ? "Kindred taste" : suggestion.source === "second_degree" ? "Through your coven" : "Shared watchlist";
  return <article ref={ref} className="taste-twin-card">
    <div className="taste-twin-card__person"><Avatar name={suggestion.user.username} url={suggestion.user.avatar_url} color="var(--accent)" size={42} /><div><div className="eyebrow">{label}</div><Link prefetch={false} href={`/p/${encodeURIComponent(suggestion.user.username)}`}>@{suggestion.user.username}</Link></div></div>
    {suggestion.sharedTraits.length > 0 && <p>{suggestion.sharedTraits.map(t => t.name).join(" · ")}</p>}
    {suggestion.sharedFilm && <p>Both pulled toward <em>{suggestion.sharedFilm.title}</em>.</p>}
    {state === "requested" ? <div className="taste-twin-card__success"><strong>Summons sent.</strong><Link prefetch={false} href="/films">Choose a film to recommend →</Link></div> : <div className="taste-twin-card__actions"><button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await requestTasteTwin(suggestion.user.id); trackProductEvent({ event_name: "taste_twin_request_sent", subject_type: "profile", subject_id: suggestion.user.id, properties: { source: suggestion.source } }); setState("requested"); })}>Invite to coven</button><button className="taste-twin-card__dismiss" disabled={pending} onClick={() => start(async () => { await suppressTasteTwin(suggestion.user.id); setState("hidden"); })}>Not my kindred</button></div>}
  </article>;
}
