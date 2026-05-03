"use client";

type PanelColor = "pink" | "plum" | "seafoam" | "bone";
type TextColor = PanelColor | "void";

const COLOR_HEX: Record<TextColor, string> = {
  pink: "#ff2d88",
  plum: "#9d6fc4",
  seafoam: "#7a9d92",
  bone: "#f3ecd8",
  void: "#0a0a0a",
};

function ctaTextHex(bg: PanelColor): string {
  return bg === "bone" ? COLOR_HEX.void : COLOR_HEX.bone;
}

interface PreviewProps {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  panel_color: PanelColor;
  title_color: TextColor;
  body_color: TextColor;
  cta_color: PanelColor;
}

export default function AnnouncementPreview({
  title,
  body,
  cta_label,
  cta_href,
  panel_color,
  title_color,
  body_color,
  cta_color,
}: PreviewProps) {
  const panelHex = COLOR_HEX[panel_color];
  const titleHex = COLOR_HEX[title_color];
  const bodyHex = COLOR_HEX[body_color];
  const ctaBgHex = COLOR_HEX[cta_color];
  const ctaTextHexValue = ctaTextHex(cta_color);
  const onPanelMutedHex = panel_color === "bone" ? "rgba(10,10,10,0.55)" : "rgba(243,236,216,0.7)";
  const onPanelBorderHex = panel_color === "bone" ? "rgba(10,10,10,0.35)" : "rgba(243,236,216,0.4)";
  const onPanelTextHex = panel_color === "bone" ? COLOR_HEX.void : COLOR_HEX.bone;

  return (
    <div>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6, color: "var(--muted)" }}>
        Preview
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
            background: panelHex,
            color: onPanelTextHex,
            width: "100%",
            maxWidth: 360,
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
              color: onPanelMutedHex,
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
              color: titleHex,
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
              color: bodyHex,
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
                  background: ctaBgHex,
                  color: ctaTextHexValue,
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
                border: `2px solid ${onPanelBorderHex}`,
                color: onPanelTextHex,
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
