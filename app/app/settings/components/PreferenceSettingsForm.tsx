"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { updateProfile } from "@/lib/actions/profile";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsCheckbox } from "./SettingsControls";

interface PreferenceSettingsFormProps {
  profile: {
    broadcast_watchlist_adds?: boolean | null;
    broadcast_library?: boolean | null;
    broadcast_watched?: boolean | null;
    email_price_drops?: boolean | null;
    email_coven_recs?: boolean | null;
    email_comments?: boolean | null;
    email_coven_invites?: boolean | null;
    notify_rate_reminders?: boolean | null;
    notify_comment_likes?: boolean | null;
    notify_film_requests?: boolean | null;
    discoverable?: boolean | null;
  };
}

export default function PreferenceSettingsForm({ profile }: PreferenceSettingsFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  async function save(fd: FormData) {
    setSaving(true);
    try {
      await updateProfile({
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        broadcast_library: fd.get("broadcast_library") === "on",
        broadcast_watched: fd.get("broadcast_watched") === "on",
        email_price_drops: fd.get("email_price_drops") === "on",
        email_coven_recs: fd.get("email_coven_recs") === "on",
        email_comments: fd.get("email_comments") === "on",
        email_coven_invites: fd.get("email_coven_invites") === "on",
        notify_rate_reminders: fd.get("notify_rate_reminders") === "on",
        notify_comment_likes: fd.get("notify_comment_likes") === "on",
        notify_film_requests: fd.get("notify_film_requests") === "on",
        discoverable: fd.get("discoverable") === "on",
      });
      toast("Preferences saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="preferences" eyebrow="Notifications and privacy" title="Preferences">
      <form action={save} style={{ display: "grid", gap: 18, maxWidth: 620 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="caps" style={{ fontSize: 11, color: "var(--accent)" }}>Activity</div>
          <SettingsCheckbox name="broadcast" defaultChecked={profile.broadcast_watchlist_adds ?? false}>
            <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="broadcast_library" defaultChecked={profile.broadcast_library ?? false}>
            <span className="caps" style={{ fontSize: 11 }}>Show your library to coven members</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="broadcast_watched" defaultChecked={profile.broadcast_watched ?? false}>
            <span className="caps" style={{ fontSize: 11 }}>Broadcast watches to your coven</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="discoverable" defaultChecked={profile.discoverable ?? true}>
            <span>
              <span className="caps" style={{ fontSize: 11 }}>Show me in "who's watching" on film pages</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
                Other members can see you're tracking a film when they visit its page.
              </span>
            </span>
          </SettingsCheckbox>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div className="caps" style={{ fontSize: 11, color: "var(--accent)" }}>In-app notifications</div>
          <SettingsCheckbox name="notify_rate_reminders" defaultChecked={profile.notify_rate_reminders ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Remind me to rate watches I haven't graded</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="notify_comment_likes" defaultChecked={profile.notify_comment_likes ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Notify me when someone likes my comment</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="notify_film_requests" defaultChecked={profile.notify_film_requests ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Notify me when a summoned film arrives</span>
          </SettingsCheckbox>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div className="caps" style={{ fontSize: 11, color: "var(--accent)" }}>Email me when...</div>
          <SettingsCheckbox name="email_price_drops" defaultChecked={profile.email_price_drops ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Price drops on my watchlist</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_coven_recs" defaultChecked={profile.email_coven_recs ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Coven recommends me a film</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_comments" defaultChecked={profile.email_comments ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Someone comments on my activity</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_coven_invites" defaultChecked={profile.email_coven_invites ?? true}>
            <span className="caps" style={{ fontSize: 11 }}>Someone invites me to their coven</span>
          </SettingsCheckbox>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
            Only price drops actually email today. The rest are placeholders for the next time we wire up email for that kind.
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn" style={{ justifySelf: "start" }}>
          {saving ? "Saving..." : "Save preferences"}
        </button>
      </form>
    </SettingsSection>
  );
}
