"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import BottomSheet from "@/components/BottomSheet";
import { getProfileCovenPreview } from "@/lib/profile-page";

export interface ProfileCovenMember {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Props {
  members: ProfileCovenMember[];
  isOwner: boolean;
}

function MemberPill({ member }: { member: ProfileCovenMember }) {
  return (
    <Link
      prefetch={false}
      href={`/p/${encodeURIComponent(member.username)}`}
      className="profile-coven-pill"
      title={`@${member.username}`}
    >
      <Avatar name={member.username} color="var(--accent)" size={34} url={member.avatar_url} />
      <span>@{member.username}</span>
    </Link>
  );
}

export default function ProfileCovenRoster({ members, isOwner }: Props) {
  const [open, setOpen] = useState(false);
  const preview = getProfileCovenPreview(members);

  if (members.length === 0) {
    return <div className="profile-collection-empty">No coven has gathered yet.</div>;
  }

  return (
    <>
      <div className="profile-section__topline profile-coven-topline">
        <div className="eyebrow">{isOwner ? "Your Coven" : "Their Coven"}</div>
        {members.length > preview.length && (
          <button type="button" className="profile-coven-view-all" onClick={() => setOpen(true)}>
            View all ({members.length})
          </button>
        )}
      </div>
      <div className="profile-coven-row">
        {preview.map(member => <MemberPill key={member.id} member={member} />)}
      </div>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${isOwner ? "Your" : "Their"} Coven · ${members.length}`}
      >
        <div className="profile-coven-sheet-list">
          {members.map(member => <MemberPill key={member.id} member={member} />)}
        </div>
      </BottomSheet>
    </>
  );
}
