"use client";

import Link from "next/link";
import { useTransition } from "react";
import Avatar from "./ui/Avatar";
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
        <span style={{
          fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--muted)",
          border: "1px solid var(--muted)", borderRadius: 4, padding: "2px 6px",
          flexShrink: 0,
        }}>
          Pending
        </span>
      );
    }
    if (state === "pending_inbound") {
      return (
        <button className="btn btn-sm" onClick={handleAccept} disabled={pending}>
          {pending ? "Accepting…" : "Accept"}
        </button>
      );
    }
    return (
      <button className="btn btn-sm btn-outline" onClick={handleInvite} disabled={pending}>
        {pending ? "Inviting…" : "+ Invite"}
      </button>
    );
  })();

  return (
    <div className="pill-row">
      <Avatar name={profile.username} color="var(--accent)" size={32} url={profile.avatar_url} />
      <Link
        prefetch={false}
        href={`/p/${encodeURIComponent(profile.username)}`}
        style={{ flex: 1, minWidth: 0, color: "var(--bone)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {profile.username}
      </Link>
      {button}
    </div>
  );
}
