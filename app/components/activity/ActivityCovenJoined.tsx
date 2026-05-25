import Link from "next/link";
import Avatar from "../ui/Avatar";
import ActivityFooter from "./ActivityFooter";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "coven_joined" }>;

export default function ActivityCovenJoined({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" joined "}
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.other.username)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{item.other.username}</Link>
          {"'s coven."}
        </div>
        <ActivityFooter item={item} />
      </div>
    </div>
  );
}
