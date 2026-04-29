"use client";

import Image from "next/image";
import { useTransition } from "react";
import { removeFromWatchlist } from "@/lib/actions/watchlists";
import { computeDropPct } from "@/lib/queries/sort-watchlist";
import type { WatchlistRowData } from "@/lib/queries/watchlists";

interface Props {
  row: WatchlistRowData;
}

function formatPrice(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export default function WatchlistRow({ row }: Props) {
  const [pendingRemove, startRemove] = useTransition();
  const dropped = computeDropPct(row) != null;

  function onRemove() {
    startRemove(async () => {
      try {
        await removeFromWatchlist(row.film_id);
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <div className={`watchlist-row${dropped ? " watchlist-row-dropped" : ""}`}>
      <a href={`/film/${row.film.id}`} className="watchlist-row-poster">
        {row.film.artwork_url ? (
          <Image src={row.film.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: 48, height: 72, background: "#222" }} />
        )}
      </a>
      <div className="watchlist-row-title">
        <a href={`/film/${row.film.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, lineHeight: 1.1 }}>{row.film.title}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{row.film.director} · {row.film.year}</div>
        </a>
      </div>
      <div className="watchlist-row-price">
        <span style={{ fontFamily: "var(--font-head)", fontSize: 22 }}>{formatPrice(row.film.latest_price)}</span>
        {dropped && row.max_price_usd != null && (
          <span className="watchlist-row-was-price">{formatPrice(row.max_price_usd)}</span>
        )}
      </div>
      <div className="watchlist-row-buy">
        {row.film.itunes_url ? (
          <a
            href={row.film.itunes_url}
            target="_blank"
            rel="noreferrer"
            className="caps watchlist-row-buy-link"
          >
            Buy on Apple TV →
          </a>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={pendingRemove}
        className="watchlist-remove"
        aria-label="Remove from watchlist"
      >
        ×
      </button>
    </div>
  );
}
