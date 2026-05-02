import type { CSSProperties } from "react";
import FeedCardSkeleton from "./FeedCardSkeleton";

export default function SkeletonFeed({ count = 6 }: { count?: number }) {
  return (
    <div
      className="container-wide stackable"
      style={{
        padding: "32px var(--container-pad)",
        "--stack-template": "220px 1fr 320px",
        "--stack-gap": "32px",
      } as CSSProperties}
    >
      <aside className="desktop-only">
        <div className="skel" style={{ height: 11, width: 90 }} />
        <div className="skel" style={{ height: 14, width: "85%", marginTop: 12 }} />
        <div className="skel" style={{ height: 14, width: "60%", marginTop: 6 }} />
      </aside>
      <main>
        <div className="skel" style={{ height: 36, width: 180, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[44, 64, 52, 48].map((w, i) => (
            <div key={i} className="skel" style={{ height: 24, width: w }} />
          ))}
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <FeedCardSkeleton key={i} />
        ))}
      </main>
      <aside className="desktop-only">
        <div className="skel" style={{ height: 11, width: 120 }} />
        <div className="skel" style={{ height: 14, width: "80%", marginTop: 12 }} />
      </aside>
    </div>
  );
}
