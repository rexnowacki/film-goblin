import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "review_published" }>;

export default function ActivityReviewPublished({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" published a review of "}
          <Link prefetch={false} href={`/film/${item.film.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>.
        </div>
        {item.pullquote && <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, marginTop: 4, color: "var(--bone)", borderLeft: "2px solid var(--accent)", paddingLeft: 10 }}>&ldquo;{item.pullquote}&rdquo;</div>}
        <ActivityFooter item={item} />
      </div>
      <Link prefetch={false} href={`/film/${item.film.id}`}>
        <Image src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
