export default function Stars({ rating, size = 14 }) {
  const n = rating / 2;
  return (
    <span style={{ display: "inline-flex", gap: 2, color: "var(--accent)" }}>
      {[0,1,2,3,4].map(i => {
        const fill = Math.min(1, Math.max(0, n - i));
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", width: size, height: size }}>
            <span style={{ position: "absolute", inset: 0, color: "var(--muted-dark)" }}>★</span>
            <span style={{
              position: "absolute", inset: 0,
              overflow: "hidden", width: `${fill*100}%`,
            }}>★</span>
          </span>
        );
      })}
    </span>
  );
}
