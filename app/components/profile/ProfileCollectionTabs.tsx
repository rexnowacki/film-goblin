"use client";

import { useState } from "react";
import Link from "next/link";
import FilmPoster from "@/components/FilmPoster";

export interface ProfileFilm {
  id: string;
  title: string;
  director: string;
  year: number;
  artwork_url: string | null;
}

export interface ProfileReview {
  id: string;
  title: string;
  pullquote: string;
  film: ProfileFilm;
}

export interface ProfileList {
  id: string;
  title: string;
  description: string | null;
}

interface Props {
  watchlist: ProfileFilm[];
  watched: ProfileFilm[];
  reviews: ProfileReview[];
  lists: ProfileList[];
  watchlistPrivate: boolean;
  watchedPrivate: boolean;
}

type Tab = "watchlist" | "watched" | "reviews" | "lists";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "watchlist", label: "Watchlist" },
  { id: "watched", label: "Watched" },
  { id: "reviews", label: "Reviews" },
  { id: "lists", label: "Lists" },
];

function FilmGrid({ films, empty }: { films: ProfileFilm[]; empty: string }) {
  if (films.length === 0) return <ProfileEmpty>{empty}</ProfileEmpty>;
  return (
    <div className="profile-film-grid">
      {films.map((film, index) => (
        <Link key={film.id} prefetch={false} href={`/film/${film.id}`} className="profile-film-card">
          <FilmPoster
            film={film}
            size="md"
            priority={index < 4}
            style={{ width: "100%", height: "auto", aspectRatio: "2/3" }}
          />
          <span className="profile-film-card__title">{film.title}</span>
          <span className="profile-film-card__year">{film.year}</span>
        </Link>
      ))}
    </div>
  );
}

function ProfileEmpty({ children }: { children: React.ReactNode }) {
  return <div className="profile-collection-empty">{children}</div>;
}

export default function ProfileCollectionTabs({
  watchlist,
  watched,
  reviews,
  lists,
  watchlistPrivate,
  watchedPrivate,
}: Props) {
  const [active, setActive] = useState<Tab>("watchlist");

  return (
    <section className="profile-collections" aria-label="Profile collections">
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`profile-panel-${tab.id}`}
            className="profile-tab"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`profile-panel-${active}`} role="tabpanel" className="profile-tab-panel">
        {active === "watchlist" && (
          watchlistPrivate
            ? <ProfileEmpty>This hoard stays sealed.</ProfileEmpty>
            : <FilmGrid films={watchlist} empty="Nothing has been marked for the hunt yet." />
        )}
        {active === "watched" && (
          watchedPrivate
            ? <ProfileEmpty>This viewing diary stays sealed.</ProfileEmpty>
            : <FilmGrid films={watched} empty="No watched films have surfaced yet." />
        )}
        {active === "reviews" && (
          reviews.length === 0 ? <ProfileEmpty>No reviews carved into the archive yet.</ProfileEmpty> : (
            <div className="profile-review-grid">
              {reviews.map(review => (
                <Link key={review.id} prefetch={false} href={`/film/${review.film.id}`} className="profile-review-card">
                  <FilmPoster film={review.film} size="sm" />
                  <span>
                    <strong>{review.title}</strong>
                    <em>{review.pullquote || review.film.title}</em>
                  </span>
                </Link>
              ))}
            </div>
          )
        )}
        {active === "lists" && (
          lists.length === 0 ? <ProfileEmpty>No public grimoires bound yet.</ProfileEmpty> : (
            <div className="profile-list-grid">
              {lists.map(list => (
                <Link key={list.id} prefetch={false} href={`/lists/${list.id}`} className="profile-list-card">
                  <span className="profile-list-card__mark" aria-hidden="true">✦</span>
                  <strong>{list.title}</strong>
                  <span>{list.description || "A public grimoire."}</span>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
