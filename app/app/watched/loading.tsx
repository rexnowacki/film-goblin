import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import FeedCardSkeleton from "@/components/skeletons/FeedCardSkeleton";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />

      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "32px 0",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <div className="skel" style={{ height: 48, width: "55%", maxWidth: 380, background: "rgba(10,10,10,0.10)" }} />
          <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
            {[0, 1, 2].map(i => (
              <div key={i}>
                <div className="skel" style={{ height: 11, width: 90, background: "rgba(10,10,10,0.10)" }} />
                <div className="skel" style={{ height: 28, width: 60, marginTop: 8, background: "rgba(10,10,10,0.10)" }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "32px 0 60px" }}>
        <div className="container-wide">
          <div className="skel" style={{ height: 14, width: 140, marginBottom: 16 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <FeedCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
