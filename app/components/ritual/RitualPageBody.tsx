"use client";

import RitualChat from "./RitualChat";
import type { RitualMessage } from "@/lib/queries/ritual";

interface Props {
  pickId: number;
  archived: boolean;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  viewerUsername: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  viewerIsAdmin?: boolean;
  header: React.ReactNode;
}

export default function RitualPageBody({
  pickId,
  archived,
  initialMessages,
  currentUserId,
  viewerUsername,
  viewerAvatarUrl,
  viewerDisplayName,
  viewerIsAdmin = false,
  header,
}: Props) {
  return (
    <div
      className="container-wide"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        padding: "12px var(--container-pad) 12px",
        gap: 12,
      }}
    >
      {header}
      <RitualChat
        pickId={pickId}
        archived={archived}
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        viewerUsername={viewerUsername}
        viewerAvatarUrl={viewerAvatarUrl}
        viewerDisplayName={viewerDisplayName}
        viewerIsAdmin={viewerIsAdmin}
      />
    </div>
  );
}
