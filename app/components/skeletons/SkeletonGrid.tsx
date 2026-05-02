import PosterCellSkeleton from "./PosterCellSkeleton";

export default function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <>
      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "22px 0 18px",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <div className="skel" style={{ height: 48, width: "60%", maxWidth: 420 }} />
          <div className="skel" style={{ height: 48, width: "100%", marginTop: 16 }} />
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[64, 80, 72, 88, 60].map((w, i) => (
              <div key={i} className="skel" style={{ height: 28, width: w, borderRadius: 999 }} />
            ))}
          </div>
          <div className="skel" style={{ height: 12, width: 120, marginBottom: 20 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "var(--grid-gap)",
            }}
          >
            {Array.from({ length: count }).map((_, i) => (
              <PosterCellSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
