import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import PriceDrop from "../components/PriceDrop.jsx";
import TopNav from "../components/TopNav.jsx";
import { FILMS } from "../data.js";

export default function DealsPage({ onNavigate, onOpenFilm }) {
  const [sort, setSort] = useState("pct");
  const [minDiscount, setMinDiscount] = useState(0);
  const [genre, setGenre] = useState("all");

  const deals = useMemo(() => {
    return FILMS
      .filter(f => f.prices && f.prices[0])
      .map(f => {
        const p = f.prices[0];
        const pct = Math.round((1 - p.current / p.was) * 100);
        return { film: f, was: p.was, now: p.current, pct, save: p.was - p.current };
      })
      .filter(d => d.pct >= minDiscount)
      .filter(d => genre === "all" || d.film.genres.some(g => g.toLowerCase().includes(genre)))
      .sort((a, b) => {
        if (sort === "pct") return b.pct - a.pct;
        if (sort === "price") return a.now - b.now;
        if (sort === "save") return b.save - a.save;
        if (sort === "rating") return b.film.rating - a.film.rating;
        return 0;
      });
  }, [sort, minDiscount, genre]);

  const allGenres = [...new Set(FILMS.flatMap(f => f.genres))];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="deals" onNavigate={onNavigate} />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "48px 0 40px", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 40, alignItems: "end" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter I · Fresh Omens</div>
            <h1 className="display" style={{ fontSize: 112, margin: 0, lineHeight: 0.9 }}>
              The Deals<br /><em style={{ color: "var(--accent)" }}>Oracle</em>
            </h1>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 17, maxWidth: 520, lineHeight: 1.45, margin: "18px 0 0" }}>
              Every film currently discounted on Apple TV &amp; iTunes. Updated hourly. Filter by the kind of dread you're in the mood for.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <Stat big="412" small="Films on sale" />
            <Stat big="-54%" small="Mean discount" />
            <Stat big="$3.99" small="Median now-price" />
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Sort</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "pct", label: "Biggest Cut" },
              { id: "price", label: "Cheapest" },
              { id: "save", label: "Most $ Saved" },
              { id: "rating", label: "Best Reviewed" },
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
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Min cut {minDiscount}%</span>
          <input type="range" min="0" max="80" value={minDiscount} onChange={e => setMinDiscount(+e.target.value)}
            style={{ width: 140, accentColor: "var(--accent)" }} />
          <span style={{ height: 24, width: 1, background: "#333" }}></span>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Genre</span>
          <select value={genre} onChange={e => setGenre(e.target.value)} style={{
            background: "var(--void-3)", color: "var(--bone)", border: "1px solid #333", padding: "6px 10px",
            fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            <option value="all">All</option>
            {allGenres.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
          </select>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }} className="caps">
            {deals.length} deals
          </span>
        </div>
      </section>

      <section style={{ padding: "36px 0 16px" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 14 }}>✦ Bounty of the Day ✦</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 18, marginBottom: 36 }}>
            {deals.slice(0, 3).map((d, i) => (
              <FeaturedDealCard key={d.film.id} deal={d} hero={i === 0} onOpen={() => onOpenFilm(d.film.id)} />
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "0 0 60px" }}>
        <div className="container-wide">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20 }}>
            {deals.map(d => (
              <DealTile key={d.film.id} deal={d} onOpen={() => onOpenFilm(d.film.id)} />
            ))}
          </div>

          {deals.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              The void returned no omens. Loosen your filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function Stat({ big, small }) {
  return (
    <div style={{ border: "2px solid var(--void)", padding: "14px 16px", background: "var(--void)", color: "var(--bone)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 42, color: "var(--accent)", lineHeight: 1 }}>{big}</div>
      <div className="caps" style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{small}</div>
    </div>
  );
}

function FeaturedDealCard({ deal, hero, onOpen }) {
  return (
    <div style={{
      background: deal.film.bg, color: deal.film.fg || "var(--bone)",
      border: "2px solid var(--void)", boxShadow: "5px 5px 0 var(--accent)",
      display: "grid", gridTemplateColumns: hero ? "1fr 1fr" : "100px 1fr",
      gap: 14, padding: 14, position: "relative", cursor: "pointer",
    }} onClick={onOpen}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(${deal.film.accent} 1.5px, transparent 1.8px)`, backgroundSize: "10px 10px", opacity: 0.2, pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <FilmPoster film={deal.film} size={hero ? "md" : "sm"} style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow" style={{ color: deal.film.accent, marginBottom: 6 }}>{deal.film.genres[0]}</div>
          <div className="head" style={{ fontSize: hero ? 30 : 20, lineHeight: 1.02, marginBottom: 6 }}>{deal.film.title}</div>
          <div className="caps" style={{ fontSize: 10, opacity: 0.65 }}>{deal.film.director} · {deal.film.year}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: hero ? 42 : 28, color: deal.film.accent, lineHeight: 1 }}>${deal.now}</span>
            <span style={{ fontSize: 11, textDecoration: "line-through", opacity: 0.5 }}>${deal.was}</span>
          </div>
          <div className="stamp" style={{ background: "var(--yellow)", color: "var(--void)", borderColor: "var(--void)" }}>
            -{deal.pct}% OFF
          </div>
        </div>
      </div>
    </div>
  );
}

function DealTile({ deal, onOpen }) {
  return (
    <div style={{ cursor: "pointer", position: "relative" }} onClick={onOpen}>
      <div style={{ position: "relative" }}>
        <FilmPoster film={deal.film} size="md" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
        <div style={{ position: "absolute", top: -10, right: -10 }}>
          <PriceDrop from={deal.was} to={deal.now} pct={deal.pct} size="sm" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="head" style={{ fontSize: 16, lineHeight: 1.1, marginBottom: 4 }}>{deal.film.title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--accent)" }}>${deal.now}</span>
          <span style={{ fontSize: 10, color: "var(--muted)", textDecoration: "line-through" }}>${deal.was}</span>
          <span className="caps" style={{ fontSize: 9, color: "var(--muted)", marginLeft: "auto" }}>{deal.film.year}</span>
        </div>
      </div>
    </div>
  );
}
