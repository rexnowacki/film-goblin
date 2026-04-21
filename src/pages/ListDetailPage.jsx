import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import Stars from "../components/Stars.jsx";
import Avatar from "../components/Avatar.jsx";
import TopNav from "../components/TopNav.jsx";
import { FILMS, FILM_BY_ID, LISTS, USERS } from "../data.js";

const ALL_LISTS = [
  ...LISTS,
  { id: "killed-me", title: "Films That Killed Me And I'm Still Mad About It", curator: "tallow.jones", count: 12, films: ["hereditary", "skinamarink", "cure"], bg: "#1a1a1a", accent: "#f5d300" },
  { id: "under-90", title: "Under 90 Minutes Of Terror", curator: "gristleburn", count: 26, films: ["saintmaud", "babadook", "itfollows"], bg: "#3a0f2e", accent: "#ff2d88" },
  { id: "color-of-blood", title: "Films Shot In The Color Of Blood", curator: "candleflesh", count: 19, films: ["suspiria", "pearl", "mandy"], bg: "#b8221c", fg: "#f5d300", accent: "#0a0a0a" },
];

export default function ListDetailPage({ listId, onNavigate, onOpenFilm }) {
  const list = ALL_LISTS.find(l => l.id === listId) || ALL_LISTS[0];
  const [subscribed, setSubscribed] = useState(false);
  const [sort, setSort] = useState("curated");
  const [showOnSaleOnly, setShowOnSaleOnly] = useState(false);

  const curator = USERS.find(u => u.handle === list.curator) || { name: list.curator, handle: list.curator, color: list.accent, reviews: 0, followers: 0 };

  const listFilms = useMemo(() => {
    const core = (list.films || []).map(id => FILM_BY_ID[id]).filter(Boolean);
    const extras = FILMS.filter(f => !list.films.includes(f.id));
    return [...core, ...extras].slice(0, Math.min(list.count, 14));
  }, [list.id]);

  const visibleFilms = useMemo(() => {
    let arr = [...listFilms];
    if (showOnSaleOnly) arr = arr.filter(f => f.prices[0] && f.prices[0].current < f.prices[0].was);
    if (sort === "price") arr.sort((a, b) => (a.prices[0]?.current || 99) - (b.prices[0]?.current || 99));
    else if (sort === "rating") arr.sort((a, b) => b.rating - a.rating);
    else if (sort === "year") arr.sort((a, b) => b.year - a.year);
    return arr;
  }, [listFilms, sort, showOnSaleOnly]);

  const onSaleCount = listFilms.filter(f => f.prices[0] && f.prices[0].current < f.prices[0].was).length;
  const meanDiscount = (() => {
    const onSale = listFilms.filter(f => f.prices[0] && f.prices[0].current < f.prices[0].was);
    if (!onSale.length) return 0;
    return Math.round(onSale.reduce((s, f) => s + (1 - f.prices[0].current / f.prices[0].was), 0) / onSale.length * 100);
  })();
  const totalIfBought = listFilms.reduce((s, f) => s + (f.prices[0]?.current || 0), 0).toFixed(2);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="lists" onNavigate={onNavigate} />

      <section style={{
        background: list.bg, color: list.fg || "var(--bone)",
        borderBottom: "3px solid var(--void)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(${list.accent} 2.4px, transparent 2.6px)`,
          backgroundSize: "16px 16px",
          opacity: 0.25,
        }} />

        <div className="container-wide" style={{
          position: "relative", padding: "56px 32px 40px",
          display: "grid", gridTemplateColumns: "440px 1fr", gap: 48, alignItems: "start",
        }}>
          <div style={{
            transform: "rotate(-2deg)",
            border: `3px solid ${list.fg || "var(--bone)"}`,
            boxShadow: `10px 10px 0 ${list.accent}`,
            background: list.bg,
            position: "relative",
          }}>
            <div style={{
              aspectRatio: "4/5", position: "relative", overflow: "hidden",
              padding: 28,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: `radial-gradient(${list.accent} 2.6px, transparent 2.8px)`,
                backgroundSize: "14px 14px",
                opacity: 0.4, pointerEvents: "none",
              }} />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                {list.official ? (
                  <span className="stamp" style={{ background: list.accent, color: list.bg, borderColor: list.accent }}>✦ Official</span>
                ) : (
                  <span className="stamp" style={{ background: "transparent", color: list.accent, borderColor: list.accent }}>Issue · {list.id.slice(0, 3).toUpperCase()}</span>
                )}
                <span className="caps" style={{ fontSize: 10, color: list.accent }}>
                  {list.count} films
                </span>
              </div>
              <div className="display" style={{
                position: "relative",
                fontSize: list.title.length > 30 ? 56 : 84,
                lineHeight: 0.88,
              }}>
                {list.title}
              </div>
            </div>
            <div style={{
              position: "absolute", top: -14, right: -36, width: 110, height: 28,
              background: list.accent, transform: "rotate(45deg)", opacity: 0.8,
            }} />
          </div>

          <div style={{ position: "relative" }}>
            <div className="eyebrow" style={{ color: list.accent, marginBottom: 10 }}>
              ✦ A Grimoire · Chapter · {list.id.slice(0, 3).toUpperCase()} ✦
            </div>
            <div className="caps" style={{ fontSize: 13, opacity: 0.8, marginBottom: 18 }}>
              Curated by
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <Avatar name={curator.name} color={curator.color} size={20} />
                <b style={{ color: list.accent }}>@{curator.handle}</b>
              </span>
            </div>

            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 22, lineHeight: 1.38, margin: "0 0 22px", maxWidth: 640 }}>
              "Films that quietly replace you, piece by piece. The soil is in their roots, the sun in their window, and the sickness is patient. Watch them in order if you can. Skip none."
            </p>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.55, margin: "0 0 26px", maxWidth: 620, opacity: 0.88 }}>
              Subscribe and we'll alert you the moment any of these films drops in price on Apple TV or iTunes — no matter the storefront, no matter the hour.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 24 }}>
              <button
                className="btn btn-lg"
                onClick={() => setSubscribed(s => !s)}
                style={{
                  background: subscribed ? "var(--void)" : "var(--accent)",
                  color: subscribed ? "var(--accent)" : "var(--accent-ink)",
                  borderColor: "var(--void)",
                }}
              >
                {subscribed ? "✦ Subscribed" : "✦ Subscribe To Alerts"}
              </button>
              <button className="btn btn-outline btn-lg" style={{ color: list.fg || "var(--bone)", borderColor: list.fg || "var(--bone)" }}>
                ↳ Share Scroll
              </button>
              <button className="btn btn-outline btn-lg" style={{ color: list.fg || "var(--bone)", borderColor: list.fg || "var(--bone)" }}>
                + Clone List
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
              border: `2px solid ${list.fg || "var(--bone)"}`,
            }}>
              <ListStat big={list.count} small="Films" fg={list.fg} accent={list.accent} />
              <ListStat big={onSaleCount} small="On Sale Now" fg={list.fg} accent={list.accent} highlight />
              <ListStat big={`-${meanDiscount}%`} small="Mean Discount" fg={list.fg} accent={list.accent} />
              <ListStat big={`$${totalIfBought}`} small="Own All For" fg={list.fg} accent={list.accent} />
            </div>

            <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14, fontSize: 12, opacity: 0.85 }}>
              <div style={{ display: "flex" }}>
                {USERS.slice(0, 5).map((u, i) => (
                  <div key={u.handle} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                    <Avatar name={u.name} color={u.color} size={28} />
                  </div>
                ))}
              </div>
              <span className="caps" style={{ fontSize: 11 }}>
                <b>1,247 subscribers</b> · 34 from your coven
              </span>
            </div>
          </div>
        </div>
      </section>

      {onSaleCount > 0 && (
        <section style={{ background: "var(--accent)", color: "var(--accent-ink)", borderBottom: "3px solid var(--void)", padding: "18px 0", position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(var(--void) 1.2px, transparent 1.4px)",
            backgroundSize: "9px 9px",
            opacity: 0.15, pointerEvents: "none",
          }} />
          <div className="container-wide" style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 48, lineHeight: 1 }}>✦</span>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>The Omens Have Moved</div>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 22, lineHeight: 1.1 }}>
                <b>{onSaleCount} of the {list.count} films</b> on this scroll are discounted right now.
              </div>
            </div>
            <button className="btn btn-dark" onClick={() => setShowOnSaleOnly(true)}>
              Show Only The Deals →
            </button>
          </div>
        </section>
      )}

      <section style={{ background: "var(--void-2)", borderBottom: "1px solid #333", position: "sticky", top: 55, zIndex: 10 }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Sort</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "curated", label: "As Curated" },
              { id: "rating", label: "Rating" },
              { id: "year", label: "Newest" },
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
            <input type="checkbox" checked={showOnSaleOnly} onChange={e => setShowOnSaleOnly(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
            <span className="caps">On sale only</span>
          </label>
          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }} className="caps">
            {visibleFilms.length} films
          </span>
        </div>
      </section>

      <div className="container-wide" style={{ padding: "36px 32px 60px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 40 }}>
        <main>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14 }}>The Films</div>
          <div style={{ display: "grid", gap: 0, borderTop: "1px solid #333" }}>
            {visibleFilms.map((f, i) => {
              const p = f.prices[0];
              const onSale = p && p.current < p.was;
              const pct = onSale ? Math.round((1 - p.current / p.was) * 100) : 0;
              return (
                <div key={f.id} onClick={() => onOpenFilm(f.id)} style={{
                  display: "grid", gridTemplateColumns: "40px 80px 1fr auto auto", gap: 20,
                  padding: "18px 0", borderBottom: "1px solid #333", alignItems: "center", cursor: "pointer",
                }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--muted-dark)", lineHeight: 1, textAlign: "center" }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <FilmPoster film={f} size="sm" style={{ width: 72, height: 108 }} />
                  <div>
                    <div className="head" style={{ fontSize: 24, lineHeight: 1, marginBottom: 4 }}>{f.title}</div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                      {f.director} · {f.year} · {f.runtime} min · {f.genres.join(", ")}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Stars rating={f.rating} size={12} />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{f.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 120 }}>
                    {onSale ? (
                      <>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--accent)", lineHeight: 1 }}>${p.current}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", textDecoration: "line-through" }}>was ${p.was}</div>
                      </>
                    ) : (
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1 }}>${p?.was || "—"}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 90, textAlign: "center" }}>
                    {onSale ? (
                      <span className="chip chip-filled" style={{ fontSize: 10 }}>-{pct}%</span>
                    ) : (
                      <span className="caps" style={{ fontSize: 9, color: "var(--muted)" }}>Full Price</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside>
          <div style={{ border: "1px solid #333", background: "var(--void-2)", padding: 20, marginBottom: 24 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>The Curator</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <Avatar name={curator.name} color={curator.color} size={52} />
              <div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 20, lineHeight: 1 }}>{curator.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>@{curator.handle}</div>
              </div>
            </div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.45, margin: "0 0 14px", color: "var(--bone)" }}>
              Keeper of seven grimoires. Watches slowly and twice. Never reviews on the first pass.
            </p>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--muted)", marginBottom: 14 }} className="caps">
              <span><b style={{ color: "var(--bone)" }}>{curator.reviews || 412}</b> reviews</span>
              <span><b style={{ color: "var(--bone)" }}>{curator.followers || 1823}</b> followers</span>
              <span><b style={{ color: "var(--bone)" }}>7</b> grimoires</span>
            </div>
            <button className="btn btn-sm btn-outline" style={{ width: "100%", justifyContent: "center", fontSize: 10 }}>
              + Follow Curator
            </button>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid #2a2a2a", paddingBottom: 6 }}>
              Notes In The Margin · 18
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {[
                { user: USERS[1], body: "the order matters. if you watch hereditary last it feels like a benediction. otherwise it's a curse.", time: "2d" },
                { user: USERS[4], body: "added #3 to my watchlist because of this and got a price alert within the week. the system works.", time: "5d" },
                { user: USERS[2], body: "missing robert eggers imo. otherwise flawless.", time: "1w" },
              ].map((c, i) => (
                <div key={i} style={{ padding: 12, background: "var(--void-2)", border: "1px solid #2a2a2a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Avatar name={c.user.name} color={c.user.color} size={22} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{c.user.name}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>{c.time}</span>
                  </div>
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.45, margin: 0 }}>{c.body}</p>
                </div>
              ))}
            </div>
            <button className="btn btn-sm btn-outline" style={{ width: "100%", justifyContent: "center", fontSize: 10, marginTop: 12 }}>
              ✦ Leave A Note
            </button>
          </div>

          <div>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12, borderBottom: "1px solid #2a2a2a", paddingBottom: 6 }}>
              Kindred Grimoires
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {ALL_LISTS.filter(l => l.id !== list.id).slice(0, 3).map(l => (
                <div key={l.id} onClick={() => onNavigate("list", l.id)} style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "68px 1fr", gap: 10, alignItems: "center" }}>
                  <div style={{
                    aspectRatio: "4/5", background: l.bg,
                    position: "relative", overflow: "hidden",
                    border: "1.5px solid var(--void-3)",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(${l.accent} 1.4px, transparent 1.6px)`, backgroundSize: "8px 8px", opacity: 0.45 }} />
                    <div style={{
                      position: "absolute", inset: 4,
                      fontFamily: "var(--font-display)", fontSize: 10, lineHeight: 0.95,
                      color: l.fg || "var(--bone)",
                      display: "flex", alignItems: "flex-end",
                    }}>
                      {l.title}
                    </div>
                  </div>
                  <div>
                    <div className="head" style={{ fontSize: 14, lineHeight: 1.1, marginBottom: 3 }}>{l.title}</div>
                    <div className="caps" style={{ fontSize: 9, color: "var(--muted)" }}>@{l.curator} · {l.count} films</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ListStat({ big, small, fg, accent, highlight }) {
  return (
    <div style={{
      padding: "14px 16px",
      borderRight: `2px solid ${fg || "var(--bone)"}`,
      background: highlight ? accent : "transparent",
      color: highlight ? "var(--void)" : (fg || "var(--bone)"),
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1 }}>{big}</div>
      <div className="caps" style={{ fontSize: 9, marginTop: 4, opacity: 0.8 }}>{small}</div>
    </div>
  );
}
