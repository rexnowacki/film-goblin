"use client";

import { useToast } from "./ToastProvider";

const TEMPLATE = (url: string) =>
  `the goblin wants you. i'm hunting weirder horror on film goblin — come bind with my coven. ${url}`;

interface Props {
  inviteCode: string;
}

export default function InviteFriendButton({ inviteCode }: Props) {
  const { toast } = useToast();
  const message = TEMPLATE(`https://freshfromthepit.com/invite/${encodeURIComponent(inviteCode)}`);

  async function invite() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text: message });
        toast("Sharing…");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast("Invite copied");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return; // user cancelled the native share sheet
      toast("Copy failed");
    }
  }

  return (
    <button type="button" className="invite-pill" onClick={invite}>
      ✦ Invite a friend
    </button>
  );
}
