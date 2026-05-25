"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Avatar from "@/components/ui/Avatar";
const AvatarEditor = dynamic(() => import("@/components/modals/AvatarEditor"));
import { useToast } from "@/components/ToastProvider";
import { updateProfile } from "@/lib/actions/profile";
import { createClient } from "@/lib/supabase/client";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsInlineMessage } from "./SettingsControls";

interface ProfileAvatarSectionProps {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  onAvatarChange: (avatarUrl: string | null) => void;
}

export default function ProfileAvatarSection({
  displayName,
  username,
  avatarUrl,
  onAvatarChange,
}: ProfileAvatarSectionProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setAvatarError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please pick an image file.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setAvatarError("That image is too large (max 15MB before crop).");
      return;
    }
    setPendingFile(file);
    e.target.value = "";
  }

  async function uploadCropped(blob: Blob) {
    setAvatarUploading(true);
    setAvatarError(null);
    setPendingFile(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setAvatarError("Not signed in.");
        return;
      }
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "image/jpeg" });
      if (uploadErr) {
        setAvatarError(uploadErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile({ avatar_url: pub.publicUrl });
      onAvatarChange(pub.publicUrl);
      router.refresh();
      toast("Avatar updated");
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    if (!avatarUrl) return;
    if (!confirm("Remove your profile picture?")) return;
    setRemovingAvatar(true);
    setAvatarError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setAvatarError("Not signed in.");
        return;
      }
      const marker = "/avatars/";
      const idx = avatarUrl.indexOf(marker);
      if (idx >= 0) {
        const path = avatarUrl.slice(idx + marker.length);
        await supabase.storage.from("avatars").remove([path]);
      }
      await updateProfile({ avatar_url: null as unknown as string });
      onAvatarChange(null);
      router.refresh();
      toast("Avatar removed");
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setRemovingAvatar(false);
    }
  }

  return (
    <SettingsSection id="profile-picture" eyebrow="Profile" title="Profile picture">
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <Avatar name={displayName || username || "You"} color="var(--accent)" size={72} url={avatarUrl} />
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "inline-block", cursor: avatarUploading ? "default" : "pointer", padding: "8px 14px", border: "2px solid var(--bone)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {avatarUploading ? "Uploading..." : (avatarUrl ? "Replace" : "Upload")}
              <input type="file" accept="image/*" onChange={pickFile} disabled={avatarUploading} style={{ display: "none" }} />
            </label>
            {avatarUrl ? (
              <button onClick={removeAvatar} disabled={removingAvatar || avatarUploading} style={{ padding: "8px 14px", background: "transparent", color: "var(--danger)", border: "2px solid var(--danger)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: removingAvatar ? "default" : "pointer" }}>
                {removingAvatar ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </div>
          {avatarError ? <SettingsInlineMessage tone="danger">{avatarError}</SettingsInlineMessage> : null}
        </div>
      </div>
      {pendingFile ? (
        <AvatarEditor
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onSave={uploadCropped}
        />
      ) : null}
    </SettingsSection>
  );
}
