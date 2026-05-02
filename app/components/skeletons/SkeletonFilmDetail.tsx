import HeroBlockSkeleton from "./HeroBlockSkeleton";

export default function SkeletonFilmDetail() {
  return (
    <>
      <HeroBlockSkeleton />

      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          padding: "48px 0",
          borderBottom: "3px solid var(--void)",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <div className="skel" style={{ height: 11, width: 180, background: "rgba(10,10,10,0.10)" }} />
          <div className="skel" style={{ height: 36, width: "70%", marginTop: 14, background: "rgba(10,10,10,0.10)" }} />
          <div className="skel" style={{ height: 120, width: "100%", marginTop: 20, background: "rgba(10,10,10,0.10)" }} />
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", padding: "48px 0" }}>
        <div className="container-wide">
          <div className="skel" style={{ height: 11, width: 140 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              marginTop: 14,
            }}
          >
            {[0, 1].map(i => (
              <div key={i} style={{ background: "var(--void-2)", border: "1px solid #333", padding: 22 }}>
                <div className="skel" style={{ height: 20, width: "70%" }} />
                <div className="skel" style={{ height: 12, width: "100%", marginTop: 10 }} />
                <div className="skel" style={{ height: 12, width: "92%", marginTop: 6 }} />
                <div className="skel" style={{ height: 12, width: "60%", marginTop: 6 }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
