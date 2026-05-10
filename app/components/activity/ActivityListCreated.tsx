import Link from "next/link";
import Avatar from "../Avatar";
import ActivityFooter from "./ActivityFooter";
import type { EnrichedActivity } from "@/lib/queries/activity";

type Item = Extract<EnrichedActivity, { kind: "list_created" }>;

export default function ActivityListCreated({ item }: { item: Item }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #2a2a2a" }}>
      <Avatar name={item.actor.username} color="var(--accent)" size={36} url={item.actor.avatar_url} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.4 }}>
          <Link prefetch={false} href={`/p/${encodeURIComponent(item.actor.username)}`} style={{ color: "var(--bone)", fontWeight: 700 }}>{item.actor.username}</Link>
          {" curated a new grimoire: "}
          <Link prefetch={false} href={`/lists/${item.list.id}`} style={{ color: "var(--accent)", fontStyle: "italic" }}>{item.list.title}</Link>.
        </div>
        <ActivityFooter item={item} />
      </div>
    </div>
  );
}
