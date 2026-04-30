"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetUserRole, type UserRole } from "@/lib/actions/admin/users";

interface Props {
  userId: string;
  currentRole: UserRole;
}

const ROLES: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: "goblin", label: "Goblin", hint: "Default. No badge." },
  { value: "witch", label: "Witch", hint: "Staff. Pentagram badge. Auto-grants admin in staff." },
  { value: "high_goblin", label: "High Goblin", hint: "Premium. Goblin-head badge. (Dormant — no billing yet.)" },
];

export default function RoleControl({ userId, currentRole }: Props) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<UserRole>(currentRole);
  const router = useRouter();

  async function set(role: UserRole) {
    if (role === active || pending) return;
    setPending(true);
    setErr(null);
    const res = await adminSetUserRole(userId, role);
    setPending(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setActive(role);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ROLES.map(r => (
          <button
            key={r.value}
            type="button"
            onClick={() => set(r.value)}
            disabled={pending || r.value === active}
            style={{
              padding: "8px 14px",
              background: r.value === active ? "var(--accent)" : "transparent",
              color: r.value === active ? "var(--accent-ink)" : "var(--bone)",
              border: `2px solid ${r.value === active ? "var(--accent)" : "var(--muted)"}`,
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: r.value === active || pending ? "default" : "pointer",
              opacity: pending && r.value !== active ? 0.5 : 1,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
        {ROLES.find(r => r.value === active)?.hint}
      </div>
      {err && <div style={{ color: "var(--blood)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}
