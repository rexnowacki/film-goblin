import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import Stars from "../components/Stars.jsx";
import Avatar from "../components/Avatar.jsx";
import { FILM_BY_ID, USERS, genPriceHistory } from "../data.js";

export default function FilmDetailPage({ filmId, onNavigate, onOpenFilm }) {
  const film = FILM_BY_ID[filmId] || FILM_BY_ID.midsommar;
  const [recOpen, setRecOpen] = useState(false);
  const [tab, setTab] = useState("reviews");

  const history = useMemo(() => {
    const p = film.prices[0];
    const seed = film.id.charCodeAt(0) + film.id.charCodeAt(1);
    return genPriceHistory(seed, p.current, p.was);
  }, [film.id]);

  const currentPrice = film.prices[0].current;
  const wasPrice = film.prices[0].was;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <div style={{ borderBottom: "1px solid #2a2a2a", background: "var(--void-2)", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1, cursor: "pointer" }} onClick={() => onNavigate("landing")}>
              Film<span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <nav style={{ display: "flex", gap: 22 }}>
              {[
                { id: "home", label: "Home" },
                { id: "deals", label: "Deals" },
                { id: "films", label: "Films" },
                { id: "lists", label: "Lists" },
                { id: "friends", label: "Friends" },
              ].map(item => (
                <a key={item.id} className="caps" style={{ fontSize: 11, color: "var(--bone)", cursor: "pointer" }}
                   onClick={() => onNavigate(item.id)}>{item.label}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name="You Goblin" color="var(--accent)" size={34} />
          </div>
        </div>
      </div>

      <section style={{
        background: film.bg, color: film.fg || "var(--bone)",
        borderBottom: "3px solid var(--void)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(${film.accent} 2px, transparent 2.2px)`,
          backgroundSize: "14px 14px",
          opacity: 0.25,
        }} />
        <div className="container-wide" style={{ position: "relative", padding: "48px 32px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 48, alignItems: "start" }}>
          <div style={{ transform: "rotate(-2deg)", position: "relative" }}>
            <FilmPoster film={film} size="xl" />
            <div className="stamp" style={{
              position: "absolute", top: 20, left: -20, zIndex: 4,
              background: "var(--yellow)", color: "var(--void)", borderColor: "var(--void)",
              transform: "rotate(-8deg)",
              fontSize: 14,
            }}>
              ✦ On Sale Now
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ color: film.accent, marginBottom: 10, opacity: 0.8 }}>
              {film.genres.join(" · ")}
            </div>
            <h1 className="display" style={{
              fontSize: "clamp(72px, 8vw, 128px)",
              margin: 0, lineHeight: 0.86, letterSpacing: "-0.02em",
            }}>
              {film.title}
            </h1>
            <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap", alignItems: "center" }} className="caps">
              <span style={{ fontSize: 13 }}>Dir. {film.director}</span>
              <span>·</span>
              <span style={{ fontSize: 13 }}>{film.year}</span>
              <span>·</span>
              <span style={{ fontSize: 13 }}>{film.runtime} min</span>
              <span>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <Stars rating={film.rating} size={14} />
                <span>{film.rating.toFixed(1)}</span>
                <span style={{ opacity: 0.6 }}>/ 10</span>
              </span>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontStyle: "italic", lineHeight: 1.35, margin: "28px 0", maxWidth: 620, textWrap: "pretty" }}>
              "{film.overview}"
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <button className="btn btn-lg" onClick={() => setRecOpen(true)}>
                ✦ Recommend To A Friend
              </button>
              <button className="btn btn-outline btn-lg" style={{ color: film.fg || "var(--bone)", borderColor: film.fg || "var(--bone)" }}>
                + Watchlist
              </button>
              <button className="btn btn-outline btn-lg" style={{ color: film.fg || "var(--bone)", borderColor: film.fg || "var(--bone)" }}>
                ⦿ Mark Seen
              </button>
            </div>

            <div style={{ display: "flex", gap: 22, fontSize: 11, opacity: 0.8 }} className="caps">
              <span>2,144 Watched</span>
              <span>486 Watchlisted</span>
              <span>204 Recommended</span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "48px 0", borderBottom: "3px solid var(--void)", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 60 }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>The Current Bounty</div>
            <h2 className="display" style={{ fontSize: 60, margin: "0 0 20px", lineHeight: 0.9 }}>
              Buy it while<br/>the <em style={{ color: "var(--accent)", fontStyle: "italic" }}>omen</em> lasts.
            </h2>

            <div style={{ display: "grid", gap: 12 }}>
              {[
                { store: "Apple TV", country: "US", current: currentPrice, was: wasPrice },
                { store: "iTunes", country: "UK", current: currentPrice + 0.5, was: wasPrice },
                { store: "iTunes", country: "CA", current: currentPrice + 1, was: wasPrice + 1 },
                { store: "iTunes", country: "AU", current: currentPrice + 1.5, was: wasPrice + 2 },
              ].map((row, i) => {
                const p = Math.round((1 - row.current / row.was) * 100);
                const isBest = i === 0;
                return (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 14, alignItems: "center",
                    padding: "14px 16px",
                    background: isBest ? "var(--void)" : "transparent",
                    color: isBest ? "var(--bone)" : "var(--void)",
                    border: "2px solid var(--void)",
                  }}>
                    <div style={{
                      width: 36, height: 36,
                      background: isBest ? "var(--accent)" : "transparent",
                      border: "2px solid " + (isBest ? "var(--accent)" : "var(--void)"),
                      color: isBest ? "var(--accent-ink)" : "var(--void)",
                      display: "grid", placeItems: "center",
                      fontFamily: "var(--font-display)", fontSize: 14,
                    }}></div>
                    <div>
                      <div style={{ fontFamily: "var(--font-head)", fontSize: 20 }}>{row.store}</div>
                      <div className="caps" style={{ fontSize: 10, opacity: 0.65 }}>{row.country}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1, color: isBest ? "var(--accent)" : "var(--void)" }}>
                        ${row.current.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, textDecoration: "line-through", opacity: 0.6 }}>${row.was.toFixed(2)}</div>
                    </div>
                    <div>
                      {isBest && <span className="chip chip-filled" style={{ fontSize: 10 }}>Best -{p}%</span>}
                      {!isBest && <span className="chip" style={{ fontSize: 10 }}>-{p}%</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, padding: 14, border: "2px dashed var(--void)", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--accent)" }}>✦</span>
              <div style={{ flex: 1 }}>
                <div className="caps" style={{ fontSize: 11, marginBottom: 2 }}>Oracle Says</div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.4 }}>
                  Lowest price in 180 days. Last drop this steep was September.
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>The Price Scroll · 180 Days</div>
            <h3 className="display" style={{ fontSize: 44, margin: "0 0 20px", lineHeight: 0.9 }}>
              What it <em style={{ color: "var(--accent)", fontStyle: "italic" }}>has been worth</em>.
            </h3>
            <PriceChart history={history} current={currentPrice} was={wasPrice} />
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", padding: "48px 0" }}>
        <div className="container-wide">
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #333", marginBottom: 28 }}>
            {[
              { id: "reviews", label: "Reviews · 2,344" },
              { id: "friends", label: "Your Coven Says" },
              { id: "similar", label: "If Thou Liked This" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className="caps" style={{
                background: "transparent",
                color: tab === t.id ? "var(--accent)" : "var(--muted)",
                border: "0",
                borderBottom: "2px solid " + (tab === t.id ? "var(--accent)" : "transparent"),
                padding: "10px 18px 12px",
                marginBottom: -2,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontWeight: 700,
              }}>{t.label}</button>
            ))}
          </div>

          {tab === "reviews" && <Reviews film={film} />}
          {tab === "friends" && <FriendsView film={film} />}
          {tab === "similar" && <SimilarView film={film} onOpenFilm={onOpenFilm} />}
        </div>
      </section>

      {recOpen && <RecommendModal film={film} onClose={() => setRecOpen(false)} />}
    </div>
  );
}

function PriceChart({ history, current, was }) {
  const w = 680, h = 280, pad = { l: 40, r: 20, t: 20, b: 30 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const prices = history.map(p => p.price);
  const min = Math.min(...prices) * 0.9;
  const max = Math.max(...prices) * 1.05;
  const x = i => pad.l + (i / (history.length - 1)) * innerW;
  const y = v => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  const path = history.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.price)}`).join(" ");
  const areaPath = path + ` L ${x(history.length-1)} ${pad.t + innerH} L ${x(0)} ${pad.t + innerH} Z`;

  return (
    <div style={{ border: "2px solid var(--void)", padding: 16, background: "var(--bone)" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * f} y2={pad.t + innerH * f}
                  stroke="var(--void)" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.3} />
            <text x={pad.l - 6} y={pad.t + innerH * f + 4} fontSize={9} textAnchor="end"
                  fontFamily="var(--font-ui)" fontWeight={700} fill="var(--void)">
              ${(max - (max - min) * f).toFixed(2)}
            </text>
          </g>
        ))}
        <path d={areaPath} fill="var(--accent)" opacity={0.15} />
        <path d={path} stroke="var(--void)" strokeWidth={2.5} fill="none" strokeLinejoin="bevel" />
        <circle cx={x(history.length - 1)} cy={y(current)} r={7} fill="var(--accent)" stroke="var(--void)" strokeWidth={2} />
        <line x1={x(history.length - 1)} x2={x(history.length - 1)} y1={pad.t} y2={pad.t + innerH} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
        <g transform={`translate(${x(history.length-1) - 68}, ${y(current) - 30})`}>
          <rect width={64} height={22} fill="var(--void)" />
          <text x={32} y={15} textAnchor="middle" fontFamily="var(--font-display)" fontSize={15} fill="var(--accent)">NOW ${current}</text>
        </g>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const i = Math.floor((history.length - 1) * f);
          const d = new Date(history[i].t);
          const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <text key={f} x={x(i)} y={h - 10} fontSize={9} textAnchor="middle"
                  fontFamily="var(--font-ui)" fontWeight={700} fill="var(--void)" opacity={0.7}>
              {label.toUpperCase()}
            </text>
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        <span>◆ Low ${Math.min(...prices).toFixed(2)}</span>
        <span>◆ High ${Math.max(...prices).toFixed(2)}</span>
        <span>◆ Mean ${(prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2)}</span>
        <span style={{ color: "var(--accent-deep)" }}>◆ Now ${current.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Reviews({ film }) {
  const reviews = [
    { user: "moss.witch", rating: 9, body: "communal grief as a crop rotation. i've been thinking about the may queen for six years. it's still not over. dani florence pugh is doing something with her face in the final shot that i still can't explain.", likes: 344, time: "2d" },
    { user: "bloodyreel", rating: 8, body: "the kind of horror that doesn't break you but quietly replaces you, piece by piece, with someone who agrees with everything.", likes: 198, time: "3d" },
    { user: "ash.dovecote", rating: 7, body: "watched this on the longest day of the year for bragging rights. not recommended. the bragging rights are not worth it.", likes: 102, time: "1w" },
    { user: "doomslug", rating: 10, body: "everything is folk horror if you stay long enough. ari aster could film my family thanksgiving and it would play in the same theatre.", likes: 88, time: "2w" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {reviews.map((r, i) => {
        const u = USERS.find(x => x.handle === r.user);
        return (
          <article key={i} style={{
            background: "var(--void-2)",
            border: "1px solid #333",
            padding: 22,
            position: "relative",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar name={u.name} color={u.color} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>@{u.handle} · {r.time} ago</div>
              </div>
              <Stars rating={r.rating} size={14} />
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.55, margin: 0, textWrap: "pretty" }}>
              {r.body}
            </p>
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 10, color: "var(--muted)" }} className="caps">
              <span>♡ {r.likes}</span>
              <span>↳ Reply</span>
              <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✦ Recommend</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FriendsView({ film }) {
  const picks = USERS.slice(0, 4).map((u, i) => ({ user: u, rating: [9, 8, 7, 10][i], seen: true }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
      {picks.map((p, i) => (
        <div key={i} style={{ border: "1px solid #333", padding: 16, background: "var(--void-2)", textAlign: "center" }}>
          <Avatar name={p.user.name} color={p.user.color} size={56} />
          <div style={{ marginTop: 10, fontWeight: 700 }}>{p.user.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>@{p.user.handle}</div>
          <Stars rating={p.rating} size={16} />
          <div className="caps" style={{ fontSize: 10, marginTop: 10, color: "var(--accent)" }}>Seen &amp; Loved</div>
        </div>
      ))}
    </div>
  );
}

function SimilarView({ film, onOpenFilm }) {
  const others = Object.values(FILM_BY_ID).filter(f => f.id !== film.id).slice(0, 6);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16 }}>
      {others.map(f => (
        <div key={f.id} style={{ cursor: "pointer" }} onClick={() => onOpenFilm(f.id)}>
          <FilmPoster film={f} size="sm" style={{ width: "100%", height: "auto", aspectRatio: "2/3" }} />
          <div style={{ fontFamily: "var(--font-head)", fontSize: 14, marginTop: 8, lineHeight: 1.1 }}>{f.title}</div>
          <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{f.year}</div>
        </div>
      ))}
    </div>
  );
}

function RecommendModal({ film, onClose }) {
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState([]);

  const toggle = h => setSelected(s => s.includes(h) ? s.filter(x => x !== h) : [...s, h]);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(10,10,10,0.82)",
      display: "grid", placeItems: "center",
      zIndex: 100,
      padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bone)", color: "var(--void)",
        border: "3px solid var(--void)",
        boxShadow: "12px 12px 0 var(--accent)",
        width: "100%", maxWidth: 560,
        padding: "32px 32px 24px",
        position: "relative",
        transform: "rotate(-0.5deg)",
      }} className="grain-light">
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "transparent", border: "0", cursor: "pointer",
          fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1,
        }}>×</button>

        <div className="eyebrow" style={{ marginBottom: 8 }}>✦ Cast The Rune ✦</div>
        <h2 className="display" style={{ fontSize: 54, margin: "0 0 8px", lineHeight: 0.9 }}>
          Recommend<br/><em style={{ color: "var(--accent)" }}>{film.title}</em>
        </h2>
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, margin: "0 0 20px", lineHeight: 1.4 }}>
          Send this film straight to a friend's feed, with a note from your own mouth. They'll get it as a DM before nightfall.
        </p>

        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>To whom?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 18 }}>
          {USERS.slice(0, 6).map(u => {
            const active = selected.includes(u.handle);
            return (
              <button key={u.handle} onClick={() => toggle(u.handle)} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px",
                background: active ? "var(--void)" : "transparent",
                color: active ? "var(--bone)" : "var(--void)",
                border: "2px solid var(--void)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 700,
                textAlign: "left",
              }}>
                <Avatar name={u.name} color={u.color} size={20} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{u.handle}</span>
                {active && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✦</span>}
              </button>
            );
          })}
        </div>

        <div className="caps" style={{ fontSize: 11, marginBottom: 8 }}>A Whisper (optional)</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="watch this one alone, with the lights off…"
          style={{
            width: "100%", height: 80,
            border: "2px solid var(--void)",
            background: "transparent",
            padding: 10,
            fontFamily: "var(--font-serif)",
            fontSize: 14,
            resize: "none",
            marginBottom: 18,
          }} />

        <button className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }} onClick={onClose}>
          ✦ Seal &amp; Send {selected.length > 0 && `(${selected.length})`}
        </button>
      </div>
    </div>
  );
}
