import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import TopNav from "@/components/TopNav";
import { tmdbProfileUrl } from "@/lib/queries/film-cast";
import { getPersonWithCredits, tmdbPersonUrl } from "@/lib/queries/people";
import { groupAndSortBySeries } from "@/lib/series-order";
import { createClient } from "@/lib/supabase/server";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const person = await getPersonWithCredits(supabase, id);
  if (!person) notFound();

  const sortableCredits = person.credits.map((credit) => ({
    ...credit,
    title: credit.film.title,
    director: credit.film.director,
    year: credit.film.year,
    series_id: credit.film.series_id,
    series_order: credit.film.series_order,
  }));
  const credits = groupAndSortBySeries(
    sortableCredits,
    (a, b) => (a.film.year ?? 0) - (b.film.year ?? 0),
  );
  const profileUrl = tmdbProfileUrl(person.profile_path, "w342");

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="films" />
      <BottomNav current="films" />

      <section
        className="grain-light"
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "28px 0 24px",
        }}
      >
        <div
          className="container-wide stackable"
          style={{
            "--stack-template": "180px 1fr",
            "--stack-gap": "28px",
            alignItems: "end",
          } as CSSProperties}
        >
          <div
            style={{
              width: 180,
              maxWidth: "48vw",
              aspectRatio: "3 / 4",
              background: "var(--void-2)",
              border: "2px solid var(--void)",
              boxShadow: "4px 4px 0 var(--void)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {profileUrl ? (
              <Image
                src={profileUrl}
                alt=""
                fill
                sizes="(max-width: 720px) 48vw, 180px"
                priority
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(var(--accent) 1.4px, transparent 1.8px)",
                  backgroundSize: "9px 9px",
                  opacity: 0.36,
                }}
              />
            )}
          </div>

          <div>
            <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent-deep)" }}>
              {person.known_for_department ?? "Cast"}
            </div>
            <h1 className="h-display" style={{ fontSize: "clamp(32px, 6vw, 76px)", margin: 0 }}>
              {person.name}.
            </h1>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--void)",
                opacity: 0.72,
                margin: "10px 0 0",
              }}
            >
              {credits.length} {credits.length === 1 ? "film" : "films"} in the catalog, in chronological order.
            </p>
            <Link
              href={tmdbPersonUrl(person.tmdb_id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              style={{ marginTop: 18, color: "var(--void)", borderColor: "var(--void)" }}
            >
              TMDB
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {credits.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.65 }}>
              No available films found for {person.name}.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
              {credits.map((credit) => (
                <Link
                  key={credit.film.id}
                  href={`/film/${credit.film.id}`}
                  style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}
                >
                  <FilmPoster film={credit.film as never} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                  <div style={{ marginTop: 10 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1 }}>{credit.film.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      {credit.film.year}
                      {credit.rating?.coven_rating_pct != null && credit.rating?.coven_rating_count != null && credit.rating.coven_rating_count >= 5 ? (
                        <span style={{ marginLeft: 6, color: "var(--accent)" }}>· {Math.round(credit.rating.coven_rating_pct)}%</span>
                      ) : null}
                    </div>
                    {credit.character ? (
                      <div
                        style={{
                          marginTop: 5,
                          color: "var(--muted)",
                          fontFamily: "var(--font-serif)",
                          fontStyle: "italic",
                          fontSize: 13,
                          lineHeight: 1.25,
                        }}
                      >
                        {credit.character}
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
