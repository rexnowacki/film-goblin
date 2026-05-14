"use client";

import RitualChat from "./RitualChat";
import type { RitualMessage } from "@/lib/queries/ritual";

interface Props {
  pickId: number;
  archived: boolean;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  header: React.ReactNode;
}

export default function RitualPageBody({
  pickId,
  archived,
  initialMessages,
  currentUserId,
  viewerAvatarUrl,
  viewerDisplayName,
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
        viewerAvatarUrl={viewerAvatarUrl}
        viewerDisplayName={viewerDisplayName}
      />
    </div>
  );
}
