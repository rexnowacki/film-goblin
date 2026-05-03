"use client";

interface PreviewProps {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
}

/**
 * Mini-render of the popup-style overlay using the admin's CURRENT accent.
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
          background: "rgba(10, 10, 10, 0.6)",
          padding: 24,
          borderRadius: 4,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "#141414",
            color: "var(--bone)",
            width: "100%",
            maxWidth: 360,
            borderTop: "3px solid var(--accent)",
            borderRadius: 14,
            padding: "24px 24px 20px",
            position: "relative",
            textAlign: "center",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 6,
              right: 10,
              color: "var(--muted)",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </span>
          <h2
            style={{
              fontFamily: "var(--font-head, 'DM Serif Display', serif)",
              fontSize: 24,
              lineHeight: 1.15,
              margin: 0,
              marginBottom: 14,
              color: "var(--accent)",
            }}
          >
            {title || <span style={{ opacity: 0.5 }}>Title appears here</span>}
          </h2>
          <div
            style={{
              fontFamily: "var(--font-ui, 'IBM Plex Sans', sans-serif)",
              fontSize: 13,
              lineHeight: 1.5,
              marginBottom: 18,
              opacity: body ? 1 : 0.5,
            }}
          >
            {body
              ? body.split(/\n\n+/).map((p, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : "0.85em 0 0" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            {cta_label && cta_href && (
              <span
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  padding: "10px 18px",
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
                border: "2px solid var(--muted-dark)",
                color: "var(--bone)",
                padding: "8px 18px",
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
    </div>
  );
}
