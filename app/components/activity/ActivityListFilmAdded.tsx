import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "list_film_added" }>;

export default function ActivityListFilmAdded({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" added "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" to "}
          <Link href="/lists" style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.list.title}</Link>.
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
      <Link href={`/film/${item.film.id}`}>
        <img src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
