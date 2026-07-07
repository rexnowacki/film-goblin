import Link from "next/link";
import Image from "next/image";
import Avatar from "./Avatar";
import { relativeTime } from "./activity/relativeTime";
import { renderCopyText, PitSigil } from "./activity/systemEventParts";
import type { LandingFeedRow, LandingFilm } from "@/lib/queries/landing";

// Pre-login landing page feed card. Static server-rendered snapshot of real
// site activity (cached 5 min upstream) — timestamps are as-of cache time.

function Title({ film }: { film: LandingFilm }) {
  return <em className="head">{film.title}</em>;
}

function Sentence({ row }: { row: LandingFeedRow }) {
  switch (row.kind) {
    case "watch_logged":
      return <><b>{row.actor.username}</b> watched <Title film={row.film} /> 👁</>;
    case "review_published":
      return <><b>{row.actor.username}</b> published a review of <Title film={row.film} /></>;
    case "recommendation_sent":
      return <><b>{row.actor.username}</b> pressed <Title film={row.film} /> on <b>{row.recipient.username}</b></>;
    case "watchlist_added":
      return <><b>{row.actor.username}</b> is stalking <Title film={row.film} /></>;
    case "library_added":
      return <><b>{row.actor.username}</b> now owns <Title film={row.film} /></>;
    case "system":
      return <>{renderCopyText(row.copy)}</>;
  }
}

function Thumb({ film }: { film: LandingFilm | null }) {
  if (!film) return <span style={{ width: 30, flexShrink: 0 }} />;
  return (
    <Link href={`/film/${film.id}`} prefetch={false} style={{ marginLeft: "auto", flexShrink: 0 }}>
      {film.artwork_url ? (
        <Image
          src={film.artwork_url}
          alt={film.title}
          width={30}
          height={44}
          style={{ width: 30, height: 44, objectFit: "cover", border: "1.5px solid var(--bone)", display: "block" }}
        />
      ) : (
        <span style={{ display: "block", width: 30, height: 44, background: "var(--void-3)", border: "1.5px solid var(--bone)" }} />
      )}
    </Link>
  );
}

export default function LandingFeedCard({ rows }: { rows: LandingFeedRow[] }) {
  return (
    <div className="landing-feed-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span className="caps" style={{ fontSize: 11, color: "var(--highlight)" }}><span aria-hidden="true">⛧</span> The Feed</span>
        <span className="caps" style={{ fontSize: 9, color: "var(--muted)" }}>live · unhallowed hours</span>
      </div>
      {rows.map(row => (
        <div key={row.id} className="landing-feed-row">
          {row.kind === "system" ? (
            <PitSigil size={32} />
          ) : (
            <Avatar name={row.actor.display_name || row.actor.username} url={row.actor.avatar_url} size={26} />
          )}
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.35 }}>
            <Sentence row={row} />
            <div className="caps" style={{ fontSize: 8, color: "var(--muted)", marginTop: 3 }}>
              {row.kind === "system" ? (
                <>
                  <span style={{ color: "var(--accent)" }}>From the Pit</span>
                  {" · "}
                </>
              ) : null}
              {relativeTime(row.created_at)}
            </div>
          </div>
          <Thumb film={row.film} />
        </div>
      ))}
    </div>
  );
}
