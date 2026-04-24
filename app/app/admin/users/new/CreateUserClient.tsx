"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateTestUser, generatePassword } from "@/lib/actions/admin/users";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: 10, background: "var(--void-2)", border: "2px solid var(--muted)",
  color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14,
};

export default function CreateUserClient({ initialPassword }: { initialPassword: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(initialPassword);
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function regenerate() {
    setPassword(await generatePassword());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const res = await adminCreateTestUser({ email, password, display_name: displayName });
    setSaving(false);
    if (!res.ok) { setErr(res.error); return; }
    router.push(`/admin/users/${res.userId}`);
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 520, display: "grid", gap: 14 }}>
      <div style={{ padding: 12, background: "var(--void-2)", border: "1px solid var(--accent)", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
        Creates a user with <code>email_confirm: true</code>. No verification email is sent. Not the public signup flow.
      </div>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Email</div>
        <input style={INPUT_STYLE} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Password</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...INPUT_STYLE, flex: 1 }} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          <button type="button" className="btn btn-sm btn-outline" onClick={regenerate}>Regenerate</button>
        </div>
      </label>
      <label>
        <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>Display name (optional)</div>
        <input style={INPUT_STYLE} value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </label>
      {err && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13 }}>{err}</div>}
      <button type="submit" className="btn" disabled={saving}>{saving ? "Creating…" : "Create test user"}</button>
    </form>
  );
}
