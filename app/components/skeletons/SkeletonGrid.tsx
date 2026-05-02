import HeroStubSkeleton from "./HeroStubSkeleton";
import PosterCellSkeleton from "./PosterCellSkeleton";

interface Props {
  count?: number;
  showSearch?: boolean;
  showSortChips?: boolean;
}

export default function SkeletonGrid({ count = 12, showSearch = false, showSortChips = false }: Props) {
  return (
    <>
      <HeroStubSkeleton />

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {showSearch && (
            <div
              className="skel"
              style={{ height: 44, width: "100%", borderRadius: 999, marginBottom: 18 }}
            />
          )}
          {showSortChips && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[64, 80, 72, 88, 60].map((w, i) => (
                <div key={i} className="skel" style={{ height: 28, width: w, borderRadius: 999 }} />
              ))}
            </div>
          )}
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
