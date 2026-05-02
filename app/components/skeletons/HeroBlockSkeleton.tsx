import type { CSSProperties } from "react";

export default function HeroBlockSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading film"
      style={{
        background: "var(--void-2)",
        color: "var(--bone)",
        borderBottom: "3px solid var(--void)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="container-wide stackable"
        style={{
          paddingTop: 48,
          paddingBottom: 48,
          "--stack-template": "340px 1fr",
          "--stack-gap": "48px",
          alignItems: "start",
        } as CSSProperties}
      >
        <div
          style={{
            transform: "rotate(-2deg)",
            width: "100%",
            maxWidth: "var(--film-hero-poster-size)",
            margin: "0 auto",
          }}
        >
          <div className="skel" style={{ aspectRatio: "2 / 3", width: "100%" }} />
        </div>
        <div>
          <div className="skel" style={{ height: 11, width: 90 }} />
          <div className="skel" style={{ height: 56, width: "75%", marginTop: 14 }} />
          <div className="skel" style={{ height: 12, width: "55%", marginTop: 18 }} />
          <div className="skel" style={{ height: 16, width: "85%", marginTop: 28 }} />
          <div className="skel" style={{ height: 16, width: "70%", marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <div className="skel" style={{ height: 24, width: 64, borderRadius: 999 }} />
            <div className="skel" style={{ height: 24, width: 80, borderRadius: 999 }} />
            <div className="skel" style={{ height: 24, width: 56, borderRadius: 999 }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <div className="skel" style={{ height: 40, width: 120 }} />
            <div className="skel" style={{ height: 40, width: 140 }} />
          </div>
        </div>
      </div>
    </section>
  );
}
