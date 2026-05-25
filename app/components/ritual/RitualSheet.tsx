"use client";

import { useEffect, useState } from "react";
import ThreadSheet from "@/components/modals/ThreadSheet";
import { createClient } from "@/lib/supabase/client";
import type { RitualMessage, RitualPick } from "@/lib/queries/ritual";
import RitualChat from "./RitualChat";

interface Props {
  open: boolean;
  onClose: () => void;
  pick: RitualPick;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  viewerUsername: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  viewerIsAdmin?: boolean;
}

export default function RitualSheet({
  open,
  onClose,
  pick,
  initialMessages,
  currentUserId,
  viewerUsername,
  viewerAvatarUrl,
  viewerDisplayName,
  viewerIsAdmin = false,
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMessages(initialMessages);
    setVersion(v => v + 1);

    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("goblin_pick_messages")
      .select("id, pick_id, body, mentions, created_at, profiles!user_id(id, username, display_name, avatar_url)")
      .eq("pick_id", pick.pick_id)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMessages(data
          .filter((r): r is typeof r & { profiles: NonNullable<typeof r.profiles> } => Boolean(r.profiles))
          .map(r => ({
            id: r.id,
            pick_id: r.pick_id,
            body: r.body,
            mentions: r.mentions ?? [],
            created_at: r.created_at,
            author: r.profiles as unknown as RitualMessage["author"],
          })));
        setVersion(v => v + 1);
      });

    return () => { cancelled = true; };
  }, [open, pick.pick_id, initialMessages]);

  const title = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      <span>The Ritual</span>
      <span className="dot-accent">•</span>
      <span
        style={{
          fontSize: 18,
          color: "var(--muted)",
          fontFamily: "var(--font-ui)",
          fontWeight: 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {pick.film.title}
      </span>
    </span>
  );

  return (
    <ThreadSheet open={open} onClose={onClose} title={title} belowTopNav wide>
      <RitualChat
        key={`${pick.pick_id}-${version}`}
        pickId={pick.pick_id}
        archived={false}
        initialMessages={messages}
        currentUserId={currentUserId}
        viewerUsername={viewerUsername}
        viewerAvatarUrl={viewerAvatarUrl}
        viewerDisplayName={viewerDisplayName}
        viewerIsAdmin={viewerIsAdmin}
        surface="sheet"
      />
    </ThreadSheet>
  );
}
