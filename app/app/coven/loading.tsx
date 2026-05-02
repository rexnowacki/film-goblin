import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />

      <section style={{ padding: "32px 0" }}>
        <div className="container-wide">
          <div className="skel" style={{ height: 36, width: 240 }} />
          <div className="skel" style={{ height: 14, width: "60%", marginTop: 12 }} />

          <div style={{ marginTop: 32 }}>
            <div className="skel" style={{ height: 11, width: 120 }} />
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  aria-busy="true"
                  aria-label="Loading covenfolk"
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: 16,
                    background: "var(--void-2)",
                    border: "1px solid #333",
                    alignItems: "center",
                  }}
                >
                  <div className="skel" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="skel" style={{ height: 14, width: "70%" }} />
                    <div className="skel" style={{ height: 10, width: "45%", marginTop: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
