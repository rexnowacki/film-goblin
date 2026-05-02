import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import HeroStubSkeleton from "@/components/skeletons/HeroStubSkeleton";
import FeedCardSkeleton from "@/components/skeletons/FeedCardSkeleton";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />

      <HeroStubSkeleton />

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div className="skel" style={{ height: 10, width: 60 }} />
                <div className="skel" style={{ height: 16, width: 36 }} />
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 24, overflowX: "hidden" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skel" style={{ width: 70, height: 105, flexShrink: 0 }} />
            ))}
          </div>

          <div className="skel" style={{ height: 11, width: 140, marginBottom: 16 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
