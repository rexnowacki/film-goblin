export default function FeedCardSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading activity"
      style={{
        display: "flex",
        gap: 12,
        padding: "16px 0",
        borderBottom: "1px solid #222",
        alignItems: "flex-start",
      }}
    >
      <div className="skel" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="skel" style={{ height: 11, width: "30%" }} />
        <div className="skel" style={{ height: 14, width: "85%", marginTop: 8 }} />
        <div className="skel" style={{ height: 14, width: "60%", marginTop: 6 }} />
      </div>
      <div className="skel" style={{ width: 56, aspectRatio: "2 / 3", flexShrink: 0 }} />
    </div>
  );
}
