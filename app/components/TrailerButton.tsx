"use client";

import { useEffect, useState } from "react";

interface Props {
  youtubeId: string;
  filmTitle: string;
  label?: string | null;
}

export default function TrailerButton({ youtubeId, filmTitle, label }: Props) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the lightbox is open. Unmount of the iframe (the
  // {open && ...} below) is what stops audio on close — replacing src with ""
  // is unreliable across browsers.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-lg"
        style={{ background: "var(--bone)", color: "var(--void)", border: "2px solid var(--void)" }}
        aria-label={`Play ${label ?? "trailer"} for ${filmTitle}`}
      >
        ▶ {label ?? "Trailer"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${filmTitle} trailer`}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(12px, 4vw, 40px)",
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            aria-label="Close trailer"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              border: 0,
              borderRadius: 999,
              background: "rgba(0,0,0,0.6)",
              color: "var(--bone)",
              fontSize: 22,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 1200,
              aspectRatio: "16 / 9",
              background: "#000",
              boxShadow: "0 0 0 2px var(--bone), 12px 12px 0 var(--accent)",
            }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={`${filmTitle} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        </div>
      )}
    </>
  );
}
