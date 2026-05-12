"use client";

import { useState } from "react";
import AccountSettingsSection from "./components/AccountSettingsSection";
import PreferenceSettingsForm from "./components/PreferenceSettingsForm";
import ProfileAvatarSection from "./components/ProfileAvatarSection";
import ProfileDetailsForm from "./components/ProfileDetailsForm";

interface SettingsFormProps {
  initialProfile: any | null;
  initialAuthEmail: string | null;
  initialHasPasswordIdentity: boolean;
}

export default function SettingsForm({
  initialProfile,
  initialAuthEmail,
  initialHasPasswordIdentity,
}: SettingsFormProps) {
  const [profile, setProfile] = useState<any>(initialProfile);

  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <div style={{ display: "grid", gap: 32 }}>
      <ProfileAvatarSection
        displayName={profile.display_name ?? ""}
        username={profile.username ?? ""}
        avatarUrl={profile.avatar_url ?? null}
        onAvatarChange={(avatarUrl) => setProfile({ ...profile, avatar_url: avatarUrl })}
      />
      <ProfileDetailsForm
        username={profile.username ?? ""}
        displayName={profile.display_name ?? ""}
        bio={profile.bio ?? ""}
        onProfileChange={(fields) => setProfile({ ...profile, ...fields })}
      />
      <PreferenceSettingsForm profile={profile} />
      <AccountSettingsSection
        authEmail={initialAuthEmail}
        emailAddedAt={profile.email_added_at ?? null}
        hasPasswordIdentity={initialHasPasswordIdentity}
      />
    </div>
  );
}
