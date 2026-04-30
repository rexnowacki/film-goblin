"use client";

import Link from "next/link";
import { useTransition } from "react";
import Avatar from "./Avatar";
import { sendCovenRequest, acceptCovenRequest } from "@/lib/actions/coven";

export interface SearchPersonRowProps {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  };
  state: "none" | "pending_outbound" | "pending_inbound";
  incomingRequestId?: string;
}

export default function SearchPersonRow({ profile, state, incomingRequestId }: SearchPersonRowProps) {
  const [pending, startTransition] = useTransition();

  const handleInvite = () => {
    startTransition(async () => {
      await sendCovenRequest(profile.id);
    });
  };

  const handleAccept = () => {
    if (!incomingRequestId) return;
    startTransition(async () => {
      await acceptCovenRequest(incomingRequestId);
    });
  };

  const button = (() => {
    if (state === "pending_outbound") {
      return (
        <button className="btn" disabled style={{ opacity: 0.5 }}>
          Pending
        </button>
      );
    }
    if (state === "pending_inbound") {
      return (
        <button className="btn" onClick={handleAccept} disabled={pending}>
          {pending ? "Accepting…" : "Accept"}
        </button>
      );
    }
    return (
      <button className="btn btn-outline" onClick={handleInvite} disabled={pending}>
        {pending ? "Inviting…" : "+ Invite"}
      </button>
    );
  })();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", border: "2px solid var(--bone)", padding: 16 }}>
      <Link
        href={`/p/${encodeURIComponent(profile.username)}`}
        style={{ display: "flex", alignItems: "center", gap: 14, flex: "1 1 220px", textDecoration: "none", color: "inherit", minWidth: 0 }}
      >
        <Avatar name={profile.display_name ?? profile.username} color="var(--accent)" size={48} url={profile.avatar_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
            {profile.display_name ?? profile.username}
          </div>
          <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            @{profile.username}
          </div>
          {profile.bio && (
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--bone)",
                opacity: 0.8,
                marginTop: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.bio}
            </div>
          )}
        </div>
      </Link>
      {button}
    </div>
  );
}
