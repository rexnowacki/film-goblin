import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ArchiveButton from "./ArchiveButton";

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  // Admin gate handled by app/app/admin/layout.tsx — no need to repeat here.

  // Announcements + recipient counts + dismissal counts. PostgREST has no
  // GROUP BY, so we fetch everything and aggregate in JS. Fine at any scale
  // we'll see soon.
  const [annRes, recRes, disRes] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, audience, status, created_at, archived_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("announcement_recipients").select("announcement_id"),
    supabase.from("announcement_dismissals").select("announcement_id"),
  ]);

  if (annRes.error) throw annRes.error;
  if (recRes.error) throw recRes.error;
  if (disRes.error) throw disRes.error;

  const announcements = annRes.data ?? [];
  const recipientCounts = new Map<string, number>();
  for (const r of recRes.data ?? []) {
    recipientCounts.set(r.announcement_id, (recipientCounts.get(r.announcement_id) ?? 0) + 1);
  }
  const dismissalCounts = new Map<string, number>();
  for (const d of disRes.data ?? []) {
    dismissalCounts.set(d.announcement_id, (dismissalCounts.get(d.announcement_id) ?? 0) + 1);
  }

  // Sort: published first (active), then archived; each by created_at DESC.
  const sorted = [...announcements].sort((a, b) => {
    if (a.status !== b.status) return a.status === "published" ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div style={{ paddingBottom: 64 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 className="h-display" style={{ fontSize: 36, margin: 0 }}>
          Announcements
        </h1>
        <Link href="/admin/announcements/new" className="btn">
          + New announcement
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
          No announcements yet.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--muted)", textAlign: "left" }}>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Title</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Audience</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dismissed</th>
              <th style={{ padding: "10px 8px", fontFamily: "var(--font-ui)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Created</th>
              <th style={{ padding: "10px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(a => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--muted)" }}>
                <td style={{ padding: "10px 8px", fontWeight: 700 }}>{a.title}</td>
                <td style={{ padding: "10px 8px" }}>
                  {a.audience === "everyone"
                    ? "Everyone"
                    : `${recipientCounts.get(a.id) ?? 0} people`}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: a.status === "published" ? "var(--accent)" : "var(--muted)",
                      color: a.status === "published" ? "var(--accent-ink)" : "var(--bone)",
                    }}
                  >
                    {a.status}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>{dismissalCounts.get(a.id) ?? 0}</td>
                <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {a.status === "published" && (
                    <ArchiveButton announcementId={a.id} title={a.title} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
