export default function Loading() {
  return (
    <div>
      <div className="skel" style={{ height: 44, width: 130, marginBottom: 28 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--grid-gap)" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ padding: 22, border: "2px solid var(--muted)", background: "var(--void-2)" }}>
            <div className="skel" style={{ height: 28, width: 120, marginBottom: 10 }} />
            <div className="skel" style={{ height: 11, width: "90%", marginBottom: 4 }} />
            <div className="skel" style={{ height: 11, width: "65%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
