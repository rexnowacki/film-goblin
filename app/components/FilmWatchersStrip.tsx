"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
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

  if (covenWatchers.length === 0 && otherCount === 0) return null;

  const othersLabel =
    covenWatchers.length > 0
      ? `+ ${otherCount} other${otherCount === 1 ? "" : "s"} →`
      : `${otherCount} goblin${otherCount === 1 ? "" : "s"} tracking this →`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
        <span
          className="caps"
          style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}
        >
          Watching
        </span>
        {covenWatchers.length > 0 && (
          <div style={{ display: "flex" }}>
            {covenWatchers.map((w, i) => (
              <div key={w.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                <Avatar
                  name={w.username}
                  color="var(--accent)"
                  size={24}
                  url={w.avatar_url}
                />
              </div>
            ))}
          </div>
        )}
        {otherCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {othersLabel}
          </button>
        )}
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Also Watching"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
          {otherWatchers.map(w => (
            <div key={w.id} className="pill-row">
              <Avatar
                name={w.username}
                color="var(--accent)"
                size={32}
                url={w.avatar_url}
              />
              <Link
                prefetch={false}
                href={`/p/${encodeURIComponent(w.username)}`}
                style={{
                  flex: 1,
                  color: "var(--bone)",
                  textDecoration: "none",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                }}
              >
                {w.username}
              </Link>
            </div>
          ))}
          {otherCount > otherWatchers.length && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: 13,
                color: "var(--muted)",
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              and {otherCount - otherWatchers.length} more
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
