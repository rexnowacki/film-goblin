import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "recommendation_sent" }>;

export default function ActivityRecommendationSent({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.username} color="var(--accent)" size={40} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.username}</Link>
          {" recommended "}
          <Link href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>
          {" to "}
          <Link href={`/p/${encodeURIComponent(item.recipient.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.recipient.display_name ?? item.recipient.username}</Link>.
        </div>
        {item.note && <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 4, color: "var(--muted)" }}>&ldquo;{item.note}&rdquo;</div>}
        <ActivityFooter item={item} />
      </div>
      <Link href={`/film/${item.film.id}`}>
        <Image src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
