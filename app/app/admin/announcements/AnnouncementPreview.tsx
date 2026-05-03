"use client";

interface PreviewProps {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
}

/**
 * Smaller-scale rendering of the overlay, using the admin's CURRENT accent.
 * Recipients will see it in their own accent — caption clarifies this.
 */
export default function AnnouncementPreview({ title, body, cta_label, cta_href }: PreviewProps) {
  return (
    <div>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6, color: "var(--muted)" }}>
        Preview (in your accent — recipients see it in theirs)
      </div>
      <div
        style={{
          background: "var(--accent)",
          color: "var(--accent-ink)",
          padding: 32,
          borderRadius: 4,
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-head, 'DM Serif Display', serif)",
            fontSize: 28,
            lineHeight: 1.15,
            margin: 0,
            marginBottom: 16,
          }}
        >
          {title || <span style={{ opacity: 0.5 }}>Title appears here</span>}
        </h2>
        <div
          style={{
            fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 24,
            opacity: body ? 1 : 0.5,
          }}
        >
          {body
            ? body.split(/\n\n+/).map((p, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : "1em 0 0" }}>
                  {p.split("\n").map((line, j, arr) => (
                    <span key={j}>
                      {line}
                      {j < arr.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              ))
            : "Body appears here. Newlines render as paragraph breaks."}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {cta_label && cta_href && (
            <span
              style={{
                background: "var(--bone)",
                color: "var(--void)",
                padding: "8px 20px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {cta_label}
            </span>
          )}
          <span
            style={{
              border: "2px solid var(--accent-ink)",
              padding: "6px 18px",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Got it
          </span>
        </div>
      </div>
    </div>
  );
}
