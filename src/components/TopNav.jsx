import Avatar from "./Avatar.jsx";

export default function TopNav({ current, onNavigate }) {
  const items = [
    { id: "home", label: "Home" },
    { id: "deals", label: "Deals" },
    { id: "films", label: "Films" },
    { id: "lists", label: "Lists" },
    { id: "friends", label: "Friends" },
    { id: "alerts", label: "Alerts" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, cursor: "pointer" }} onClick={() => onNavigate("landing")}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </div>
          <nav style={{ display: "flex", gap: 22 }}>
            {items.map(item => (
              <a key={item.id} className="caps" style={{
                fontSize: 11,
                color: current === item.id ? "var(--accent)" : "var(--bone)",
                borderBottom: current === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: 4,
                cursor: "pointer",
              }} onClick={() => onNavigate(item.id)}>{item.label}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <input placeholder="Scry the archive…" style={{
              background: "var(--void-3)", border: "1px solid #333",
              color: "var(--bone)", padding: "8px 12px 8px 32px",
              fontFamily: "var(--font-ui)", fontSize: 12, width: 240,
            }} />
            <span style={{ position: "absolute", left: 10, top: 7, opacity: 0.5 }}>✦</span>
          </div>
          <button onClick={() => onNavigate("alerts")} className="chip chip-filled" style={{ cursor: "pointer" }}>⦿ 3 Alerts</button>
          <div onClick={() => onNavigate("settings")} style={{ cursor: "pointer" }}>
            <Avatar name="You Goblin" color="var(--accent)" size={34} />
          </div>
        </div>
      </div>
    </div>
  );
}
