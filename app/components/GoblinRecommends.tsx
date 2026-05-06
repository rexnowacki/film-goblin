"use client";

import { useState } from "react";
import Link from "next/link";
import BottomSheet from "@/components/BottomSheet";
import type { GoblinPickFilm } from "@/lib/queries/goblin-pick";

export default function GoblinRecommends({ film }: { film: GoblinPickFilm | null }) {
  const [whisperOpen, setWhisperOpen] = useState(false);

  return (
    <div>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14, letterSpacing: "0.12em" }}>
        The Goblin Recommends
      </div>

      {film ? (
        <>
          <Link href={`/film/${film.id}`} style={{ display: "block", textDecoration: "none", marginBottom: 14 }}>
            {film.artwork_url ? (
              <img
                src={film.artwork_url}
                alt={film.title}
                style={{ width: "70%", height: "auto", display: "block", margin: "0 auto" }}
              />
            ) : (
              <div style={{ width: "70%", aspectRatio: "2/3", background: "var(--void-2)", border: "1px solid #333", margin: "0 auto" }} />
            )}
          </Link>

          <Link href={`/film/${film.id}`} style={{ textDecoration: "none" }}>
            <div className="h-display" style={{ fontSize: 20, lineHeight: 1.15, color: "var(--bone)", marginBottom: 4 }}>
              {film.title}
            </div>
          </Link>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
            {film.director} · {film.year}
          </div>
          <a
            href={film.itunes_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.06em" }}
          >
            Watch on Apple TV →
          </a>

          {film.whisper_text && (
            <>
              <div style={{ borderTop: "1px solid #222", marginTop: 16, paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setWhisperOpen(true)}
                  style={{
                    width: "100%", textAlign: "left", background: "none", border: "1px solid #333",
                    padding: "12px 14px", cursor: "pointer",
                  }}
                >
                  <div className="eyebrow" style={{ color: "var(--accent)", fontSize: 9, marginBottom: 8, letterSpacing: "0.12em" }}>
                    The Goblin Whispers
                  </div>
                  {(() => {
                    const words = film.whisper_text.split(" ");
                    const truncated = words.slice(0, 20).join(" ");
                    const isTruncated = words.length > 20;
                    return (
                      <>
                        <p style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--bone)", lineHeight: 1.55, margin: 0 }}>
                          "{truncated}{isTruncated ? "…" : ""}"
                        </p>
                        {isTruncated && (
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--muted)", marginTop: 8, letterSpacing: "0.06em" }}>
                            Read more →
                          </div>
                        )}
                      </>
                    );
                  })()}
                </button>
              </div>

              <BottomSheet
                open={whisperOpen}
                onClose={() => setWhisperOpen(false)}
                title="The Goblin Whispers"
              >
                <div style={{ padding: "4px 4px 16px" }}>
                  <p style={{
                    fontFamily: "var(--font-serif)", fontSize: 16,
                    color: "var(--bone)", lineHeight: 1.7, margin: "0 0 20px",
                  }}>
                    "{film.whisper_text}"
                  </p>
                  <Link
                    href={`/film/${film.id}`}
                    onClick={() => setWhisperOpen(false)}
                    style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.06em" }}
                  >
                    View {film.title} →
                  </Link>
                </div>
              </BottomSheet>
            </>
          )}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)" }}>
          No pick set yet.
        </p>
      )}
    </div>
  );
}
