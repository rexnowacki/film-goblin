interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
}

export default function Avatar({ name, color, size = 28 }: AvatarProps) {
  const initials = name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
  const hue = color || ["#ff2d88","#f5d300","#d93a2e","#3a5f3a","#7a4e9e","#ff6a1f"][name.length % 6];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size,
      background: hue,
      color: "var(--void)",
      fontFamily: "var(--font-ui)",
      fontWeight: 900,
      fontSize: size * 0.42,
      letterSpacing: "0.04em",
      border: "2px solid var(--void)",
      borderRadius: "50%",
      flexShrink: 0,
    }}>
      {initials}
    </span>
  );
}
