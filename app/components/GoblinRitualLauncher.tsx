"use client";

import { useState } from "react";
import RitualSheet from "@/components/ritual/RitualSheet";
import type { RitualMessage, RitualPick } from "@/lib/queries/ritual";

interface Props {
  pick: RitualPick | null;
  initialMessages: RitualMessage[];
  currentUserId: string | null;
  viewerUsername: string | null;
  viewerAvatarUrl: string | null;
  viewerDisplayName: string | null;
  viewerIsAdmin?: boolean;
  variant: "desktop" | "mobile";
}

export default function GoblinRitualLauncher({
  pick,
  initialMessages,
  currentUserId,
  viewerUsername,
  viewerAvatarUrl,
  viewerDisplayName,
  viewerIsAdmin = false,
  variant,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!pick) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={variant === "mobile" ? mobileStyle : desktopStyle}
      >
        Join the Ritual →
      </button>
      <RitualSheet
        open={open}
        onClose={() => setOpen(false)}
        pick={pick}
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        viewerUsername={viewerUsername}
        viewerAvatarUrl={viewerAvatarUrl}
        viewerDisplayName={viewerDisplayName}
        viewerIsAdmin={viewerIsAdmin}
      />
    </>
  );
}

const desktopStyle: React.CSSProperties = {
  display: "inline",
  appearance: "none",
  background: "transparent",
  border: 0,
  padding: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  lineHeight: 1,
  color: "var(--bone)",
  textDecoration: "none",
  letterSpacing: "0.06em",
  cursor: "pointer",
  textAlign: "left",
};

const mobileStyle: React.CSSProperties = {
  display: "inline-block",
  appearance: "none",
  margin: 0,
  padding: 0,
  textAlign: "left",
  fontFamily: "var(--font-ui)",
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--bone)",
  background: "transparent",
  textDecoration: "none",
  border: 0,
  cursor: "pointer",
};
