export default function IOSFrame({ children, width = 390, height = 780, dark = true }) {
  return (
    <div style={{
      width, height, borderRadius: 48, overflow: "hidden",
      position: "relative", background: dark ? "#000" : "#F2F2F7",
      boxShadow: "0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)",
      fontFamily: "-apple-system, system-ui, sans-serif",
      WebkitFontSmoothing: "antialiased",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)",
        width: 126, height: 37, borderRadius: 24, background: "#000", zIndex: 50,
      }} />
      <div style={{ position: "absolute", inset: 0 }}>{children}</div>
    </div>
  );
}
