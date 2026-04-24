import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FilmForm from "../../FilmForm";
import RetireModal from "../../RetireModal";
import type { FilmFormFields } from "@/lib/actions/admin/films";

export default async function EditFilmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: film } = await supabase
    .from("films")
    .select("id, itunes_id, title, director, year, runtime_min, genre_primary, description, content_advisory, artwork_url, itunes_url, tracking, available")
    .eq("id", id)
    .maybeSingle();
  if (!film) notFound();

  const [watchlistCount, listsCount, reviewsCount, activityCount] = await Promise.all([
    supabase.from("watchlists").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("list_films").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("reviews").select("film_id", { count: "exact", head: true }).eq("film_id", id).then(r => r.count ?? 0),
    supabase.from("activity").select("id", { count: "exact", head: true }).contains("payload", { film_id: id } as never).then(r => r.count ?? 0),
  ]);

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
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>Edit: {film.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/films" className="btn btn-sm btn-outline">← Back</Link>
          <RetireModal filmId={film.id} title={film.title} year={film.year} counts={{ watchlist: watchlistCount, lists: listsCount, reviews: reviewsCount, activity: activityCount }} />
        </div>
      </div>
      <FilmForm mode="edit" filmId={film.id} initial={initial} />
    </div>
  );
}
