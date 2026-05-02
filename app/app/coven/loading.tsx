import type { CSSProperties } from "react";
import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import HeroStubSkeleton from "@/components/skeletons/HeroStubSkeleton";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />

      <HeroStubSkeleton />

      <section style={{ padding: "32px 0 60px" }}>
        <div className="container-wide">
          <div
            className="stackable"
            style={{ "--stack-template": "1fr 1fr", "--stack-gap": "32px", alignItems: "start" } as CSSProperties}
          >
            <div>
              <div className="skel" style={{ height: 14, width: 120, marginBottom: 16 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[120, 140, 110, 130].map((w, i) => (
                  <div key={i} className="skel" style={{ height: 40, width: w, borderRadius: 999 }} />
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 16,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div className="skel" style={{ height: 14, width: 100 }} />
                <div className="skel" style={{ height: 36, width: 140, borderRadius: 999 }} />
              </div>
              <div className="skel" style={{ height: 44, width: "100%", borderRadius: 999 }} />
              <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    aria-busy="true"
                    aria-label="Loading person"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      border: "1px solid var(--muted)",
                      borderRadius: 999,
                    }}
                  >
                    <div className="skel" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                    <div className="skel" style={{ height: 12, width: "55%" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
