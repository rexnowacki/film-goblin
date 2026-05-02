export default function PosterCellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading film">
      <div className="skel" style={{ aspectRatio: "2 / 3", width: "100%" }} />
      <div className="skel" style={{ height: 12, width: "80%", marginTop: 8 }} />
      <div className="skel" style={{ height: 10, width: "55%", marginTop: 6 }} />
    </div>
  );
}
