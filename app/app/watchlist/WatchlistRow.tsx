"use client";

import { useRef, useState, useTransition } from "react";
import { setWatchlistThreshold, removeFromWatchlist } from "@/lib/actions/watchlists";
import { computeDropPct } from "@/lib/queries/sort-watchlist";
import type { WatchlistRowData } from "@/lib/queries/watchlists";

interface Props {
  row: WatchlistRowData;
}

function formatPrice(n: number | null): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export default function WatchlistRow({ row }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    row.max_price_usd != null ? row.max_price_usd.toFixed(2) : ""
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingEdit, startEdit] = useTransition();
  const [pendingRemove, startRemove] = useTransition();
  const submittingRef = useRef(false);
  const cancelledRef = useRef(false);

  const dropped = computeDropPct(row) != null;

  function submitThreshold() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setEditError(null);
    startEdit(async () => {
      try {
        const trimmed = draft.trim();
        const value = trimmed === "" ? null : Number(trimmed);
        if (value != null && (!Number.isFinite(value) || value <= 0 || value > 1000)) {
          setEditError("Must be between $0.01 and $1000.");
          return;
        }
        await setWatchlistThreshold(row.film_id, value);
        setEditing(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Couldn't save — try again.";
        setEditError(msg === "invalid threshold" ? "Must be between $0.01 and $1000." : "Couldn't save — try again.");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function cancelEdit() {
    cancelledRef.current = true;
    setEditing(false);
    setDraft(row.max_price_usd != null ? row.max_price_usd.toFixed(2) : "");
    setEditError(null);
  }

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
          <img src={row.film.artwork_url} alt="" width={48} height={72} style={{ objectFit: "cover", display: "block" }} />
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
        <div style={{ fontFamily: "var(--font-head)", fontSize: 22 }}>{formatPrice(row.film.latest_price)}</div>
        {dropped && <span className="caps" style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>▼ DROP</span>}
      </div>
      <div className="watchlist-row-threshold">
        {editing ? (
          <div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1000"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitThreshold();
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={submitThreshold}
              disabled={pendingEdit}
              autoFocus
              className="watchlist-threshold-editor"
              placeholder="0.00"
            />
            {editError && <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 11, marginTop: 4 }}>{editError}</div>}
          </div>
        ) : row.max_price_usd != null ? (
          <button type="button" onClick={() => setEditing(true)} className="watchlist-threshold-display">
            ≤ ${row.max_price_usd.toFixed(2)} <span style={{ opacity: 0.5, marginLeft: 4 }}>✎</span>
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="watchlist-threshold-set">
            + Set alert
          </button>
        )}
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
