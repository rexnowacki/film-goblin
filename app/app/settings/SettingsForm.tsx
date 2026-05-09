"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, updateEmail, changePassword } from "@/lib/actions/profile";
import { signOut } from "@/lib/actions/auth";
import Avatar from "@/components/Avatar";
import AvatarEditor from "@/components/AvatarEditor";
import { useToast } from "@/components/ToastProvider";

const USERNAME_RE = /^[a-z0-9._]+$/;

export default function SettingsForm() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPasswordIdentity, setHasPasswordIdentity] = useState(true);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwPending, setPwPending] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [username, setUsername] = useState("");
  const router = useRouter();

  const trimmedUsername = username.trim().toLowerCase();
  const usernameInvalid = trimmedUsername.length > 0 && (!USERNAME_RE.test(trimmedUsername) || trimmedUsername.length > 24);

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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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
      toast("Avatar updated");
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      setHasPasswordIdentity((user.identities ?? []).some((i: any) => i.provider === "email"));
      setAuthEmail(user.email ?? null);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
      setUsername(data?.username ?? "");
      setLoading(false);
    })();
  }, []);

  async function save(fd: FormData) {
    setSaving(true);
    try {
      await updateProfile({
        username: String(fd.get("username")),
        display_name: String(fd.get("display_name")),
        bio: String(fd.get("bio") || ""),
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
      toast("Saved");
    } finally { setSaving(false); }
  }

  async function handleUpdateEmail(formData: FormData) {
    setEmailPending(true);
    setEmailError(null);
    setEmailInfo(null);
    const res = await updateEmail(formData);
    setEmailPending(false);
    if (res?.error) setEmailError(res.error);
    if (res?.info) {
      setEmailInfo(res.info);
      toast("Confirmation sent");
    }
  }

  async function handleChangePassword(formData: FormData) {
    setPwPending(true);
    setPwError(null);
    setPwSuccess(false);
    const res = await changePassword(formData);
    setPwPending(false);
    if (res?.error) setPwError(res.error);
    if (res?.ok) {
      setPwSuccess(true);
      toast("Password changed");
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <>
    <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
      <Avatar name={profile.display_name ?? profile.username ?? "You"} color="var(--accent)" size={72} url={profile.avatar_url} />
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
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Username</div>
        <input
          name="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          maxLength={24}
          style={{ width: "100%", padding: 10, background: "var(--void-2)", border: `2px solid ${usernameInvalid ? "var(--blood)" : "var(--muted)"}`, color: "var(--bone)" }}
        />
        {usernameInvalid && (
          <div style={{ marginTop: 6, color: "var(--blood)", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12 }}>
            Lowercase letters, numbers, dots, underscores only (max 24).
          </div>
        )}
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Display Name</div>
        <input name="display_name" defaultValue={profile.display_name} required style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)" }} />
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Bio</div>
        <textarea name="bio" defaultValue={profile.bio} rows={4} style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-serif)", fontStyle: "italic" }} />
      </label>
      <label className="check-zine">
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="broadcast_library" defaultChecked={profile.broadcast_library} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Show your library to coven members</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="broadcast_watched" defaultChecked={profile.broadcast_watched} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watches to your coven</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="notify_rate_reminders" defaultChecked={profile.notify_rate_reminders ?? true} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Remind me to rate watches I haven&rsquo;t graded</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="notify_comment_likes" defaultChecked={profile.notify_comment_likes ?? true} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Notify me when someone likes my comment</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="notify_film_requests" defaultChecked={profile.notify_film_requests ?? true} />
        <span className="check-zine__box" aria-hidden="true" />
        <span className="caps" style={{ fontSize: 11 }}>Notify me when a summoned film arrives</span>
      </label>
      <label className="check-zine">
        <input type="checkbox" name="discoverable" defaultChecked={profile.discoverable ?? true} />
        <span className="check-zine__box" aria-hidden="true" />
        <span>
          <span className="caps" style={{ fontSize: 11 }}>Show me in &ldquo;who&rsquo;s watching&rdquo; on film pages</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Other members can see you&rsquo;re tracking a film when they visit its page.</span>
        </span>
      </label>
      <div style={{ borderTop: "1px solid #333", marginTop: 8, paddingTop: 16 }}>
        <div className="caps" style={{ fontSize: 11, marginBottom: 12, color: "var(--accent)" }}>Email me when…</div>
        <div style={{ display: "grid", gap: 10 }}>
          <label className="check-zine">
            <input type="checkbox" name="email_price_drops" defaultChecked={profile.email_price_drops ?? true} />
            <span className="check-zine__box" aria-hidden="true" />
            <span className="caps" style={{ fontSize: 11 }}>Price drops on my watchlist</span>
          </label>
          <label className="check-zine">
            <input type="checkbox" name="email_coven_recs" defaultChecked={profile.email_coven_recs ?? true} />
            <span className="check-zine__box" aria-hidden="true" />
            <span className="caps" style={{ fontSize: 11 }}>Coven recommends me a film</span>
          </label>
          <label className="check-zine">
            <input type="checkbox" name="email_comments" defaultChecked={profile.email_comments ?? true} />
            <span className="check-zine__box" aria-hidden="true" />
            <span className="caps" style={{ fontSize: 11 }}>Someone comments on my activity</span>
          </label>
          <label className="check-zine">
            <input type="checkbox" name="email_coven_invites" defaultChecked={profile.email_coven_invites ?? true} />
            <span className="check-zine__box" aria-hidden="true" />
            <span className="caps" style={{ fontSize: 11 }}>Someone invites me to their coven</span>
          </label>
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Only price drops actually email today. The rest are placeholders for the next time we wire up email for that kind.
        </div>
      </div>
      <button type="submit" disabled={saving || usernameInvalid} className="btn">
        {saving ? "Saving…" : "Save"}
      </button>
      <div style={{ borderTop: "1px solid #333", marginTop: 24, paddingTop: 24 }}>
        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>Other Tabs</div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
          Oath, Storefronts, Notifications, Coven & Privacy, Desanctify — coming in a later sub-project.
        </div>
      </div>
    </form>
    <div style={{ marginTop: 40, borderTop: "1px solid #333", paddingTop: 24 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 12, color: "var(--accent)" }}>Email</div>
      {profile?.email_added_at ? (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
          Current: <strong>{authEmail}</strong>. Update below to send a confirmation link to the new address.
        </p>
      ) : (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginBottom: 16, opacity: 0.8 }}>
          You signed up without an email. Add one below to receive price-drop alerts and recover access if you forget your password.
        </p>
      )}
      <form action={handleUpdateEmail} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>{profile?.email_added_at ? "New email" : "Email"}</div>
          <input name="email" type="email" required autoComplete="email"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)" }} />
        </label>
        {emailError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{emailError}</div>}
        {emailInfo && <div style={{ color: "var(--accent)", fontStyle: "italic", fontSize: 13 }}>{emailInfo}</div>}
        <button type="submit" disabled={emailPending} className="btn" style={{ justifySelf: "start" }}>
          {emailPending ? "Sending…" : (profile?.email_added_at ? "Update Email" : "Add Email")}
        </button>
      </form>
    </div>

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
              style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)" }} />
          </label>
        )}
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>New password</div>
          <input name="new_password" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)" }} />
        </label>
        <label>
          <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Confirm new password</div>
          <input name="confirm" type="password" required minLength={6} autoComplete="new-password"
            style={{ width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)" }} />
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
