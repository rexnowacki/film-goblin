"use client";

import { useState, useTransition } from "react";
import { follow, unfollow } from "@/lib/actions/follows";

interface Props {
  userId: string;
  handle: string;
  initialFollowing: boolean;
}

export default function FollowButton({ userId, handle, initialFollowing }: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (following) {
          await unfollow(userId, handle);
          setFollowing(false);
        } else {
          await follow(userId, handle);
          setFollowing(true);
        }
      } catch (e) { console.error(e); }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="btn btn-outline"
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {following ? "✓ Following" : "+ Follow"}
    </button>
  );
}
