import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FilmForm from "../../FilmForm";
import RetireModal from "../../RetireModal";
import FilmTagEditor from "@/components/admin/FilmTagEditor";
import { getAllTagsGroupedByType, getFilmTags } from "@/lib/queries/film-tags";
import { listFilmSeries, type FilmFormFields } from "@/lib/actions/admin/films";

export default async function EditFilmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // series_id / series_order added in mig 0177; types.ts not regenerated yet
  // so cast through the response.
  const { data: filmRaw } = await supabase
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available, tmdb_id, theatrical_release_date, series_id, series_order" as never)
    .eq("id", id)
    .maybeSingle();
  if (!filmRaw) notFound();
  const film = filmRaw as unknown as {
    id: string; itunes_id: number | null; title: string; director: string;
    year: number; runtime_min: number; genre_primary: string; description: string;
    content_advisory: string; artwork_url: string; itunes_url: string;
    tracking: boolean; available: boolean; tmdb_id: number | null;
    theatrical_release_date: string | null;
    series_id: string | null; series_order: number | null;
  };

  const [watchlistCount, listsCount, reviewsCount, activityCount, vocab, currentTags, existingSeries] = await Promise.all([
    supabase.from("watchlists").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("list_films").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("reviews").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("activity").select("id", { count: "exact", head: true }).contains("payload", { film_id: id } as never).then(r => r.count ?? 0),
    getAllTagsGroupedByType(supabase),
    getFilmTags(supabase, film.id),
    listFilmSeries(),
  ]);

  const orderedAll = [...currentTags.visible, ...currentTags.hidden];
  const primaryRow = orderedAll.find(t => t.is_primary);
  const tagInitial = {
    primarySubgenreId: primaryRow?.id ?? null,
    secondarySubgenreIds: orderedAll.filter(t => t.type === "subgenre" && !t.is_primary).map(t => t.id),
    subjectIds: orderedAll.filter(t => t.type === "subject").map(t => t.id),
    toneIds:    orderedAll.filter(t => t.type === "tone").map(t => t.id),
    themeIds:   orderedAll.filter(t => t.type === "theme").map(t => t.id),
    settingIds: orderedAll.filter(t => t.type === "setting").map(t => t.id),
    contentIds: orderedAll.filter(t => t.type === "content").map(t => t.id),
    orderedTagIds: orderedAll.map(t => t.id),
  };

  const initial: FilmFormFields = {
    itunes_id: film.itunes_id,
    title: film.title,
    director: film.director,
    year: film.year,
    runtime_min: film.runtime_min,
    genre_primary: film.genre_primary,
    description: film.description,
    content_advisory: film.content_advisory,
    artwork_url: film.artwork_url,
    itunes_url: film.itunes_url,
    tracking: film.tracking,
    available: film.available,
    tmdb_id: film.tmdb_id ?? null,
    theatrical_release_date: film.theatrical_release_date ?? null,
    series_id: film.series_id,
    series_new_name: "",
    series_order: film.series_order,
  };

  return (
    <div className="admin-form-page">
      <header className="admin-page-head admin-page-head--edit">
        <div><div className="eyebrow">Catalog record · {film.year}</div><h1>{film.title}</h1><p>Edit the record, availability, identity, and occult taxonomy.</p></div>
        <div className="admin-page-actions">
          <Link href="/admin/films" className="btn btn-sm btn-outline">← Back</Link>
          <RetireModal filmId={film.id} title={film.title} year={film.year} counts={{ watchlist: watchlistCount, lists: listsCount, reviews: reviewsCount, activity: activityCount }} />
        </div>
      </header>
      <div className="admin-form-surface"><FilmForm mode="edit" filmId={film.id} initial={initial} existingSeries={existingSeries} /></div>
      <div className="admin-form-surface admin-form-surface--tags"><FilmTagEditor
        filmId={film.id}
        director={film.director}
        vocab={vocab}
        initial={tagInitial}
      /></div>
    </div>
  );
}
