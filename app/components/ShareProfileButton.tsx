"use client";

import { useToast } from "./ToastProvider";

const SITE_ORIGIN = "https://film-goblin.vercel.app";

export function buildProfileInviteUrl(username: string): string {
  return `${SITE_ORIGIN}/p/${encodeURIComponent(username)}?invite=1`;
}

export function buildProfileInviteMessage(displayName: string, url: string): string {
  return `${displayName} on Film Goblin: ${url}`;
}

interface Props {
  username: string;
  displayName: string;
}

export default function ShareProfileButton({ username, displayName }: Props) {
  const { toast } = useToast();
  const url = buildProfileInviteUrl(username);
  const message = buildProfileInviteMessage(displayName, url);

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: message });
        toast("Sharing…");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast("Invite link copied");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return;
      toast("Copy failed");
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={share}>
      ✦ Invite a friend
    </button>
  );
}
