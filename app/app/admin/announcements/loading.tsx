export default function Loading() {
  return (
    <div style={{ paddingBottom: 64 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div className="skel" style={{ height: 44, width: 210 }} />
        <div className="skel" style={{ height: 38, width: 175 }} />
      </div>
      <div style={{ border: "1px solid #333" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 80px auto", gap: 12, padding: "8px 14px", borderBottom: "1px solid #333" }}>
          {[110, 80, 60, 70, 70].map((w, i) => (
            <div key={i} className="skel" style={{ height: 9, width: w }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 80px auto", gap: 12, padding: "12px 14px", borderBottom: "1px solid #333", alignItems: "center" }}
          >
            <div className="skel" style={{ height: 14, width: "65%" }} />
            <div className="skel" style={{ height: 10, width: 70 }} />
            <div className="skel" style={{ height: 22, width: 64, borderRadius: 999 }} />
            <div className="skel" style={{ height: 10, width: 30 }} />
            <div className="skel" style={{ height: 30, width: 76 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
