import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalHauntDetail } from "@/lib/queries/theater-showings";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";

function dateCopy(showing: NonNullable<Awaited<ReturnType<typeof getLocalHauntDetail>>>) {
  if (showing.starts_at) {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(showing.starts_at));
  }
  if (showing.starts_on) {
    const [year, month, day] = showing.starts_on.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(year, month - 1, day));
  }
  return showing.date_label ?? "Coming soon";
}

export default async function LocalHauntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const showing = await getLocalHauntDetail(supabase, id);
  if (!showing) notFound();

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="home" />
      <BottomNav current="home" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "24px 0 20px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Local Haunt</div>
          <h1 className="h-display" style={{ fontSize: "clamp(34px, 7vw, 82px)", lineHeight: 0.9, margin: 0 }}>
            {showing.title}
          </h1>
        </div>
      </section>

      <section className="container-wide stackable" style={{ padding: "42px var(--container-pad)", "--stack-template": "260px 1fr", "--stack-gap": "34px", alignItems: "start" } as React.CSSProperties}>
        {showing.film ? (
          <FilmPoster film={showing.film as never} size="lg" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
        ) : showing.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={showing.poster_url} alt="" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", border: "2px solid var(--bone)" }} />
        ) : null}
        <div>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>
            {showing.theater.name}
            {showing.theater.city ? ` · ${showing.theater.city}${showing.theater.region ? `, ${showing.theater.region}` : ""}` : ""}
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 24, lineHeight: 1.35, margin: "0 0 18px", maxWidth: 680 }}>
            A film from your Hoard has crawled onto a nearby screen.
          </p>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 16, marginBottom: 20 }}>
            <strong>{dateCopy(showing)}</strong>
            {showing.showtime_label ? <span> · {showing.showtime_label}</span> : null}
          </div>
          {!showing.starts_at && (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", margin: "0 0 20px" }}>
              Exact showtime has not been posted yet.
            </p>
          )}
          {showing.description && (
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 16, lineHeight: 1.55, maxWidth: 700 }}>
              {showing.description}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn btn-lg" href={showing.source_url} target="_blank" rel="noreferrer">View at Theater →</a>
            {showing.film && <a className="btn btn-lg btn-dark" href={`/film/${showing.film.id}`}>View Film</a>}
          </div>
        </div>
      </section>
    </div>
  );
}
