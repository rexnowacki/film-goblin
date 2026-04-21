import { useState } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import PriceDrop from "../components/PriceDrop.jsx";
import Stars from "../components/Stars.jsx";
import Avatar from "../components/Avatar.jsx";
import { FILM_BY_ID, LISTS, USERS, ACTIVITY } from "../data.js";

export default function HomePage({ onNavigate, onOpenFilm }) {
  const [tab, setTab] = useState("all");

  const dealsForYou = [
    { film: FILM_BY_ID.midsommar, was: 14.99, now: 4.99 },
    { film: FILM_BY_ID.lighthouse, was: 14.99, now: 5.99 },
    { film: FILM_BY_ID.cure, was: 14.99, now: 5.99 },
    { film: FILM_BY_ID.pearl, was: 12.99, now: 4.99 },
  ];

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
              ].map((item) => (
                <a key={item.id} className="caps" onClick={() => onNavigate(item.id)} style={{
                  fontSize: 11,
                  color: item.id === "home" ? "var(--accent)" : "var(--bone)",
                  borderBottom: item.id === "home" ? "2px solid var(--accent)" : "2px solid transparent",
                  paddingBottom: 4,
                  cursor: "pointer",
                }}>{item.label}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <input placeholder="Scry the archive…" style={{
                background: "var(--void-3)",
                border: "1px solid #333",
                color: "var(--bone)",
                padding: "8px 12px 8px 32px",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                width: 240,
              }} />
              <span style={{ position: "absolute", left: 10, top: 7, opacity: 0.5 }}>✦</span>
            </div>
            <button onClick={() => onNavigate("alerts")} className="chip chip-filled" style={{ cursor: "pointer" }}>⦿ 3 Alerts</button>
            <Avatar name="You Goblin" color="var(--accent)" size={34} />
          </div>
        </div>
      </div>

      <section style={{
        background: "var(--bone)",
        color: "var(--void)",
        padding: "28px 0 36px",
        borderBottom: "3px solid var(--void)",
        position: "relative",
        overflow: "hidden",
      }} className="grain-light">
        <div className="container-wide">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div className="eyebrow" style={{ color: "var(--accent-deep)" }}>✦ The Omens Have Moved ✦</div>
            </div>
            <a className="caps" style={{ fontSize: 11, color: "var(--void)", borderBottom: "1px solid var(--void)" }}>View All Deals</a>
          </div>
          <h2 className="display" style={{ fontSize: 68, margin: "0 0 22px", lineHeight: 0.9 }}>
            Deals Tracked <em style={{ color: "var(--accent)", fontStyle: "italic" }}>For You</em>
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {dealsForYou.map((d, i) => {
              const pct = Math.round((1 - d.now / d.was) * 100);
              return (
                <div key={i} style={{
                  background: "var(--void)",
                  color: "var(--bone)",
                  border: "2px solid var(--void)",
                  padding: 14,
                  display: "grid",
                  gridTemplateColumns: "88px 1fr",
                  gap: 14,
                  position: "relative",
                }}>
                  <div style={{ cursor: "pointer" }} onClick={() => onOpenFilm(d.film.id)}>
                    <FilmPoster film={d.film} size="sm" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                    <div>
                      <div className="head" style={{ fontSize: 18, lineHeight: 1.05, marginBottom: 4, cursor: "pointer" }} onClick={() => onOpenFilm(d.film.id)}>
                        {d.film.title}
                      </div>
                      <div className="caps" style={{ fontSize: 9, color: "var(--muted)", marginBottom: 8 }}>
                        {d.film.director} · {d.film.year}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--accent)" }}>${d.now}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>${d.was}</span>
                        <span className="chip chip-filled" style={{ fontSize: 9, padding: "2px 6px" }}>-{pct}%</span>
                      </div>
                    </div>
                    <button className="btn btn-sm" style={{ fontSize: 10, padding: "6px 10px", width: "100%", justifyContent: "center" }}>
                      ✦ Recommend
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="container-wide" style={{ padding: "32px", display: "grid", gridTemplateColumns: "220px 1fr 320px", gap: 32 }}>
        <aside>
          <div style={{ marginBottom: 28 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid #2a2a2a", paddingBottom: 8 }}>Your Ledger</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {[
                { label: "Watchlist", count: 47, hot: true },
                { label: "Owned", count: 128 },
                { label: "Seen", count: 312 },
                { label: "Deals Hit", count: 18 },
                { label: "Sent To Friends", count: 34 },
              ].map(item => (
                <li key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontFamily: "var(--font-ui)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {item.hot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />}
                    {item.label}
                  </span>
                  <span className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>{item.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid #2a2a2a", paddingBottom: 8 }}>The Coven · 12</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
              {USERS.slice(0, 10).map(u => (
                <Avatar key={u.handle} name={u.name} color={u.color} size={32} />
              ))}
            </div>
            <a className="caps" style={{ fontSize: 10, color: "var(--accent)", borderBottom: "1px solid currentColor" }}>Conjure A Friend →</a>
          </div>

          <div style={{ background: "var(--accent)", color: "var(--accent-ink)", padding: 14, position: "relative" }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(var(--void) 1.2px, transparent 1.4px)",
              backgroundSize: "8px 8px",
              opacity: 0.2,
              pointerEvents: "none",
            }} />
            <div className="eyebrow" style={{ position: "relative", marginBottom: 6 }}>Alert</div>
            <div className="head" style={{ fontSize: 18, lineHeight: 1.1, position: "relative", marginBottom: 8 }}>
              3 films on your list just dropped.
            </div>
            <div className="caps" style={{ fontSize: 10, position: "relative", borderBottom: "1.5px solid currentColor", display: "inline-block" }}>
              Summon them →
            </div>
          </div>
        </aside>

        <main>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 className="display" style={{ fontSize: 42, margin: 0 }}>The Feed</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "all", label: "All" },
                { id: "reviews", label: "Reviews" },
                { id: "recs", label: "Recs" },
                { id: "lists", label: "Lists" },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} className="caps" style={{
                  background: tab === t.id ? "var(--accent)" : "transparent",
                  color: tab === t.id ? "var(--accent-ink)" : "var(--muted)",
                  border: "1px solid " + (tab === t.id ? "var(--accent)" : "#333"),
                  padding: "6px 12px",
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 700,
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 0, borderTop: "1px solid #2a2a2a" }}>
            {ACTIVITY.map((a, i) => {
              const user = USERS.find(u => u.handle === a.user);
              const film = a.film ? FILM_BY_ID[a.film] : null;
              const list = a.list ? LISTS.find(l => l.id === a.list) : null;
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr auto",
                  gap: 20,
                  padding: "22px 0",
                  borderBottom: "1px solid #2a2a2a",
                  alignItems: "start",
                }}>
                  <div style={{ cursor: film ? "pointer" : "default" }} onClick={() => film && onOpenFilm(film.id)}>
                    {film && <FilmPoster film={film} size="sm" />}
                    {list && (
                      <div style={{
                        width: 88, height: 130,
                        background: list.bg, color: list.fg || "var(--bone)",
                        border: "2px solid var(--void-3)",
                        padding: 8,
                        fontFamily: "var(--font-display)",
                        fontSize: 14,
                        lineHeight: 0.95,
                        display: "flex", alignItems: "flex-end",
                        position: "relative",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          position: "absolute", inset: 0,
                          background: `radial-gradient(${list.accent} 1.5px, transparent 1.7px)`,
                          backgroundSize: "8px 8px",
                          opacity: 0.4,
                        }} />
                        <span style={{ position: "relative" }}>{list.title}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <Avatar name={user.name} color={user.color} size={24} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</span>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>@{user.handle}</span>
                      {a.type === "review" && <span style={{ color: "var(--muted)", fontSize: 12 }}>reviewed</span>}
                      {a.type === "recommend" && <span style={{ color: "var(--muted)", fontSize: 12 }}>recommended {a.toYou ? <b style={{ color: "var(--accent)" }}>to you</b> : a.toUser ? <>to @{a.toUser}</> : ""}</span>}
                      {a.type === "watchlist" && <span style={{ color: "var(--muted)", fontSize: 12 }}>added to watchlist</span>}
                      {a.type === "list" && <span style={{ color: "var(--muted)", fontSize: 12 }}>updated the list</span>}
                      <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: "auto" }}>{a.time}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span className="head" style={{ fontSize: 22, cursor: film ? "pointer" : "default" }} onClick={() => film && onOpenFilm(film.id)}>
                        {film ? film.title : list.title}
                      </span>
                      {film && <span style={{ color: "var(--muted)", fontSize: 13 }}>{film.year}</span>}
                      {a.rating && <Stars rating={a.rating} size={14} />}
                      {a.toYou && <span className="chip chip-filled" style={{ fontSize: 9 }}>✦ For You</span>}
                    </div>

                    {a.body && (
                      <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.5, margin: "0 0 10px", maxWidth: 620 }}>
                        {a.body}
                      </p>
                    )}

                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)" }} className="caps">
                      {a.likes && <span>♡ {a.likes}</span>}
                      <span>↳ Reply</span>
                      {a.type !== "recommend" && film && <span style={{ color: "var(--accent)" }}>✦ Recommend</span>}
                    </div>
                  </div>

                  <div>
                    {film && film.prices && film.prices[0] && film.prices[0].current < film.prices[0].was && (
                      <PriceDrop
                        from={film.prices[0].was}
                        to={film.prices[0].current}
                        pct={Math.round((1 - film.prices[0].current / film.prices[0].was) * 100)}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside>
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--bone)", paddingBottom: 8, marginBottom: 14 }}>
              <div className="eyebrow">Popular Grimoires</div>
              <a className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>More</a>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {LISTS.slice(0, 3).map(list => (
                <div key={list.id} onClick={() => onNavigate("list", list.id)} style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, cursor: "pointer" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1.5px solid #2a2a2a" }}>
                    {list.films.slice(0, 4).map(fid => {
                      const f = FILM_BY_ID[fid];
                      return (
                        <div key={fid} style={{
                          aspectRatio: "2/3",
                          background: f.bg,
                          position: "relative",
                          overflow: "hidden",
                          color: f.fg,
                        }}>
                          <div style={{
                            position: "absolute", inset: 0,
                            background: `radial-gradient(${f.accent} 1px, transparent 1.2px)`,
                            backgroundSize: "5px 5px",
                            opacity: 0.4,
                          }} />
                          <div style={{
                            position: "absolute", bottom: 4, left: 4, right: 4,
                            fontFamily: "var(--font-head)",
                            fontSize: 9, lineHeight: 1,
                            color: f.fg,
                          }}>{f.title}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1.1, marginBottom: 4 }}>{list.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>
                      @{list.curator} · {list.count} films
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--bone)", paddingBottom: 8, marginBottom: 14 }}>
              <div className="eyebrow">Popular Reviewers</div>
              <a className="caps" style={{ fontSize: 10, color: "var(--muted)" }}>More</a>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {USERS.slice(0, 5).map((u) => (
                <li key={u.handle} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center" }}>
                  <Avatar name={u.name} color={u.color} size={32} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>@{u.handle} · {u.reviews} reviews</div>
                  </div>
                  <button className="caps" style={{
                    background: "transparent",
                    color: "var(--accent)",
                    border: "1px solid var(--accent)",
                    padding: "4px 8px",
                    fontSize: 9,
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontWeight: 700,
                  }}>Follow</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
