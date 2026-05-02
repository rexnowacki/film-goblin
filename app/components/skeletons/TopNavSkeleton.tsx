export default function TopNavSkeleton() {
  return (
    <div
      style={{
        borderBottom: "1px solid #2a2a2a",
        background: "var(--void-2)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          maxWidth: 1280,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            lineHeight: 1,
            color: "var(--bone)",
          }}
        >
          Film<span style={{ color: "var(--accent)" }}>Goblin</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="skel" style={{ width: 22, height: 22, borderRadius: 4 }} />
          <div className="skel" style={{ width: 32, height: 32, borderRadius: "50%" }} />
        </div>
      </div>
    </div>
  );
}
