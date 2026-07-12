import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFilmsForAdmin } from "@/lib/queries/admin/films";
import TmdbTrailerBackfillButton from "./TmdbTrailerBackfillButton";
import TmdbCastBackfillButton from "./TmdbCastBackfillButton";
import TmdbStreamingBackfillButton from "./TmdbStreamingBackfillButton";

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
    <div className="admin-film-page">
      <header className="admin-page-head">
        <div>
          <div className="eyebrow">Catalog ledger · {total} entries</div>
          <h1>Film Vault</h1>
          <p>Every title the goblins have dragged into the light.</p>
        </div>
        <div className="admin-page-actions">
          <Link href="/admin/films/bulk" className="btn btn-outline">Bulk add</Link>
          <Link href="/admin/films/new" className="btn">+ Summon film</Link>
        </div>
      </header>

      <section className="admin-film-tools" aria-label="Film catalog tools">
      <form method="get" className="admin-film-search">
        <label htmlFor="admin-film-query">Search the vault</label>
        <input
          id="admin-film-query"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title…"
        />
        {untagged && <input type="hidden" name="untagged" value="1" />}
      </form>
      <div className="admin-film-tool-row">
        <Link
          href={
            untagged
              ? (q ? `/admin/films?q=${encodeURIComponent(q)}` : "/admin/films")
              : (q ? `/admin/films?q=${encodeURIComponent(q)}&untagged=1` : "/admin/films?untagged=1")
          }
          className={`tag-edit-pill ${untagged ? "is-selected" : ""}`}
        >
          Untagged only
        </Link>
        <TmdbTrailerBackfillButton />
        <TmdbCastBackfillButton />
        <TmdbStreamingBackfillButton />
      </div>
      </section>

      {rows.length === 0 ? (
        <div className="admin-empty-state">
          Nothing answers that name in the vault.
        </div>
      ) : (
        <div className="admin-film-ledger">
          {rows.map(f => (
            <article key={f.id} className="admin-film-row">
              {f.artwork_url ? (
                <img src={f.artwork_url} alt="" width={52} height={78} className="admin-film-row__poster" />
              ) : (
                <div className="admin-film-row__poster admin-film-row__poster--empty" />
              )}
              <div className="admin-film-row__body">
                <div className="admin-film-row__title">{f.title}</div>
                <div className="admin-film-row__meta">{f.director || "Unknown director"} · {f.year || "Year unknown"}</div>
                <div className="admin-film-row__states">
                  <span className={`admin-state ${f.tracking ? "is-live" : ""}`}>
                    {f.tracking ? "tracking" : "not tracking"}
                  </span>
                  <span className={`admin-state ${f.available ? "is-live" : "is-danger"}`}>
                    {f.available ? "available" : "retired"}
                  </span>
                </div>
              </div>
              <Link href={`/admin/films/${f.id}/edit`} className="admin-film-row__edit">Open record <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="admin-pagination" aria-label="Film pages">
          {page > 1 && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-sm btn-outline">← Prev</Link>
          )}
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          {page < totalPages && (
            <Link href={`/admin/films?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-sm btn-outline">Next →</Link>
          )}
        </nav>
      )}
    </div>
  );
}
