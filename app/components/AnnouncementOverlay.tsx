"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissAnnouncement } from "@/lib/actions/announcements";

export interface AnnouncementOverlayProps {
  announcement: {
    id: string;
    title: string;
    body: string;
    cta_label: string | null;
    cta_href: string | null;
  };
}

export default function AnnouncementOverlay({ announcement }: AnnouncementOverlayProps) {
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDismiss(navigateTo: string | null) {
    setHidden(true); // optimistic: hide immediately
    startTransition(async () => {
      const res = await dismissAnnouncement(announcement.id);
      if (!res.ok) {
        // Rare: server failed to record. Re-show so the user can retry.
        // (Network errors during transitions surface as ok=false.)
        setHidden(false);
        return;
      }
      if (navigateTo) router.push(navigateTo);
    });
  }

  if (hidden) return null;

  // Body: paragraph breaks on \n\n, line breaks on single \n.
  const paragraphs = announcement.body.split(/\n\n+/);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--accent)",
        color: "var(--bone)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 32px) 24px calc(env(safe-area-inset-bottom) + 32px)",
        animation: "announcement-in 200ms ease-out",
        overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes announcement-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
        <h1
          id="announcement-title"
          style={{
            fontFamily: "var(--font-head, 'DM Serif Display', serif)",
            fontSize: "clamp(36px, 6vw, 48px)",
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 24,
          }}
        >
          {announcement.title}
        </h1>

        <div
          style={{
            fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
            fontSize: "clamp(16px, 2.4vw, 18px)",
            lineHeight: 1.5,
            maxWidth: 520,
            margin: "0 auto 32px",
          }}
        >
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "1em 0 0" }}>
              {p.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          {announcement.cta_label && announcement.cta_href && (
            <button
              type="button"
              onClick={() => handleDismiss(announcement.cta_href)}
              style={{
                background: "var(--bone)",
                color: "var(--accent)",
                border: "none",
                padding: "14px 32px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                minWidth: 180,
              }}
            >
              {announcement.cta_label}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDismiss(null)}
            style={{
              background: "transparent",
              color: "var(--bone)",
              border: "2px solid var(--bone)",
              padding: "12px 30px",
              fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
