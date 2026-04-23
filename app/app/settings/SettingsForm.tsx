"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/actions/profile";
import { signOut } from "@/lib/actions/auth";

export default function SettingsForm() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
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

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!profile) return <div style={{ padding: 40 }}>Not signed in.</div>;

  return (
    <>
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
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="broadcast" defaultChecked={profile.broadcast_watchlist_adds} />
        <span className="caps" style={{ fontSize: 11 }}>Broadcast watchlist adds to followers</span>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" name="email_notifications" defaultChecked={profile.email_notifications_enabled} />
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
