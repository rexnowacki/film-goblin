import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import PriceDrop from "../components/PriceDrop.jsx";
import Stars from "../components/Stars.jsx";
import TopNav from "../components/TopNav.jsx";
import { FILMS } from "../data.js";

export default function FilmsPage({ onNavigate, onOpenFilm }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("rating");
  const [onlyOnSale, setOnlyOnSale] = useState(false);

  const films = useMemo(() => {
    return FILMS
      .filter(f => !q || f.title.toLowerCase().includes(q.toLowerCase()) || f.director.toLowerCase().includes(q.toLowerCase()))
      .filter(f => !onlyOnSale || (f.prices[0] && f.prices[0].current < f.prices[0].was))
      .sort((a, b) => {
        if (sort === "rating") return b.rating - a.rating;
        if (sort === "year") return b.year - a.year;
        if (sort === "az") return a.title.localeCompare(b.title);
        if (sort === "price") return (a.prices[0]?.current || 99) - (b.prices[0]?.current || 99);
        return 0;
      });
  }, [q, sort, onlyOnSale]);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="films" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px", position: "relative" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter II · The Archive</div>
          <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.88 }}>
            Every Film, <em style={{ color: "var(--accent)" }}>Indexed</em>.
          </h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17, maxWidth: 640, margin: "16px 0 24px" }}>
            18,402 films scraped from Apple's marketplace. Find one, track one, own one when it goes cheap.
          </p>

          <div style={{ display: "flex", gap: 0, border: "3px solid var(--void)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)" }}>
            <span style={{ padding: "16px 18px", fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>✦</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Title, director, year, genre…"
              style={{
                flex: 1, background: "transparent", border: 0,
                fontFamily: "var(--font-serif)", fontSize: 20, padding: "12px 8px",
                color: "var(--void)", outline: "none",
              }} />
            <button className="btn btn-dark" style={{ borderRadius: 0, border: 0 }}>Scry</button>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Sort</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "rating", label: "Best" },
              { id: "year", label: "Newest" },
              { id: "az", label: "A–Z" },
              { id: "price", label: "Cheapest" },
            ].map(s => (
              <button key={s.id} onClick={() => setSort(s.id)} className="caps" style={{
                background: sort === s.id ? "var(--accent)" : "transparent",
                color: sort === s.id ? "var(--accent-ink)" : "var(--muted)",
                border: "1px solid " + (sort === s.id ? "var(--accent)" : "#333"),
                padding: "6px 12px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-ui)", fontWeight: 700,
              }}>{s.label}</button>
            ))}
          </div>
          <span style={{ height: 24, width: 1, background: "#333" }}></span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyOnSale} onChange={e => setOnlyOnSale(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            <span className="caps">Only on sale</span>
          </label>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {["grid", "list"].map(v => (
              <button key={v} onClick={() => setView(v)} className="caps" style={{
                background: view === v ? "var(--bone)" : "transparent",
                color: view === v ? "var(--void)" : "var(--muted)",
                border: "1px solid " + (view === v ? "var(--bone)" : "#333"),
                padding: "6px 12px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-ui)", fontWeight: 700,
              }}>{v}</button>
            ))}
          </span>
        </div>
      </section>

      <section style={{ padding: "36px 0 60px" }}>
        <div className="container-wide">
          {view === "grid" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 20 }}>
              {films.map(f => {
                const p = f.prices[0];
                const onSale = p && p.current < p.was;
                const pct = onSale ? Math.round((1 - p.current / p.was) * 100) : 0;
                return (
                  <div key={f.id} style={{ cursor: "pointer", position: "relative" }} onClick={() => onOpenFilm(f.id)}>
                    <div style={{ position: "relative" }}>
                      <FilmPoster film={f} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
                      {onSale && (
                        <div style={{ position: "absolute", top: -10, right: -10 }}>
                          <PriceDrop from={p.was} to={p.current} pct={pct} size="sm" />
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div className="head" style={{ fontSize: 16, lineHeight: 1.1, marginBottom: 3 }}>{f.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--muted)" }} className="caps">
                        <span>{f.year}</span>
                        <Stars rating={f.rating} size={10} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "list" && (
            <div style={{ display: "grid", gap: 0, borderTop: "1px solid #333" }}>
              {films.map(f => {
                const p = f.prices[0];
                const onSale = p && p.current < p.was;
                const pct = onSale ? Math.round((1 - p.current / p.was) * 100) : 0;
                return (
                  <div key={f.id} onClick={() => onOpenFilm(f.id)} style={{
                    display: "grid", gridTemplateColumns: "60px 2fr 1fr 1fr auto", gap: 20,
                    padding: "14px 0", borderBottom: "1px solid #333", alignItems: "center", cursor: "pointer",
                  }}>
                    <FilmPoster film={f} size="xs" />
                    <div>
                      <div className="head" style={{ fontSize: 20, lineHeight: 1 }}>{f.title}</div>
                      <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{f.director} · {f.runtime} min</div>
                    </div>
                    <div className="caps" style={{ fontSize: 11, color: "var(--muted)" }}>{f.genres.join(", ")}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Stars rating={f.rating} size={12} />
                      <span style={{ fontSize: 11 }}>{f.rating.toFixed(1)}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {onSale ? (
                        <>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--accent)" }}>${p.current}</span>
                          <span className="caps" style={{ fontSize: 9, color: "var(--muted)", marginLeft: 6 }}>-{pct}%</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>${p?.was || "—"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
