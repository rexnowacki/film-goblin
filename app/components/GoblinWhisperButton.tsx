"use client";

import { useState } from "react";
import Link from "next/link";
import BottomSheet from "@/components/BottomSheet";

interface Props {
  filmId: string;
  filmTitle: string;
  whisperText: string;
}

export default function GoblinWhisperButton({ filmId, filmTitle, whisperText }: Props) {
  const [open, setOpen] = useState(false);
  const words = whisperText.split(" ");
  const truncated = words.slice(0, 20).join(" ");
  const isTruncated = words.length > 20;

  return (
    <>
      <div style={{ borderTop: "1px solid #222", marginTop: 16, paddingTop: 14 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%", textAlign: "left", background: "none", border: "1px solid #333",
            padding: "12px 14px", cursor: "pointer",
          }}
        >
          <div className="eyebrow" style={{ color: "var(--accent)", fontSize: 9, marginBottom: 8, letterSpacing: "0.12em" }}>
            The Goblin Whispers
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--bone)", lineHeight: 1.55, margin: 0 }}>
            "{truncated}{isTruncated ? "..." : ""}"
          </p>
          {isTruncated && (
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--muted)", marginTop: 8, letterSpacing: "0.06em" }}>
              Read more -&gt;
            </div>
          )}
        </button>
      </div>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="The Goblin Whispers"
      >
        <div style={{ padding: "4px 4px 16px" }}>
          <p style={{
            fontFamily: "var(--font-serif)", fontSize: 16,
            color: "var(--bone)", lineHeight: 1.7, margin: "0 0 20px",
          }}>
            "{whisperText}"
          </p>
          <Link
            href={`/film/${filmId}`}
            onClick={() => setOpen(false)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.06em" }}
          >
            View {filmTitle} -&gt;
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}
