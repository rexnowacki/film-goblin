"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import SettingsSection from "@/components/settings/SettingsSection";
import { updateProfile, type ProfileFields } from "@/lib/actions/profile";
import { SettingsCheckbox, SettingsInlineMessage } from "./SettingsControls";

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

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "idle" || state === "saving") return null;
  if (state === "error") {
    return <SettingsInlineMessage tone="danger">{error ?? "Could not save changes."}</SettingsInlineMessage>;
  }
  return <SettingsInlineMessage tone="accent">Saved.</SettingsInlineMessage>;
}

function SectionSubmit({
  pending,
  children,
}: {
  pending: boolean;
  children: string;
}) {
  return (
    <button type="submit" disabled={pending} className="btn" style={{ justifySelf: "start" }}>
      {pending ? "Saving..." : children}
    </button>
  );
}

export default function PreferenceSettingsForm({ profile }: PreferenceSettingsFormProps) {
  const { toast } = useToast();
  const [privacyState, setPrivacyState] = useState<SaveState>("idle");
  const [inAppState, setInAppState] = useState<SaveState>("idle");
  const [emailState, setEmailState] = useState<SaveState>("idle");
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [inAppError, setInAppError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function save(
    fields: ProfileFields,
    setState: (state: SaveState) => void,
    setError: (error: string | null) => void,
    toastMessage: string,
  ) {
    setState("saving");
    setError(null);
    try {
      await updateProfile(fields);
      setState("saved");
      toast(toastMessage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      setState("error");
    }
  }

  async function savePrivacy(fd: FormData) {
    await save(
      {
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        broadcast_library: fd.get("broadcast_library") === "on",
        broadcast_watched: fd.get("broadcast_watched") === "on",
        discoverable: fd.get("discoverable") === "on",
      },
      setPrivacyState,
      setPrivacyError,
      "Privacy saved",
    );
  }

  async function saveInApp(fd: FormData) {
    await save(
      {
        notify_rate_reminders: fd.get("notify_rate_reminders") === "on",
        notify_comment_likes: fd.get("notify_comment_likes") === "on",
        notify_film_requests: fd.get("notify_film_requests") === "on",
      },
      setInAppState,
      setInAppError,
      "Notifications saved",
    );
  }

  async function saveEmail(fd: FormData) {
    await save(
      {
        email_price_drops: fd.get("email_price_drops") === "on",
        email_coven_recs: fd.get("email_coven_recs") === "on",
        email_comments: fd.get("email_comments") === "on",
        email_coven_invites: fd.get("email_coven_invites") === "on",
      },
      setEmailState,
      setEmailError,
      "Email preferences saved",
    );
  }

  return (
    <>
      <SettingsSection
        id="privacy"
        eyebrow="Privacy"
        title="Visibility"
        description="Control what other members can see about your activity."
      >
        <form action={savePrivacy} style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <SettingsCheckbox name="broadcast" defaultChecked={profile.broadcast_watchlist_adds ?? false}>
            <span>Broadcast watchlist adds to followers</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="broadcast_library" defaultChecked={profile.broadcast_library ?? false}>
            <span>Show your library to coven members</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="broadcast_watched" defaultChecked={profile.broadcast_watched ?? false}>
            <span>Broadcast watches to your coven</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="discoverable" defaultChecked={profile.discoverable ?? true}>
            <span>
              <span>Show me in "who's watching" on film pages</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
                Other members can see you're tracking a film when they visit its page.
              </span>
            </span>
          </SettingsCheckbox>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <SectionSubmit pending={privacyState === "saving"}>Save privacy</SectionSubmit>
            <SaveStatus state={privacyState} error={privacyError} />
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        id="notifications"
        eyebrow="Notifications"
        title="In-app alerts"
        description="Choose which activity should create notifications inside Film Goblin."
      >
        <form action={saveInApp} style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <SettingsCheckbox name="notify_rate_reminders" defaultChecked={profile.notify_rate_reminders ?? true}>
            <span>Remind me to rate watches I haven't graded</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="notify_comment_likes" defaultChecked={profile.notify_comment_likes ?? true}>
            <span>Notify me when someone likes my comment</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="notify_film_requests" defaultChecked={profile.notify_film_requests ?? true}>
            <span>Notify me when a summoned film arrives</span>
          </SettingsCheckbox>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <SectionSubmit pending={inAppState === "saving"}>Save alerts</SectionSubmit>
            <SaveStatus state={inAppState} error={inAppError} />
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        id="email-notifications"
        eyebrow="Email"
        title="Email notifications"
        description="Choose which updates can leave the app and land in your inbox."
      >
        <form action={saveEmail} style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <SettingsCheckbox name="email_price_drops" defaultChecked={profile.email_price_drops ?? true}>
            <span>Price drops on my watchlist</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_coven_recs" defaultChecked={profile.email_coven_recs ?? true}>
            <span>Coven recommends me a film</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_comments" defaultChecked={profile.email_comments ?? true}>
            <span>Someone comments on my activity</span>
          </SettingsCheckbox>
          <SettingsCheckbox name="email_coven_invites" defaultChecked={profile.email_coven_invites ?? true}>
            <span>Someone invites me to their coven</span>
          </SettingsCheckbox>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)" }}>
            Only price drops actually email today. The rest are placeholders for the next time we wire up email for that kind.
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <SectionSubmit pending={emailState === "saving"}>Save email</SectionSubmit>
            <SaveStatus state={emailState} error={emailError} />
          </div>
        </form>
      </SettingsSection>
    </>
  );
}
