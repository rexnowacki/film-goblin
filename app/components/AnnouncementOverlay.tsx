"use client";

import { useState, useTransition, useEffect, useRef } from "react";
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Ref to the outer dialog div for focus management (Fix 2).
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable ref to handleDismiss so the Escape listener never goes stale (Fix 3).
  const dismissRef = useRef<(navigateTo: string | null) => void>(() => {});

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

  // Keep dismissRef current so the keydown handler always calls the latest version.
  dismissRef.current = handleDismiss;

  // Fix 2: Focus the dialog on mount so keyboard/SR users land inside it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { containerRef.current?.focus(); }, []);

  // Fix 3: Escape dismisses the overlay, matching BottomSheet behavior.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismissRef.current(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fix 6: Lock body scroll while the overlay is mounted (iOS-safe pattern from BottomSheet).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  // Body: paragraph breaks on \n\n, line breaks on single \n.
  const paragraphs = announcement.body.split(/\n\n+/);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400, // Fix 5: above toasts (200) and AvatarEditor (200)
        background: "var(--accent)",
        color: "var(--accent-ink)", // Fix 1: contrast-safe text-on-accent token
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
              disabled={isPending} // Fix 4: block double-taps during transition
              style={{
                background: "var(--bone)",
                color: "var(--void)", // Fix 1: void is universally readable on bone
                border: "none",
                padding: "14px 32px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                minWidth: 180,
                opacity: isPending ? 0.6 : 1, // Fix 4: visual disabled state
              }}
            >
              {announcement.cta_label}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDismiss(null)}
            disabled={isPending} // Fix 4: block double-taps during transition
            style={{
              background: "transparent",
              color: "var(--accent-ink)", // Fix 1: contrast-safe text-on-accent token
              border: "2px solid var(--accent-ink)", // Fix 1: border must be visible too
              padding: "12px 30px",
              fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              minWidth: 180,
              opacity: isPending ? 0.6 : 1, // Fix 4: visual disabled state
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
