"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { updateProfile } from "@/lib/actions/profile";
import { isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/auth/username";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsTextArea, SettingsTextField } from "./SettingsControls";

interface ProfileDetailsFormProps {
  username: string;
  displayName: string;
  bio: string;
  onProfileChange: (profile: { username: string; display_name: string; bio: string }) => void;
}

export default function ProfileDetailsForm({
  username: initialUsername,
  displayName,
  bio,
  onProfileChange,
}: ProfileDetailsFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(initialUsername);
  const trimmedUsername = username.trim().toLowerCase();
  const usernameInvalid = trimmedUsername.length > 0 && !isValidUsername(trimmedUsername);

  async function save(fd: FormData) {
    setSaving(true);
    try {
      const fields = {
        username: String(fd.get("username")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
      };
      await updateProfile(fields);
      onProfileChange({
        username: fields.username.trim().toLowerCase(),
        display_name: fields.display_name,
        bio: fields.bio,
      });
      toast("Profile saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="profile" eyebrow="Profile" title="Name and bio">
      <form action={save} style={{ display: "grid", gap: 16, maxWidth: 540 }}>
        <SettingsTextField
          label="Username"
          name="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          maxLength={24}
          error={usernameInvalid ? USERNAME_RULES_MESSAGE : null}
        />
        <SettingsTextField name="display_name" label="Display Name" defaultValue={displayName} required maxLength={50} />
        <SettingsTextArea name="bio" label="Bio" defaultValue={bio} rows={4} maxLength={500} />
        <button type="submit" disabled={saving || usernameInvalid} className="btn" style={{ justifySelf: "start" }}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </SettingsSection>
  );
}
