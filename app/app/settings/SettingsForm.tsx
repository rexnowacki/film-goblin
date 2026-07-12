"use client";

import { useState } from "react";
import ProfileAvatarSection from "./components/ProfileAvatarSection";
import ProfileDetailsForm from "./components/ProfileDetailsForm";

interface SettingsFormProps {
  initialProfile: any | null;
}

export default function SettingsForm({
  initialProfile,
}: SettingsFormProps) {
  const [profile, setProfile] = useState<any>(initialProfile);

  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <div className="settings-card-stack">
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
    </div>
  );
}
