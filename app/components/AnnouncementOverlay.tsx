"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { dismissAnnouncement } from "@/lib/actions/announcements";

type PanelColor = "pink" | "plum" | "seafoam" | "bone";
type TextColor = PanelColor | "void";

const COLOR_HEX: Record<TextColor, string> = {
  pink: "#ff2d88",
  plum: "#9d6fc4",
  seafoam: "#7a9d92",
  bone: "#f3ecd8",
  void: "#0a0a0a",
};

// CTA button text color: use void on light backgrounds, bone on the rest.
function ctaTextHex(bg: PanelColor): string {
  return bg === "bone" ? COLOR_HEX.void : COLOR_HEX.bone;
}

export interface AnnouncementOverlayProps {
  announcement: {
    id: string;
    title: string;
    body: string;
    cta_label: string | null;
    cta_href: string | null;
    panel_color: PanelColor;
    title_color: TextColor;
    body_color: TextColor;
    cta_color: PanelColor;
  };
}

export default function AnnouncementOverlay({ announcement }: AnnouncementOverlayProps) {
  const [hidden, setHidden] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<(navigateTo: string | null) => void>(() => {});

  function handleDismiss(navigateTo: string | null) {
    setHidden(true);
    startTransition(async () => {
      const res = await dismissAnnouncement(announcement.id);
      if (!res.ok) {
        setHidden(false);
        return;
      }
      if (navigateTo) router.push(navigateTo);
    });
  }

  dismissRef.current = handleDismiss;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { panelRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismissRef.current(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const paragraphs = announcement.body.split(/\n\n+/);
  const panelHex = COLOR_HEX[announcement.panel_color];
  const titleHex = COLOR_HEX[announcement.title_color];
  const bodyHex = COLOR_HEX[announcement.body_color];
  const ctaBgHex = COLOR_HEX[announcement.cta_color];
  const ctaTextHexValue = ctaTextHex(announcement.cta_color);
  // Close-X and Got-it secondary use a contrast-safe token against the panel:
  // void on light panels (bone), bone on dark/colored panels.
  const onPanelMutedHex = announcement.panel_color === "bone" ? "rgba(10,10,10,0.55)" : "rgba(243,236,216,0.7)";
  const onPanelBorderHex = announcement.panel_color === "bone" ? "rgba(10,10,10,0.35)" : "rgba(243,236,216,0.4)";
  const onPanelTextHex = announcement.panel_color === "bone" ? COLOR_HEX.void : COLOR_HEX.bone;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(10, 10, 10, 0.6)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 24px)",
        animation: "announcement-fade-in 150ms ease-out",
      }}
    >
      <style>{`
        @keyframes announcement-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes announcement-pop-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          background: panelHex,
          color: onPanelTextHex,
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100dvh - 96px)",
          overflowY: "auto",
          borderRadius: 14,
          padding: "28px 28px 24px",
          position: "relative",
          textAlign: "center",
          animation: "announcement-pop-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          outline: "none",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <button
          type="button"
          onClick={() => handleDismiss(null)}
          disabled={isPending}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            background: "none",
            border: 0,
            color: onPanelMutedHex,
            fontSize: 26,
            lineHeight: 1,
            padding: "4px 8px",
            cursor: "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          ×
        </button>

        <h1
          id="announcement-title"
          style={{
            fontFamily: "var(--font-head, 'DM Serif Display', serif)",
            fontSize: "clamp(28px, 5vw, 36px)",
            lineHeight: 1.15,
            margin: 0,
            marginBottom: 16,
            color: titleHex,
          }}
        >
          {announcement.title}
        </h1>

        <div
          style={{
            fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
            fontSize: "clamp(15px, 2vw, 16px)",
            lineHeight: 1.55,
            margin: "0 auto 24px",
            color: bodyHex,
          }}
        >
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "0.85em 0 0" }}>
              {p.split("\n").map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
          {announcement.cta_label && announcement.cta_href && (
            <button
              type="button"
              onClick={() => handleDismiss(announcement.cta_href)}
              disabled={isPending}
              style={{
                background: ctaBgHex,
                color: ctaTextHexValue,
                border: "none",
                padding: "12px 24px",
                fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {announcement.cta_label}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDismiss(null)}
            disabled={isPending}
            style={{
              background: "transparent",
              color: onPanelTextHex,
              border: `2px solid ${onPanelBorderHex}`,
              padding: "10px 24px",
              fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
