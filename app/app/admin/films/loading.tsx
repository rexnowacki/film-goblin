export default function Loading() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div className="skel" style={{ height: 44, width: 90 }} />
        <div className="skel" style={{ height: 38, width: 110 }} />
      </div>
      <div className="skel" style={{ height: 44, maxWidth: 480, width: "100%", marginBottom: 12 }} />
      <div style={{ marginBottom: 20 }}>
        <div className="skel" style={{ height: 30, width: 130, borderRadius: 999 }} />
      </div>
      <div style={{ border: "1px solid #333" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #333" }}
          >
            <div className="skel" style={{ width: 48, height: 72 }} />
            <div>
              <div className="skel" style={{ height: 14, width: "55%", marginBottom: 6 }} />
              <div className="skel" style={{ height: 10, width: "35%" }} />
            </div>
            <div className="skel" style={{ height: 30, width: 54 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
