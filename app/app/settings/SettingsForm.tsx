"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, changePassword } from "@/lib/actions/profile";
import { signOut } from "@/lib/actions/auth";
import Avatar from "@/components/Avatar";
import AvatarEditor from "@/components/AvatarEditor";

export default function SettingsForm() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasPasswordIdentity, setHasPasswordIdentity] = useState(true);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwPending, setPwPending] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const router = useRouter();

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
    e.target.value = ""; // reset so picking the same file again re-fires
  }

  async function uploadCropped(blob: Blob) {
    setAvatarUploading(true);
    setAvatarError(null);
    setPendingFile(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAvatarError("Not signed in."); return; }
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: "image/jpeg" });
      if (uploadErr) { setAvatarError(uploadErr.message); return; }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile({ avatar_url: pub.publicUrl });
      setProfile({ ...profile, avatar_url: pub.publicUrl });
      router.refresh();
    } catch (err: any) {
      setAvatarError(err?.message ?? "Upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    if (!profile?.avatar_url) return;
    if (!confirm("Remove your profile picture?")) return;
    setRemovingAvatar(true);
    setAvatarError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAvatarError("Not signed in."); return; }
      // Best-effort: delete the blob at the stored URL's object path.
      const marker = "/avatars/";
      const idx = profile.avatar_url.indexOf(marker);
      if (idx >= 0) {
        const path = profile.avatar_url.slice(idx + marker.length);
        await supabase.storage.from("avatars").remove([path]);
      }
      await updateProfile({ avatar_url: null as unknown as string });
      setProfile({ ...profile, avatar_url: null });
      router.refresh();
    } catch (err: any) {
      setAvatarError(err?.message ?? "Remove failed.");
    } finally {
      setRemovingAvatar(false);
    }
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setHasPasswordIdentity((user.identities ?? []).some((i: any) => i.provider === "email"));
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setLoading(false);
    })();
  }, []);

  async function save(fd: FormData) {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({
        handle: String(fd.get("handle")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
        broadcast_watchlist_adds: fd.get("broadcast") === "on",
        email_notifications_enabled: fd.get("email_notifications") === "on",
      });
      setSaved(true);
    } finally { setSaving(false); }
  }

  async function handleChangePassword(formData: FormData) {
    setPwPending(true);
    setPwError(null);
    setPwSuccess(false);
    const res = await changePassword(formData);
    setPwPending(false);
    if (res?.error) setPwError(res.error);
    if (res?.ok) setPwSuccess(true);
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <>
    <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
      <Avatar name={profile.display_name ?? profile.handle ?? "You"} color="var(--accent)" size={72} url={profile.avatar_url} />
      <div>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent)" }}>Profile picture</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "inline-block", cursor: avatarUploading ? "default" : "pointer", padding: "8px 14px", border: "2px solid var(--bone)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {avatarUploading ? "Uploading…" : (profile.avatar_url ? "Replace" : "Upload")}
            <input type="file" accept="image/*" onChange={pickFile} disabled={avatarUploading} style={{ display: "none" }} />
          </label>
          {profile.avatar_url && (
            <button onClick={removeAvatar} disabled={removingAvatar || avatarUploading} style={{ padding: "8px 14px", background: "transparent", color: "var(--blood)", border: "2px solid var(--blood)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: removingAvatar ? "default" : "pointer" }}>
              {removingAvatar ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
        {avatarError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 12, marginTop: 6 }}>{avatarError}</div>}
      </div>
    </div>
    {pendingFile && (
      <AvatarEditor
        file={pendingFile}
        onCancel={() => setPendingFile(null)}
        onSave={uploadCropped}
      />
    )}
    <form action={save} style={{ display: "grid", gap: 16, maxWidth: 540 }}>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Handle</div>
        <input name="handle" defaultValue={profile.handle} required style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Display Name</div>
        <input name="display_name" defaultValue={profile.display_name} required style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Bio</div>
        <textarea name="bio" defaultValue={profile.bio} rows={4} style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)", fontFamily: "var(--font-serif)", fontStyle: "italic" }} />
      </label>
      <label className="check-zine">
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications_enabled} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Email me when a watchlist film drops in price</span>
      </label>
      <button type="submit" disabled={saving} className="btn">
        {saving ? "Saving…" : "Save"}
      </button>
      {saved && <div style={{ color: "var(--accent)", fontStyle: "italic" }}>Saved.</div>}
      <div style={{ borderTop: "1px solid #333", marginTop: 24, paddingTop: 24 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>Other Tabs</div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
          Oath, Storefronts, Notifications, Coven & Privacy, Desanctify — coming in a later sub-project.
        </div>
      </div>
    </form>
    <div style={{ marginTop: 40, borderTop: "1px solid #333", paddingTop: 24 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 12, color: "var(--accent)" }}>Change Password</div>
      {!hasPasswordIdentity && (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
          You signed up with Google. Set a password to also sign in with email.
        </p>
      )}
      <form action={handleChangePassword} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        {hasPasswordIdentity && (
          <label>
            <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Current password</div>
            <input name="current_password" type="password" required minLength={6} autoComplete="current-password"
              style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
          </label>
        )}
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>New password</div>
          <input name="new_password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Confirm new password</div>
          <input name="confirm" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "1px solid #333", color: "var(--bone)" }} />
        </label>
        {pwError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{pwError}</div>}
        {pwSuccess && <div style={{ color: "var(--accent)", fontStyle: "italic", fontSize: 13 }}>Password updated.</div>}
        <button type="submit" disabled={pwPending} className="btn" style={{ justifySelf: "start" }}>
          {pwPending ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
    <form action={signOut} style={{ marginTop: 32 }}>
      <button
        type="submit"
        style={{
          background: "transparent",
          color: "var(--blood)",
          border: "2px solid var(--blood)",
          padding: "10px 18px",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </form>
    </>
  );
}
