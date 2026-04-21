export default function HalftoneBar({ color = "var(--accent)", height = 24 }) {
  return (
    <div style={{
      height,
      color,
      backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.7px)",
      backgroundSize: "7px 7px",
      width: "100%",
    }} />
  );
}
