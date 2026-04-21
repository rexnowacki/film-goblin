export default function PriceDrop({ from, to, pct, size = "md" }) {
  return (
    <div className={`price-drop ${size === "sm" ? "price-drop-sm" : ""}`}
         style={size === "sm" ? { fontSize: 16, padding: "2px 8px 4px" } : {}}>
      <span className="pct" style={size === "sm" ? { fontSize: 20 } : {}}>-{pct}%</span>
      <span className="off">${to}</span>
    </div>
  );
}
