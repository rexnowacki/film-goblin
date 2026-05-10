import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFilmsForAdmin } from "@/lib/queries/admin/films";

export default async function AdminFilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; untagged?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const untagged = sp.untagged === "1";
  const supabase = await createClient();
  const { rows, total, pageSize } = await listFilmsForAdmin(supabase, q, page, untagged);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Films</h1>
        <Link href="/admin/films/new" className="btn">+ Add film</Link>
      </div>

      <form method="get" style={{ marginBottom: 12 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title…"
          style={{ width: "100%", maxWidth: 480, padding: "10px 14px", background: "var(--void-2)", border: "2px solid var(--muted)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 14 }}
        />
        {untagged && <input type="hidden" name="untagged" value="1" />}
      </form>
      <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link
          href={
            untagged
              ? (q ? `/admin/films?q=${encodeURIComponent(q)}` : "/admin/films")
              : (q ? `/admin/films?q=${encodeURIComponent(q)}&untagged=1` : "/admin/films?untagged=1")
          }
          className={`tag-edit-pill ${untagged ? "is-selected" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Untagged only
        </Link>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
          No films match.
        </div>
      ) : (
        <div style={{ border: "1px solid #333" }}>
          {rows.map(f => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #333" }}>
              {f.artwork_url ? (
                <img src={f.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover" }} />
              ) : (
                <div style={{ width: 48, height: 72, background: "var(--void-2)", border: "1px solid #333" }} />
              )}
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 18, lineHeight: 1.1 }}>{f.title}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{f.director || "—"} · {f.year || "—"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <span className="caps" style={{ fontSize: 9, padding: "2px 6px", border: "1px solid", borderColor: f.tracking ? "var(--accent)" : "var(--muted)", color: f.tracking ? "var(--accent)" : "var(--muted)" }}>
                    {f.tracking ? "tracking" : "not tracking"}
                  </span>
                  <span className="caps" style={{ fontSize: 9, padding: "2px 6px", border: "1px solid", borderColor: f.available ? "var(--accent)" : "var(--danger)", color: f.available ? "var(--accent)" : "var(--danger)" }}>
                    {f.available ? "available" : "retired"}
                  </span>
                </div>
              </div>
              <Link href={`/admin/films/${f.id}/edit`} className="btn btn-sm btn-outline">Edit</Link>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
          {page > 1 && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-sm btn-outline">← Prev</Link>
          )}
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, opacity: 0.7 }}>
            Page {page} of {totalPages} · {total} total
          </span>
          {page < totalPages && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-sm btn-outline">Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
