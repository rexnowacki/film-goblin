import Image from "next/image";
import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import { formatSummonMeta } from "@/lib/gazing/summon-meta";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "gazing_invited" }>;

export default function ActivityGazingInvited({ item }: { item: Item }) {
  const gazingHref = `/gazing/${item.token}`;
  const meta = formatSummonMeta(item.theaterName, item.startsAt, item.formatLabel);

  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" summons the coven to a shared gazing of "}
          <Link prefetch={false} href={gazingHref} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.film.title}</Link>.
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: "var(--muted)", letterSpacing: "0.04em" }}>{meta}</div>
        <ActivityFooter item={item} />
      </div>
      <Link prefetch={false} href={gazingHref}>
        <Image src={item.film.artwork_url} alt={item.film.title} width={40} height={60} style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }} />
      </Link>
    </div>
  );
}
