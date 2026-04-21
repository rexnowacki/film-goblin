import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import Avatar from "../components/Avatar.jsx";
import TopNav from "../components/TopNav.jsx";
import { FILM_BY_ID, LISTS, USERS } from "../data.js";

const ALERTS_RAW = [
  { id: "a1", kind: "drop", film: "midsommar", store: "Apple TV", from: 14.99, to: 4.99, time: "12 min ago", unread: true, seen: false, urgency: "hot" },
  { id: "a2", kind: "drop", film: "hereditary", store: "iTunes", from: 12.99, to: 7.99, time: "2 hr ago", unread: true, seen: false },
  { id: "a3", kind: "list", list: "folk-terror", count: 3, time: "4 hr ago", unread: true, seen: false },
  { id: "a4", kind: "recommend", user: "doomslug", film: "saintmaud", body: "saw this on sale and thought of you. it's a bad thought. watch it anyway.", time: "6 hr ago", unread: true, seen: false },
  { id: "a5", kind: "drop", film: "witch", store: "Apple TV", from: 14.99, to: 9.99, time: "yesterday", unread: false, seen: true },
  { id: "a6", kind: "expiring", film: "lighthouse", store: "iTunes", price: 3.99, hoursLeft: 9, time: "yesterday", unread: false, seen: true, urgency: "warning" },
  { id: "a7", kind: "restock", film: "cure", store: "Criterion Channel", time: "2 days ago", unread: false, seen: true },
  { id: "a8", kind: "review", user: "moss.witch", film: "babadook", rating: 9, time: "3 days ago", unread: false, seen: true },
  { id: "a9", kind: "drop", film: "pearl", store: "Apple TV", from: 19.99, to: 6.99, time: "4 days ago", unread: false, seen: true },
  { id: "a10", kind: "milestone", body: "Your coven saved $184 this month. A new record.", time: "5 days ago", unread: false, seen: true },
];

export default function AlertsPage({ onNavigate, onOpenFilm }) {
  const [filter, setFilter] = useState("all");
  const [alerts, setAlerts] = useState(ALERTS_RAW);

  const visible = useMemo(() => {
    if (filter === "unread") return alerts.filter(a => a.unread);
    if (filter === "drops") return alerts.filter(a => a.kind === "drop" || a.kind === "expiring");
    if (filter === "social") return alerts.filter(a => a.kind === "recommend" || a.kind === "review");
    if (filter === "lists") return alerts.filter(a => a.kind === "list");
    return alerts;
  }, [filter, alerts]);

  const unreadCount = alerts.filter(a => a.unread).length;
  const totalSavings = alerts
    .filter(a => a.kind === "drop")
    .reduce((s, a) => s + (a.from - a.to), 0).toFixed(2);

  const markAllRead = () => setAlerts(as => as.map(a => ({ ...a, unread: false })));
  const dismiss = (id) => setAlerts(as => as.filter(a => a.id !== id));

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="alerts" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "32px 0", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 8 }}>Chapter IV · The Omens Inbox</div>
            <h1 className="display" style={{ fontSize: 112, lineHeight: 0.88, margin: 0 }}>
              <span style={{ color: "var(--accent)" }}>{unreadCount}</span> Omens<br />Await Thee.
            </h1>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 16, maxWidth: 520, margin: "18px 0 0" }}>
              Price drops, restocks, whisperings from the coven. We only interrupt when it's worth it.
            </p>
          </div>
          <div style={{ display: "grid", gap: 10, minWidth: 260 }}>
            <StatBlock big={unreadCount} small="Unread" accent />
            <StatBlock big={`$${totalSavings}`} small="You Could Save" />
            <button className="btn btn-sm btn-outline" onClick={markAllRead} style={{ justifyContent: "center" }}>
              ✓ Mark All Read
            </button>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center" }}>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Filter</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: "All", count: alerts.length },
              { id: "unread", label: "Unread", count: unreadCount },
              { id: "drops", label: "Price Drops", count: alerts.filter(a => a.kind === "drop" || a.kind === "expiring").length },
              { id: "social", label: "The Coven", count: alerts.filter(a => a.kind === "recommend" || a.kind === "review").length },
              { id: "lists", label: "Lists", count: alerts.filter(a => a.kind === "list").length },
            ].map(s => (
              <button key={s.id} onClick={() => setFilter(s.id)} className="caps" style={{
                background: filter === s.id ? "var(--accent)" : "transparent",
                color: filter === s.id ? "var(--accent-ink)" : "var(--muted)",
                border: "1px solid " + (filter === s.id ? "var(--accent)" : "#333"),
                padding: "6px 12px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-ui)", fontWeight: 700,
              }}>{s.label} <span style={{ opacity: 0.55, marginLeft: 4 }}>{s.count}</span></button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }} className="caps">
            {visible.length} alerts
          </span>
        </div>
      </section>

      <div className="container-wide" style={{ padding: "32px 32px 60px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 40 }}>
        <main>
          {visible.length === 0 ? (
            <div style={{ padding: "80px 0", textAlign: "center", border: "1px dashed #333", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 72, color: "var(--accent)", marginBottom: 12 }}>✦</div>
              The scroll is empty. For now.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 0, borderTop: "1px solid #333" }}>
              {visible.map(a => <AlertRow key={a.id} alert={a} onOpenFilm={onOpenFilm} onNavigate={onNavigate} onDismiss={() => dismiss(a.id)} />)}
            </div>
          )}
        </main>

        <aside>
          <div style={{ border: "1px solid #333", background: "var(--void-2)", padding: 20, marginBottom: 20 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Thy Oath</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 48, lineHeight: 1, color: "var(--accent)" }}>−30%</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }} className="caps">threshold</span>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, lineHeight: 1.45, margin: "0 0 14px", color: "var(--muted)" }}>
              You're disturbed only when a tracked film bleeds by at least this much. Set during the Oath.
            </p>
            <button className="btn btn-sm btn-outline" onClick={() => onNavigate("settings")} style={{ width: "100%", justifyContent: "center", fontSize: 10 }}>
              Edit Oath →
            </button>
          </div>

          <div style={{ border: "1px solid #333", padding: 20, marginBottom: 20 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>Quiet Hours</div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.4, margin: "0 0 10px" }}>
              We won't interrupt the dreaming hours.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)" }}>22:00 → 08:00</div>
            </div>
            <button className="btn btn-sm btn-outline" onClick={() => onNavigate("settings")} style={{ width: "100%", justifyContent: "center", fontSize: 10 }}>
              Change Hours →
            </button>
          </div>

          <div style={{ padding: 20, background: "var(--accent)", color: "var(--accent-ink)" }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Tip Of The Day</div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.4, margin: 0 }}>
              Sales on Apple TV tend to expire Thursday nights. Keep your thumbs loose.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AlertRow({ alert, onOpenFilm, onNavigate, onDismiss }) {
  const a = alert;
  const film = a.film ? FILM_BY_ID[a.film] : null;
  const list = a.list ? LISTS.find(l => l.id === a.list) : null;
  const user = a.user ? USERS.find(u => u.handle === a.user) : null;

  const bgUnread = a.unread ? "var(--void-2)" : "transparent";
  const borderLeft = a.unread ? `4px solid var(--accent)` : `4px solid transparent`;

  const openPrimary = () => {
    if (film) onOpenFilm(film.id);
    else if (list) onNavigate("list", list.id);
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "88px 1fr auto", gap: 18,
      padding: "18px 20px 18px 16px", borderBottom: "1px solid #333",
      background: bgUnread, borderLeft,
      alignItems: "center",
      cursor: (film || list) ? "pointer" : "default",
      transition: "background 150ms",
    }} onClick={openPrimary}>
      <div style={{ position: "relative" }}>
        {film && <FilmPoster film={film} size="sm" style={{ width: 80, height: 120 }} />}
        {list && (
          <div style={{
            width: 80, height: 120, background: list.bg, border: "2px solid var(--void-3)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(${list.accent} 1.2px, transparent 1.4px)`, backgroundSize: "8px 8px", opacity: 0.4 }} />
            <div style={{ position: "absolute", inset: 6, fontFamily: "var(--font-display)", fontSize: 11, lineHeight: 0.95, color: list.fg || "var(--bone)", display: "flex", alignItems: "flex-end" }}>
              {list.title}
            </div>
          </div>
        )}
        {!film && !list && (
          <div style={{
            width: 80, height: 120,
            background: a.kind === "milestone" ? "var(--accent)" : "var(--void-3)",
            color: a.kind === "milestone" ? "var(--accent-ink)" : "var(--accent)",
            border: "2px solid var(--void-3)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontSize: 54, lineHeight: 1,
          }}>
            {a.kind === "milestone" ? "✦" : "◉"}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <AlertKind kind={a.kind} />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{a.time}</span>
          {a.unread && <span className="caps" style={{ fontSize: 9, color: "var(--accent)", fontWeight: 800 }}>● New</span>}
        </div>

        {a.kind === "drop" && (
          <div>
            <div className="head" style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 4 }}>
              {film.title} <span style={{ color: "var(--muted)", fontSize: 16 }}>just bled</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--accent)", lineHeight: 1 }}>${a.to}</span>
              <span style={{ fontSize: 14, color: "var(--muted)", textDecoration: "line-through" }}>${a.from}</span>
              <span className="chip chip-filled" style={{ fontSize: 10 }}>
                −{Math.round((1 - a.to / a.from) * 100)}%
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }} className="caps">on {a.store}</span>
            </div>
            <Sparkline from={a.from} to={a.to} seed={film.id} />
          </div>
        )}
        {a.kind === "expiring" && (
          <div>
            <div className="head" style={{ fontSize: 24, lineHeight: 1.05, marginBottom: 4 }}>
              {film.title} — sale ends soon
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--accent)", lineHeight: 1 }}>${a.price}</span>
              <span className="chip" style={{ fontSize: 10, background: "#f5d300", color: "#0a0a0a", borderColor: "#f5d300" }}>
                ⏳ {a.hoursLeft}h left
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }} className="caps">{a.store}</span>
            </div>
          </div>
        )}
        {a.kind === "list" && (
          <div>
            <div className="head" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 4 }}>
              {a.count} films from <em style={{ color: "var(--accent)" }}>{list.title}</em> are on sale
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }} className="caps">
              Curated by @{list.curator}
            </div>
          </div>
        )}
        {a.kind === "recommend" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Avatar name={user.name} color={user.color} size={24} />
              <span style={{ fontSize: 13 }}><b>{user.name}</b> sent you <b>{film.title}</b></span>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.4, margin: 0 }}>
              "{a.body}"
            </p>
          </div>
        )}
        {a.kind === "restock" && (
          <div>
            <div className="head" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 4 }}>
              {film.title} returned to {a.store}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
              It was gone. Now it's back. Watch it before it disappears again.
            </div>
          </div>
        )}
        {a.kind === "review" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Avatar name={user.name} color={user.color} size={24} />
              <span style={{ fontSize: 13 }}><b>{user.name}</b> reviewed <b>{film.title}</b></span>
              <span className="chip" style={{ fontSize: 10, background: "var(--accent)", color: "var(--accent-ink)", border: "none", padding: "2px 6px" }}>
                {a.rating}/10
              </span>
            </div>
          </div>
        )}
        {a.kind === "milestone" && (
          <div>
            <div className="head" style={{ fontSize: 24, lineHeight: 1.1, marginBottom: 4, color: "var(--accent)" }}>A Milestone</div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.4, margin: 0 }}>
              {a.body}
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", minWidth: 140 }} onClick={e => e.stopPropagation()}>
        {a.kind === "drop" && <button className="btn btn-sm" onClick={() => onOpenFilm(film.id)}>Buy Now →</button>}
        {a.kind === "expiring" && <button className="btn btn-sm" onClick={() => onOpenFilm(film.id)}>Buy Before Sunset →</button>}
        {a.kind === "list" && <button className="btn btn-sm" onClick={() => onNavigate("list", list.id)}>Open Grimoire →</button>}
        {a.kind === "recommend" && (
          <>
            <button className="btn btn-sm" onClick={() => onOpenFilm(film.id)}>View Film</button>
            <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Thank Sender</button>
          </>
        )}
        {a.kind === "restock" && <button className="btn btn-sm" onClick={() => onOpenFilm(film.id)}>Go See</button>}
        {a.kind === "review" && <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }} onClick={() => onOpenFilm(film.id)}>Read Review</button>}
        {a.kind === "milestone" && <button className="btn btn-sm btn-outline" style={{ color: "var(--bone)", borderColor: "#444" }}>Share</button>}
        <button onClick={onDismiss} className="caps" style={{
          background: "transparent", border: "1px solid #333", color: "var(--muted)",
          padding: "5px 10px", fontSize: 9, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
        }}>✗ Dismiss</button>
      </div>
    </div>
  );
}

function AlertKind({ kind }) {
  const meta = {
    drop: { label: "Price Drop", bg: "var(--accent)", fg: "var(--accent-ink)" },
    expiring: { label: "Sale Ending", bg: "#f5d300", fg: "#0a0a0a" },
    list: { label: "List Update", bg: "#7a4e9e", fg: "#f3ecd8" },
    recommend: { label: "From The Coven", bg: "#3a5f3a", fg: "#f3ecd8" },
    restock: { label: "Restock", bg: "#1a2a3a", fg: "#f3ecd8", border: "1px solid #f3ecd8" },
    review: { label: "Friend Review", bg: "transparent", fg: "var(--muted)", border: "1px solid #333" },
    milestone: { label: "Milestone", bg: "#b8221c", fg: "#f3ecd8" },
  }[kind] || { label: kind, bg: "var(--void-3)", fg: "var(--bone)" };

  return (
    <span className="caps" style={{
      background: meta.bg, color: meta.fg,
      border: meta.border || "none",
      padding: "3px 8px", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
    }}>
      {meta.label}
    </span>
  );
}

function Sparkline({ from, to, seed = "x" }) {
  const w = 280, h = 34;
  const n = 30;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sin(hash + i * 0.7) * 0.4 + 0.5;
    const easing = i / (n - 1);
    const y = from - (from - to) * easing + r * 1.2 - 0.6;
    const yn = 1 - (y - Math.min(from, to)) / (Math.max(from - to, 0.01));
    pts.push([i / (n - 1) * w, yn * (h - 4) + 2]);
  }
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx={w} cy={pts[pts.length - 1][1]} r="3" fill="var(--accent)" />
    </svg>
  );
}

function StatBlock({ big, small, accent }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: accent ? "var(--accent)" : "transparent",
      color: accent ? "var(--accent-ink)" : "var(--void)",
      border: "2px solid var(--void)",
      display: "flex", alignItems: "baseline", gap: 10,
    }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1 }}>{big}</span>
      <span className="caps" style={{ fontSize: 9, opacity: 0.8 }}>{small}</span>
    </div>
  );
}
