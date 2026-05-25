"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import BottomSheet from "@/components/BottomSheet";
import type { WatcherProfile } from "@/lib/queries/film-watchers";

interface Props {
  covenWatchers: WatcherProfile[];
  otherWatchers: WatcherProfile[];
  otherCount: number;
}

export default function FilmWatchersStrip({
  covenWatchers,
  otherWatchers,
  otherCount,
}: Props) {
  const [open, setOpen] = useState(false);

  const totalCount = covenWatchers.length + otherCount;
  if (totalCount === 0) return null;

  const chips = covenWatchers.slice(0, 4);
  const overflow = totalCount - chips.length;
  const label = overflow > 0
    ? `+${overflow} more`
    : chips.length > 0 ? "→" : null;

  // Sheet shows coven first, then others
  const sheetRows = [...covenWatchers, ...otherWatchers];
  const hiddenCount = otherCount - otherWatchers.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="caps" style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
          Watching
        </span>
        {chips.length > 0 && (
          <div style={{ display: "flex" }}>
            {chips.map((w, i) => (
              <div key={w.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                <Avatar name={w.username} color="var(--accent)" size={24} url={w.avatar_url} />
              </div>
            ))}
          </div>
        )}
        {label && (
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-ui)", fontSize: 12 }}>
            {label}
          </span>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Also Watching">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sheetRows.map(w => (
            <Link
              key={w.id}
              prefetch={false}
              href={`/p/${encodeURIComponent(w.username)}`}
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid #222",
                textDecoration: "none",
                color: "var(--bone)",
              }}
            >
              <Avatar name={w.username} color="var(--accent)" size={36} url={w.avatar_url} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 14 }}>{w.username}</span>
            </Link>
          ))}
          {hiddenCount > 0 && (
            <p style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 13,
              color: "var(--muted)",
              textAlign: "center",
              margin: "12px 0 0",
            }}>
              and {hiddenCount} more
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
