import type { CSSProperties } from "react";
import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import FeedCardSkeleton from "@/components/skeletons/FeedCardSkeleton";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />

      <section style={{ background: "var(--void-2)", borderBottom: "3px solid var(--void)", padding: "48px 0" }}>
        <div
          className="container-wide stackable"
          style={{ "--stack-template": "140px 1fr", "--stack-gap": "32px", alignItems: "center" } as CSSProperties}
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div className="skel" style={{ width: 140, height: 140, borderRadius: "50%" }} />
          </div>
          <div>
            <div className="skel" style={{ height: 9, width: 56, marginBottom: 14 }} />
            <div className="skel" style={{ height: 38, width: 220, marginBottom: 10 }} />
            <div className="skel" style={{ height: 9, width: 100, marginBottom: 22 }} />
            <div className="skel" style={{ height: 13, width: "75%", marginBottom: 6 }} />
            <div className="skel" style={{ height: 13, width: "55%", marginBottom: 22 }} />
            <div className="skel" style={{ height: 40, width: 160, borderRadius: 999 }} />
          </div>
        </div>
      </section>

      <section style={{ padding: "48px 0", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide">
          <div className="skel" style={{ height: 9, width: 90, marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div className="skel" style={{ width: 56, height: 56, borderRadius: "50%" }} />
                <div className="skel" style={{ height: 8, width: 48 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <div className="skel" style={{ height: 9, width: 120, marginBottom: 16 }} />
          {[0, 1, 2, 3].map(i => <FeedCardSkeleton key={i} />)}
        </div>
      </section>
    </div>
  );
}
