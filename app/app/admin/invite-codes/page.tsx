import Link from "next/link";
import { getAllInviteCodes } from "@/lib/queries/invite-codes";
import { CreateInviteForm, RevokeButton } from "./InviteCodesClient";

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function AdminInviteCodesPage() {
  const codes = await getAllInviteCodes();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 28 }}>
        <Link href="/admin" style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
          ← Admin
        </Link>
        <h1 className="h-display" style={{ margin: 0 }}>Invite Codes</h1>
      </div>

      <CreateInviteForm />

      <div style={{ marginTop: 32, overflowX: "auto" }}>
        {codes.length === 0 ? (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>No codes yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-ui)", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #444", textAlign: "left" }}>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Code</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Owner</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Label</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Uses</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Created</th>
                <th className="caps" style={{ padding: "6px 12px 6px 0", fontSize: 10, color: "var(--muted)" }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.code} style={{ borderBottom: "1px solid #2a2a2a", opacity: c.revoked ? 0.45 : 1 }}>
                  <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-mono)" }}>{c.code}</td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)" }}>
                    {c.owner_username ? `@${c.owner_username}` : "admin"}
                  </td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)", fontStyle: "italic" }}>{c.label ?? "—"}</td>
                  <td style={{ padding: "8px 12px 8px 0" }}>
                    <span style={{ color: c.use_count >= c.max_uses ? "var(--blood)" : "inherit" }}>
                      {c.use_count}/{c.max_uses}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px 8px 0", color: "var(--muted)" }}>{fmtDate(c.created_at)}</td>
                  <td style={{ padding: "8px 12px 8px 0" }}>
                    {c.revoked ? (
                      <span style={{ color: "var(--blood)", fontSize: 10 }}>Revoked</span>
                    ) : c.use_count >= c.max_uses ? (
                      <span style={{ color: "var(--muted)", fontSize: 10 }}>Exhausted</span>
                    ) : (
                      <span style={{ color: "var(--accent)", fontSize: 10 }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 0" }}>
                    {!c.revoked && <RevokeButton code={c.code} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
