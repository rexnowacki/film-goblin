import { listTheaterShowingsForAdmin } from "@/lib/queries/admin/theater-showings";
import { chooseTheaterFilm, confirmTheaterMatch, ignoreTheaterMatch, rejectTheaterMatch } from "@/lib/actions/admin/theater-showings";

export default async function AdminTheaterShowingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; theater?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listTheaterShowingsForAdmin({
    status: sp.status,
    theaterSlug: sp.theater,
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", marginBottom: 24 }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>Admin</div>
          <h1 className="head" style={{ fontSize: 44, margin: 0 }}>Local Haunts</h1>
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>
          {rows.length} scraped showings
        </div>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #333" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-ui)", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "var(--void-2)" }}>
              <th style={{ padding: 10 }}>Title</th>
              <th style={{ padding: 10 }}>Theater</th>
              <th style={{ padding: 10 }}>Date</th>
              <th style={{ padding: 10 }}>Categories</th>
              <th style={{ padding: 10 }}>Match</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const match = row.matches[0] ?? null;
              return (
                <tr key={row.id} style={{ borderTop: "1px solid #333", opacity: row.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: 10 }}>
                    <a href={row.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--bone)" }}>{row.title}</a>
                  </td>
                  <td style={{ padding: 10 }}>{row.theater.name}</td>
                  <td style={{ padding: 10 }}>{row.date_label ?? row.starts_on ?? "Unknown"}{row.showtime_label ? ` · ${row.showtime_label}` : ""}</td>
                  <td style={{ padding: 10 }}>{row.category_labels.join(", ") || "—"}</td>
                  <td style={{ padding: 10 }}>
                    {match?.film ? `${match.film.title} (${match.film.year})` : "No candidate"}
                    {match ? <div style={{ color: "var(--muted)", fontSize: 11 }}>{match.match_type} · {Number(match.confidence).toFixed(2)}</div> : null}
                  </td>
                  <td style={{ padding: 10 }}>{match?.status ?? "unmatched"}</td>
                  <td style={{ padding: 10 }}>
                    {match ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <form action={async () => { "use server"; await confirmTheaterMatch(match.id); }}>
                          <button className="btn" style={{ padding: "6px 8px", fontSize: 11 }}>Confirm</button>
                        </form>
                        <form action={async () => { "use server"; await rejectTheaterMatch(match.id); }}>
                          <button className="btn" style={{ padding: "6px 8px", fontSize: 11 }}>Reject</button>
                        </form>
                        <form action={async () => { "use server"; await ignoreTheaterMatch(match.id); }}>
                          <button className="btn" style={{ padding: "6px 8px", fontSize: 11 }}>Ignore</button>
                        </form>
                      </div>
                    ) : "—"}
                    <form
                      action={async (formData) => {
                        "use server";
                        const filmId = String(formData.get("film_id") || "").trim();
                        if (filmId) await chooseTheaterFilm(row.id, filmId);
                      }}
                      style={{ display: "flex", gap: 6, marginTop: 8 }}
                    >
                      <input
                        name="film_id"
                        placeholder="Film UUID"
                        style={{ minWidth: 180, background: "var(--void)", color: "var(--bone)", border: "1px solid #444", padding: "6px 8px", fontSize: 11 }}
                      />
                      <button className="btn" style={{ padding: "6px 8px", fontSize: 11 }}>Choose</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
