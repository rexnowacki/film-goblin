"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { toggleGazingRsvp } from "@/lib/actions/gazing";

interface Props {
  token: string;
  initialAttending: boolean;
  isHost: boolean;
  canRsvp: boolean;
  signupHref: string;
  size?: "sm" | "lg";
}

export default function GazingRsvpButton({
  token,
  initialAttending,
  isHost,
  canRsvp,
  signupHref,
  size = "lg",
}: Props) {
  const [attending, setAttending] = useState(initialAttending);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  if (isHost) {
    return <span className={`gazing-rsvp-chip${size === "sm" ? " gazing-rsvp-sm" : ""}`}>You&rsquo;re the host</span>;
  }

  const className = `gazing-rsvp-btn${size === "sm" ? " gazing-rsvp-sm" : ""}${attending ? " is-in" : ""}`;

  if (!canRsvp) {
    return <a className={className} href={signupHref}>I&rsquo;m in 👁</a>;
  }

  async function onClick() {
    setPending(true);
    const next = !attending;
    setAttending(next);
    try {
      const result = await toggleGazingRsvp(token);
      setAttending(result.attending);
      toast(result.attending ? "You're in 👁" : "You backed out");
    } catch {
      setAttending(!next);
      toast("Couldn't update RSVP");
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={className} disabled={pending} onClick={onClick}>
      {attending ? "You're in - tap to back out" : "I'm in 👁"}
    </button>
  );
}
