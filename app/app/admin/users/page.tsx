import Link from "next/link";
import { listUsersForAdmin } from "@/lib/queries/admin/users";

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const { rows, total, pageSize } = await listUsersForAdmin(q, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Users</h1>
        <Link href="/admin/users/new" className="btn">+ Create test user</Link>
      </div>

      <form method="get" style={{ marginBottom: 20 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search username, email, display name, or UUID…"
          style={{ width: "100%", maxWidth: 480, padding: "10px 14px", background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
      </form>

      {rows.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No users match.</div>
      ) : (
        <div style={{ border: "1px solid #333" }}>
          {rows.map(u => (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #333" }}>
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16 }}>@{u.username} {u.staff_role && <span className="caps" style={{ fontSize: 9, padding: "1px 6px", marginLeft: 6, background: "var(--accent)", color: "var(--accent-ink)" }}>{u.staff_role}</span>}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{u.display_name ?? "—"} · {u.email ?? "—"} · joined {fmtDate(u.created_at)} · last seen {fmtDate(u.last_sign_in_at)}</div>
              </div>
              <Link href={`/admin/users/${u.id}`} className="btn btn-sm btn-outline">View</Link>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
          {page > 1 && <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-sm btn-outline">← Prev</Link>}
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, opacity: 0.7 }}>Page {page} of {totalPages} · {total} total</span>
          {page < totalPages && <Link href={`/admin/users?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-sm btn-outline">Next →</Link>}
        </div>
      )}
    </div>
  );
}
