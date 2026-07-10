"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { toggleGazingRsvp } from "@/lib/actions/gazing";
import { trackProductEvent } from "@/lib/product-events/browser";

interface Props {
  token: string;
  inviteId: string;
  filmTitle: string;
  startsAt: string;
  locationLabel: string;
  initialAttending: boolean;
  isHost: boolean;
  canRsvp: boolean;
  signupHref: string;
  size?: "sm" | "lg";
}

export default function GazingRsvpButton({
  token,
  inviteId,
  filmTitle,
  startsAt,
  locationLabel,
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
      trackProductEvent({event_name:"gazing_rsvp_changed",subject_type:"gazing_invite",subject_id:inviteId,properties:{attending:result.attending}});
      toast(result.attending ? "You're in 👁" : "You backed out");
    } catch {
      setAttending(!next);
      toast("Couldn't update RSVP");
    } finally {
      setPending(false);
    }
  }

  const calendarUrl=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Shared gazing: ${filmTitle}`)}&dates=${new Date(startsAt).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}/${new Date(Date.parse(startsAt)+2*60*60*1000).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}&location=${encodeURIComponent(locationLabel)}`;
  return (
    <div className="gazing-rsvp-wrap">
    <button type="button" className={className} disabled={pending} onClick={onClick}>
      {attending ? "You're in - tap to back out" : "I'm in 👁"}
    </button>
    {attending&&<div className="gazing-rsvp-next"><a href={calendarUrl} target="_blank" rel="noreferrer">Add to calendar</a><span>24-hour and 2-hour reminders are armed.</span></div>}
    </div>
  );
}
