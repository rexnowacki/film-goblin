import { useState } from "react";
import TopNav from "../components/TopNav.jsx";
import { LISTS, FILM_BY_ID } from "../data.js";

export default function ListsPage({ onNavigate, onOpenFilm }) {
  const [filter, setFilter] = useState("popular");

  const extended = [
    ...LISTS,
    { id: "killed-me", title: "Films That Killed Me And I'm Still Mad About It", curator: "tallow.jones", count: 12, films: ["hereditary", "skinamarink", "cure"], bg: "#1a1a1a", accent: "#f5d300" },
    { id: "under-90", title: "Under 90 Minutes Of Terror", curator: "gristleburn", count: 26, films: ["saintmaud", "babadook", "itfollows"], bg: "#3a0f2e", accent: "#ff2d88" },
    { id: "color-of-blood", title: "Films Shot In The Color Of Blood", curator: "candleflesh", count: 19, films: ["suspiria", "pearl", "mandy"], bg: "#b8221c", fg: "#f5d300", accent: "#0a0a0a" },
  ];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="lists" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "48px 0 32px", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "end" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter III · The Grimoires</div>
            <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
              Curated<br /><em style={{ color: "var(--accent)" }}>Lists</em>
            </h1>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17, maxWidth: 520, margin: "16px 0 0" }}>
              Watchlists compiled by the coven. Subscribe to one and we'll alert you when any film on it hits a sale.
            </p>
          </div>
          <div>
            <button className="btn btn-lg" style={{ width: "100%", justifyContent: "center" }}>
              ✦ Conjure Your Own List
            </button>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, marginTop: 8, opacity: 0.65 }}>
              Build a grimoire. Name it. Share it. Let the coven judge you.
            </p>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center" }}>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Show</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "popular", label: "Popular" },
              { id: "new", label: "New" },
              { id: "official", label: "Official" },
              { id: "yours", label: "Yours" },
              { id: "following", label: "Following" },
            ].map(s => (
              <button key={s.id} onClick={() => setFilter(s.id)} className="caps" style={{
                background: filter === s.id ? "var(--accent)" : "transparent",
                color: filter === s.id ? "var(--accent-ink)" : "var(--muted)",
                border: "1px solid " + (filter === s.id ? "var(--accent)" : "#333"),
                padding: "6px 12px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-ui)", fontWeight: 700,
              }}>{s.label}</button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }} className="caps">
            {extended.length} grimoires
          </span>
        </div>
      </section>

      <section style={{ padding: "36px 0 24px" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>✦ Recommended Reading ✦</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {extended.slice(0, 3).map((list, i) => (
              <BigListCard key={list.id} list={list} rot={[-1.5, 0.8, -0.6][i]} onOpen={() => onNavigate("list", list.id)} />
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14 }}>All Grimoires</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {extended.map(list => (
              <SmallListCard key={list.id} list={list} onOpenFilm={onOpenFilm} onOpen={() => onNavigate("list", list.id)} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function BigListCard({ list, rot = 0, onOpen }) {
  return (
    <div onClick={onOpen} style={{
      background: list.bg, color: list.fg || "var(--bone)",
      border: "3px solid var(--void)", boxShadow: "6px 6px 0 var(--void)",
      transform: `rotate(${rot}deg)`, cursor: "pointer", position: "relative",
    }}>
      <div style={{ aspectRatio: "4/5", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(${list.accent} 2.2px, transparent 2.4px)`,
          backgroundSize: "12px 12px", opacity: 0.35,
        }} />
        <div style={{
          position: "absolute", inset: 20,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {list.official && (
              <span className="stamp" style={{ background: list.accent, color: list.bg, borderColor: list.accent }}>
                ✦ Official
              </span>
            )}
            <span className="caps" style={{ fontSize: 10, color: list.accent, marginLeft: "auto" }}>
              {list.count} films
            </span>
          </div>
          <div className="display" style={{
            fontSize: list.title.length > 30 ? 32 : 48,
            lineHeight: 0.95,
          }}>
            {list.title}
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${list.fg || "var(--bone)"}`, fontSize: 11, fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        <span>@{list.curator}</span>
        <button onClick={(e) => { e.stopPropagation(); }} className="caps" style={{
          background: list.accent, color: list.bg, border: `2px solid ${list.accent}`,
          padding: "4px 10px", fontSize: 9, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
        }}>+ Subscribe</button>
      </div>
    </div>
  );
}

function SmallListCard({ list, onOpen }) {
  return (
    <div onClick={onOpen} style={{ cursor: "pointer" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "2px solid var(--void-3)" }}>
        {list.films.slice(0, 4).map(fid => {
          const f = FILM_BY_ID[fid];
          if (!f) return <div key={fid} style={{ aspectRatio: "2/3", background: "var(--void-3)" }} />;
          return (
            <div key={fid} style={{ aspectRatio: "2/3", background: f.bg, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(${f.accent} 1px, transparent 1.2px)`, backgroundSize: "5px 5px", opacity: 0.4 }} />
              <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, fontFamily: "var(--font-head)", fontSize: 9, lineHeight: 1, color: f.fg }}>
                {f.title}
              </div>
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 4 - list.films.length) }).map((_, i) => (
          <div key={i} style={{ aspectRatio: "2/3", background: "var(--void-3)" }} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="head" style={{ fontSize: 18, lineHeight: 1.1, marginBottom: 4 }}>{list.title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }} className="caps">
          <span>@{list.curator}</span>
          <span>{list.count} films</span>
        </div>
      </div>
    </div>
  );
}
