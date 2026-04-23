import Link from "next/link";
import Avatar from "../Avatar";
import { relativeTime } from "./relativeTime";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "coven_joined" }>;

export default function ActivityCovenJoined({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.display_name ?? item.actor.handle} color="var(--accent)" size={40} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link href={`/p/${encodeURIComponent(item.actor.handle)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.display_name ?? item.actor.handle}</Link>
          {" joined "}
          <Link href={`/p/${encodeURIComponent(item.other.handle)}`} style={{ color: "var(--accent)", fontWeight: 700 }}>{item.other.display_name ?? item.other.handle}</Link>
          {"'s coven."}
        </div>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>{relativeTime(item.created_at)}</div>
      </div>
    </div>
  );
}
