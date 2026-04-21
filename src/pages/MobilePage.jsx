import IOSFrame from "../components/IOSFrame.jsx";
import FilmPoster from "../components/FilmPoster.jsx";
import PriceDrop from "../components/PriceDrop.jsx";
import Stars from "../components/Stars.jsx";
import Avatar from "../components/Avatar.jsx";
import HalftoneBar from "../components/HalftoneBar.jsx";
import { FILM_BY_ID } from "../data.js";

function FGStatusBar({ dark = true, time = "9:41" }) {
  const c = dark ? "#f3ecd8" : "#0a0a0a";
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "19px 30px 0", height: 54,
      fontFamily: "var(--font-ui)", color: c,
      pointerEvents: "none",
    }}>
      <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: "0.02em" }}>{time}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" fill={c}/><rect x="4.5" y="4.5" width="3" height="6.5" fill={c}/><rect x="9" y="2" width="3" height="9" fill={c}/><rect x="13.5" y="0" width="3" height="11" fill={c}/></svg>
        <svg width="24" height="11" viewBox="0 0 24 11"><rect x="0.5" y="0.5" width="20" height="10" rx="2" stroke={c} fill="none" strokeOpacity="0.5"/><rect x="2" y="2" width="17" height="7" fill={c}/><rect x="21" y="3.5" width="1.5" height="4" fill={c} fillOpacity="0.5"/></svg>
      </div>
    </div>
  );
}

function FGTabBar({ active = "home" }) {
  const tabs = [
    { id: "home", label: "Feed", icon: "✦" },
    { id: "deals", label: "Deals", icon: "$" },
    { id: "search", label: "Hunt", icon: "◎" },
    { id: "alerts", label: "Howls", icon: "!" },
    { id: "me", label: "Coven", icon: "☾" },
  ];
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingBottom: 28, paddingTop: 8,
      background: "var(--void)",
      borderTop: "2px solid var(--accent)",
      display: "flex", justifyContent: "space-around", alignItems: "flex-end",
      zIndex: 30,
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          color: active === t.id ? "var(--accent)" : "var(--muted)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          padding: "4px 8px",
          fontFamily: "var(--font-ui)",
        }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function FGHeader({ title, leading, trailing, compact = false }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: "var(--void)",
      borderBottom: "2px solid var(--bone)",
      paddingTop: 54,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: compact ? "6px 16px 10px" : "10px 16px 14px",
      }}>
        <div style={{ width: 44, display: "flex", justifyContent: "flex-start" }}>{leading}</div>
        <div className="display" style={{ fontSize: compact ? 22 : 28, color: "var(--accent)", flex: 1, textAlign: "center", marginTop: 2 }}>
          {title}
        </div>
        <div style={{ width: 44, display: "flex", justifyContent: "flex-end" }}>{trailing}</div>
      </div>
    </div>
  );
}

function IconBtn({ children, style = {} }) {
  return (
    <div style={{
      width: 36, height: 36,
      border: "2px solid var(--bone)",
      background: "transparent",
      color: "var(--bone)",
      display: "grid", placeItems: "center",
      fontFamily: "var(--font-ui)", fontWeight: 900,
      fontSize: 14,
      ...style,
    }}>{children}</div>
  );
}

function HomeIndicator() {
  return (
    <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 31 }}>
      <div style={{ width: 134, height: 5, borderRadius: 3, background: "rgba(243,236,216,0.6)" }}/>
    </div>
  );
}

function MobileLockscreen() {
  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative", overflow: "hidden",
      background: "radial-gradient(ellipse 70% 50% at 50% 20%, #2a0808 0%, #0a0a0a 60%)",
      fontFamily: "var(--font-ui)",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(#b8221c 1.4px, transparent 1.6px)",
        backgroundSize: "14px 14px",
        opacity: 0.18,
        mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        mixBlendMode: "multiply",
        opacity: 0.6,
      }} />

      <FGStatusBar dark />

      <div style={{
        position: "absolute", top: 80, left: 0, right: 0,
        textAlign: "center", color: "var(--bone)",
      }}>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.75 }}>
          Friday · April 18
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 96, lineHeight: 0.9, marginTop: 4, color: "var(--bone)" }}>
          11:47
        </div>
      </div>

      <div style={{ position: "absolute", top: 280, left: 12, right: 12 }}>
        <div style={{
          background: "rgba(20,20,20,0.72)",
          backdropFilter: "blur(18px) saturate(180%)",
          WebkitBackdropFilter: "blur(18px) saturate(180%)",
          border: "2px solid var(--accent)",
          boxShadow: "4px 4px 0 var(--accent)",
          color: "var(--bone)",
          padding: "14px 14px 16px",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 22, height: 22,
              background: "var(--accent)",
              display: "grid", placeItems: "center",
              color: "var(--void)",
              fontFamily: "var(--font-display)",
              fontSize: 16, lineHeight: 1,
              border: "1.5px solid var(--void)",
            }}>F</div>
            <div style={{ flex: 1, fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase" }}>
              Film Goblin
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>now</div>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 0.95, marginBottom: 6 }}>
            Prey Sighted.
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.35, color: "var(--bone)" }}>
            <strong style={{ fontStyle: "normal", fontFamily: "var(--font-ui)", fontWeight: 900 }}>Midsommar</strong>{" "}
            just dropped to <span style={{ background: "var(--yellow)", color: "var(--void)", padding: "0 6px", fontStyle: "normal", fontFamily: "var(--font-display)", fontSize: 17 }}>$4.99</span> on Apple TV. Cheapest it's been in 180 nights. Your threshold: $6.
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="90" height="28" viewBox="0 0 90 28" style={{ flexShrink: 0 }}>
              <polyline points="0,6 8,8 16,7 24,10 32,9 40,12 48,10 56,14 64,13 72,16 80,22 90,24" fill="none" stroke="var(--bone)" strokeWidth="1.5" opacity="0.6" />
              <circle cx="90" cy="24" r="3" fill="var(--accent)" stroke="var(--void)" strokeWidth="1.5"/>
            </svg>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.7, letterSpacing: "0.08em" }}>
              $14.99 → $4.99<br/>
              <span style={{ color: "var(--accent)" }}>▼ 66% off</span>
            </div>
          </div>
          <div style={{
            position: "absolute", right: 10, bottom: -6,
            fontSize: 9, fontFamily: "var(--font-ui)", fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--accent)", opacity: 0.8,
            background: "var(--void)", padding: "1px 6px",
            border: "1.5px solid var(--accent)",
          }}>
            swipe to claim
          </div>
        </div>

        <div style={{
          marginTop: 6,
          background: "rgba(20,20,20,0.5)",
          backdropFilter: "blur(18px)",
          border: "1.5px solid var(--muted-dark)",
          color: "var(--bone)",
          padding: "8px 14px 10px",
          transform: "scale(0.96)",
          opacity: 0.85,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.7 }}>
            <div style={{ width: 16, height: 16, background: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 12, color: "var(--void)" }}>F</div>
            Film Goblin · 2h ago
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 4 }}>
            <strong style={{ fontStyle: "normal", fontFamily: "var(--font-ui)", fontWeight: 900 }}>moss.witch</strong> sent you <strong style={{ fontStyle: "normal", fontFamily: "var(--font-ui)", fontWeight: 900 }}>Saint Maud</strong>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 40, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", padding: "0 34px",
      }}>
        {["☼", "◉"].map((g, i) => (
          <div key={i} style={{
            width: 48, height: 48, borderRadius: 24,
            background: "rgba(20,20,20,0.55)",
            backdropFilter: "blur(14px)",
            display: "grid", placeItems: "center",
            color: "var(--bone)", fontSize: 20,
          }}>{g}</div>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: "rgba(243,236,216,0.7)" }}/>
      </div>
    </div>
  );
}

function MobileLanding() {
  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden",
      background: "var(--void)", position: "relative",
      fontFamily: "var(--font-ui)", color: "var(--bone)",
    }}>
      <FGStatusBar dark />
      <div style={{ paddingTop: 54, height: "100%", overflowY: "auto", paddingBottom: 80 }}>
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>Est. 2024 · Nocturnal</div>
          <div className="stamp" style={{ fontSize: 9, color: "var(--accent)", borderColor: "var(--accent)", padding: "2px 6px" }}>Zine v.VII</div>
        </div>

        <div style={{ padding: "24px 16px 12px" }}>
          <div className="display" style={{ fontSize: 92, lineHeight: 0.86, color: "var(--bone)" }}>
            Film<br/><span style={{ color: "var(--accent)" }}>Goblin</span>
          </div>
          <div style={{
            marginTop: 14, fontFamily: "var(--font-serif)", fontStyle: "italic",
            fontSize: 17, lineHeight: 1.35, color: "var(--bone-2)",
            borderLeft: "3px solid var(--accent)", paddingLeft: 12,
          }}>
            A field guide to cheap movies.<br/>
            We hunt discounts on the films worth owning — so you can stop renting and start collecting.
          </div>
        </div>

        <div style={{ padding: "16px 16px 8px" }}>
          <HalftoneBar color="var(--accent)" height={14}/>
        </div>

        <div style={{
          background: "var(--bone)", color: "var(--void)",
          borderTop: "2px solid var(--accent)", borderBottom: "2px solid var(--accent)",
          padding: "8px 0", overflow: "hidden", position: "relative",
        }}>
          <div className="marquee" style={{ gap: 20, fontFamily: "var(--font-display)", fontSize: 18, whiteSpace: "nowrap" }}>
            {[...Array(2)].flatMap((_, j) => ["MIDSOMMAR $4.99","✦","HEREDITARY $3.99","✦","SKINAMARINK $2.99","✦","THE VVITCH $4.99","✦","MANDY $4.99","✦"].map((t, i) => (
              <span key={`${j}-${i}`} style={{ flexShrink: 0 }}>{t}</span>
            )))}
          </div>
        </div>

        <div style={{ padding: "20px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn btn-lg" style={{ width: "100%", justifyContent: "center" }}>Join The Coven ✦</button>
          <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }}>Skulk As Guest</button>
        </div>

        <div style={{ padding: "28px 16px 8px" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>The Ritual · 3 Steps</div>
          {[
            { n: "01", t: "Mark the films", b: "Build a watchlist of what's worth owning. No streaming rentals." },
            { n: "02", t: "Set your threshold", b: "Under $5? Under $3? We wait in the dark and watch." },
            { n: "03", t: "We howl when it drops", b: "A push notification, not a newsletter. Claim and vanish." },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: i < 2 ? "1.5px dashed var(--muted-dark)" : "none" }}>
              <div className="display" style={{ fontSize: 44, color: "var(--accent)", width: 60, flexShrink: 0, lineHeight: 0.9 }}>{s.n}</div>
              <div>
                <div style={{ fontFamily: "var(--font-ui)", fontWeight: 900, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.t}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--bone-2)", lineHeight: 1.35 }}>{s.b}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "20px 0 8px" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10, padding: "0 16px" }}>Tonight's Grimoire</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
            {["midsommar", "hereditary", "witch", "saintmaud", "mandy"].map(id => (
              <div key={id} style={{ position: "relative" }}>
                <FilmPoster film={FILM_BY_ID[id]} size="sm"/>
                <div style={{ position: "absolute", top: -6, right: -6, transform: "scale(0.7)", transformOrigin: "top right" }}>
                  <PriceDrop from={FILM_BY_ID[id].prices[0].was} to={FILM_BY_ID[id].prices[0].current} pct={Math.round(100 - FILM_BY_ID[id].prices[0].current / FILM_BY_ID[id].prices[0].was * 100)} size="sm"/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 16px 60px" }}>
          <div style={{ borderTop: "2px solid var(--bone)", paddingTop: 12, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, opacity: 0.6, lineHeight: 1.5 }}>
            Bound in the dark of the moon.<br/>
            No ads. No data broker pacts.<br/>
            We track only the films. You are not the prey.
          </div>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

function MobileHome() {
  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden",
      background: "var(--void)", position: "relative",
      fontFamily: "var(--font-ui)", color: "var(--bone)",
    }}>
      <FGStatusBar dark />
      <FGHeader title="Film Goblin" leading={<Avatar name="Moss Witch" size={32}/>} trailing={<IconBtn>✦</IconBtn>} />
      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 110 }}>
        <div style={{ padding: "16px 16px 0" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>✦ Deal of the Night</div>
          <div style={{ border: "2px solid var(--bone)", background: "var(--void-2)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 12, padding: 12 }}>
              <FilmPoster film={FILM_BY_ID.midsommar} size="sm"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 9 }}>tracked by you · 14 days</div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 26, lineHeight: 1, marginTop: 4 }}>Midsommar</div>
                <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4 }}>Ari Aster · 2019</div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <PriceDrop from={14.99} to={4.99} pct={66} size="sm"/>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>was $14.99<br/>at Apple TV</div>
                </div>
              </div>
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center", borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
              Claim it → Apple TV
            </button>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ padding: "0 16px", display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="head" style={{ fontSize: 20, color: "var(--bone)" }}>
              Watchlist · <span style={{ color: "var(--accent)" }}>on sale</span>
            </div>
            <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 9 }}>7 of 41</div>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
            {["hereditary", "skinamarink", "witch", "lighthouse", "cure", "mandy"].map(id => {
              const f = FILM_BY_ID[id];
              const pct = Math.round(100 - f.prices[0].current / f.prices[0].was * 100);
              return (
                <div key={id} style={{ width: 100, flexShrink: 0 }}>
                  <div style={{ position: "relative" }}>
                    <FilmPoster film={f} size="sm"/>
                    <div style={{
                      position: "absolute", top: -4, right: -4,
                      background: "var(--yellow)", color: "var(--void)",
                      border: "2px solid var(--void)",
                      padding: "2px 6px",
                      fontFamily: "var(--font-display)", fontSize: 14,
                      transform: "rotate(4deg)",
                      boxShadow: "2px 2px 0 var(--void)",
                    }}>-{pct}%</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    ${f.prices[0].current} · was ${f.prices[0].was}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 28, padding: "0 16px" }}>
          <div className="head" style={{ fontSize: 20, marginBottom: 12 }}>
            The Coven · <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 22 }}>howling</span>
          </div>

          <div style={{ border: "2px solid var(--accent)", background: "var(--void-2)", padding: 12, marginBottom: 12, position: "relative" }}>
            <div style={{ position: "absolute", top: -10, left: 10, background: "var(--accent)", color: "var(--accent-ink)", padding: "2px 8px", fontFamily: "var(--font-ui)", fontWeight: 900, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              For You ✦
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <FilmPoster film={FILM_BY_ID.saintmaud} size="xs"/>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Avatar name="Doom Slug" size={20}/>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>doomslug</span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>sent 4h ago</span>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.35 }}>
                  "this one's for you. sent it during an eclipse on purpose."
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" style={{ padding: "4px 10px", fontSize: 9 }}>Track It</button>
                  <button className="btn btn-sm btn-outline" style={{ padding: "4px 10px", fontSize: 9 }}>Dismiss</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderBottom: "1.5px dashed var(--muted-dark)", paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Avatar name="Moss Witch" size={26}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}><span style={{ color: "var(--accent)" }}>moss.witch</span> reviewed</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>2h ago · ★★★★★</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <FilmPoster film={FILM_BY_ID.midsommar} size="xs"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 18, lineHeight: 1, marginBottom: 4 }}>Midsommar</div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, lineHeight: 1.35, color: "var(--bone-2)" }}>
                  "communal grief as a crop rotation. i've been thinking about the may queen for six years."
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderBottom: "1.5px dashed var(--muted-dark)", paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <FilmPoster film={FILM_BY_ID.hereditary} size="xs"/>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ color: "var(--accent)", fontSize: 9 }}>Price Drop</div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 18, lineHeight: 1, margin: "2px 0 4px" }}>Hereditary</div>
                <div style={{ fontSize: 11, color: "var(--bone-2)", fontFamily: "var(--font-mono)" }}>
                  <span style={{ textDecoration: "line-through", opacity: 0.5 }}>$12.99</span>{" → "}
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>$3.99</span> at Apple TV
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>14 members of your coven also track this</div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Avatar name="Moss Witch" size={26}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>moss.witch</span> conjured a list
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--bone)", lineHeight: 1, marginTop: 4 }}>Folk Terror</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>23 films · 12h</div>
            </div>
          </div>
        </div>
      </div>

      <FGTabBar active="home"/>
      <HomeIndicator />
    </div>
  );
}

function MobileFilmDetail() {
  const f = FILM_BY_ID.midsommar;
  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden",
      background: "var(--void)", position: "relative",
      fontFamily: "var(--font-ui)", color: "var(--bone)",
    }}>
      <FGStatusBar dark />
      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 100 }}>
        <div style={{ position: "relative", height: 440, overflow: "hidden", background: f.bg }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `radial-gradient(${f.accent} 1.6px, transparent 1.8px)`,
            backgroundSize: "10px 10px", opacity: 0.28, mixBlendMode: "screen",
          }}/>
          <div style={{
            position: "absolute", left: "12%", top: "12%", width: "76%", height: "46%",
            background: f.accent, clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
          }}/>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
            mixBlendMode: "multiply", opacity: 0.55,
          }}/>

          <div style={{ position: "absolute", top: 60, left: 12, right: 12, display: "flex", justifyContent: "space-between", zIndex: 5 }}>
            <IconBtn style={{ background: "var(--void)" }}>←</IconBtn>
            <div style={{ display: "flex", gap: 6 }}>
              <IconBtn style={{ background: "var(--void)" }}>☆</IconBtn>
              <IconBtn style={{ background: "var(--void)" }}>⋯</IconBtn>
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 180, background: "linear-gradient(to bottom, transparent, var(--void))" }}/>

          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
            <div className="display" style={{ fontSize: 64, lineHeight: 0.88, color: "var(--bone)", textTransform: "uppercase" }}>
              Mid<br/>Sommar
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              <span>2019</span>
              <span style={{ opacity: 0.4 }}>✦</span>
              <span>Ari Aster</span>
              <span style={{ opacity: 0.4 }}>✦</span>
              <span>147m</span>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--bone)", color: "var(--void)", borderTop: "2px solid var(--accent)", borderBottom: "2px solid var(--accent)", padding: "16px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--pink-deep)" }}>Cheapest Storefront</div>
              <div className="display" style={{ fontSize: 52, lineHeight: 0.9, color: "var(--void)", marginTop: 4 }}>$4.99</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 4 }}>
                was $14.99 · <span style={{ color: "var(--pink-deep)", fontWeight: 700 }}>▼ 66% off</span>
              </div>
            </div>
            <div className="stamp" style={{ color: "var(--pink-deep)", borderColor: "var(--pink-deep)", fontSize: 10 }}>All-time low</div>
          </div>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Buy on Apple TV →</button>
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6, textAlign: "center" }}>
            Also on iTunes · $4.99 · Amazon · $5.99
          </div>
        </div>

        <div style={{ padding: "20px 16px 10px" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 8 }}>Price History · 180 days</div>
          <div style={{ background: "var(--void-2)", border: "1.5px solid var(--muted-dark)", padding: 12 }}>
            <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none">
              <line x1="0" y1="20" x2="300" y2="20" stroke="var(--muted-dark)" strokeDasharray="2 4" strokeWidth="0.8"/>
              <line x1="0" y1="50" x2="300" y2="50" stroke="var(--muted-dark)" strokeDasharray="2 4" strokeWidth="0.8"/>
              <polyline points="0,20 20,22 40,18 60,24 80,20 100,26 120,24 140,30 160,28 180,34 200,40 220,44 240,48 260,52 270,68 280,72 290,72 300,72" fill="none" stroke="var(--accent)" strokeWidth="2"/>
              <polyline points="0,20 20,22 40,18 60,24 80,20 100,26 120,24 140,30 160,28 180,34 200,40 220,44 240,48 260,52 270,68 280,72 290,72 300,72 300,80 0,80" fill="var(--accent)" fillOpacity="0.15"/>
              <circle cx="300" cy="72" r="4" fill="var(--yellow)" stroke="var(--void)" strokeWidth="1.5"/>
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              <span>Oct '25 · $14.99</span>
              <span style={{ color: "var(--accent)" }}>today · $4.99</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 16px" }}>
          <div style={{ border: "2px solid var(--accent)", padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)" }}>!</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>You tracked this</div>
              <div style={{ fontSize: 12, color: "var(--bone-2)", fontFamily: "var(--font-serif)", fontStyle: "italic", marginTop: 2 }}>
                Howl when it drops below $6 · 14 days watched
              </div>
            </div>
            <div style={{ background: "transparent", border: "1.5px solid var(--bone)", color: "var(--bone)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "4px 8px" }}>
              Edit
            </div>
          </div>
        </div>

        <div style={{ padding: "16px" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>The Gospel</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.5, color: "var(--bone-2)" }}>{f.overview}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {f.genres.map(g => (<span key={g} className="chip" style={{ color: "var(--bone)" }}>{g}</span>))}
          </div>
        </div>

        <div style={{ padding: "10px 16px" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>From the Coven</div>
          {[
            { user: "moss.witch", rating: 9, body: "communal grief as a crop rotation." },
            { user: "ash.dovecote", rating: 8, body: "the sun was the antagonist. i will never look at daylight again." },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: i === 0 ? "1.5px dashed var(--muted-dark)" : "none" }}>
              <Avatar name={r.user} size={28}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{r.user}</span>
                  <Stars rating={r.rating}/>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>
                  "{r.body}"
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "var(--void)", borderTop: "2px solid var(--accent)",
        padding: "10px 12px 28px", display: "flex", gap: 8, zIndex: 30,
      }}>
        <button className="btn btn-outline" style={{ padding: "10px 12px", fontSize: 11, flexShrink: 0 }}>+ List</button>
        <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 12 }}>✦ Recommend</button>
      </div>
      <HomeIndicator />
    </div>
  );
}

function MobileAlerts() {
  const alerts = [
    { type: "drop", film: "midsommar", unread: true, time: "now", headline: "Midsommar · $4.99", body: "All-time low. Your threshold $6.", store: "Apple TV" },
    { type: "recommend", film: "saintmaud", unread: true, time: "4h", user: "doomslug", headline: "doomslug sent Saint Maud", body: "\"this one's for you. sent during an eclipse on purpose.\"" },
    { type: "ending", film: "hereditary", unread: true, time: "Today", headline: "Sale ends tonight", body: "Hereditary drops back to $12.99 at midnight.", store: "Apple TV", countdown: "7h 22m" },
    { type: "restock", film: "cure", unread: false, time: "Yesterday", headline: "Cure is back", body: "After 43 days out of print. $5.99.", store: "iTunes" },
    { type: "review", film: "witch", unread: false, time: "2d", user: "moss.witch", headline: "moss.witch reviewed The VVitch", body: "\"the billy goat was always the protagonist. i accept this now.\"", rating: 9 },
    { type: "milestone", unread: false, time: "3d", headline: "You saved $127 this month", body: "Across 9 claimed deals. A lean harvest." },
  ];
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <FGHeader title="Howls" leading={<IconBtn>←</IconBtn>} trailing={
        <div style={{ color: "var(--bone)", fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: 4 }}>Hush all</div>
      }/>

      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 110 }}>
        <div style={{ display: "flex", gap: 6, padding: "12px 16px", overflowX: "auto", scrollbarWidth: "none", borderBottom: "1.5px solid var(--muted-dark)" }}>
          {[
            { id: "all", label: "All", count: 12, active: true },
            { id: "drops", label: "Price Drops", count: 4 },
            { id: "recs", label: "Recs", count: 3 },
            { id: "coven", label: "Coven", count: 5 },
          ].map(p => (
            <div key={p.id} style={{
              background: p.active ? "var(--accent)" : "transparent",
              color: p.active ? "var(--accent-ink)" : "var(--bone)",
              border: "1.5px solid " + (p.active ? "var(--accent)" : "var(--muted-dark)"),
              padding: "5px 10px", fontFamily: "var(--font-ui)", fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, whiteSpace: "nowrap",
            }}>
              {p.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{p.count}</span>
            </div>
          ))}
        </div>

        {alerts.map((a, i) => {
          const film = a.film ? FILM_BY_ID[a.film] : null;
          return (
            <div key={i} style={{
              padding: "14px 16px", borderBottom: "1.5px solid var(--void-3)",
              display: "flex", gap: 12, position: "relative",
              background: a.unread ? "var(--void-2)" : "transparent",
            }}>
              {a.unread && <div style={{ position: "absolute", left: 4, top: 22, width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }}/>}
              {film ? (
                <FilmPoster film={film} size="xs"/>
              ) : (
                <div style={{
                  width: 54, height: 80, background: "var(--yellow)", color: "var(--void)",
                  border: "2px solid var(--void)", boxShadow: "3px 3px 0 var(--void)",
                  display: "grid", placeItems: "center",
                  fontFamily: "var(--font-display)", fontSize: 36, lineHeight: 1, flexShrink: 0,
                }}>$</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <div className="eyebrow" style={{
                    color: a.type === "drop" ? "var(--accent)" : a.type === "ending" ? "var(--blood)" : a.type === "restock" ? "var(--yellow)" : a.type === "milestone" ? "var(--yellow)" : "var(--muted)",
                    fontSize: 9,
                  }}>
                    {a.type === "drop" && "✦ Price Drop"}
                    {a.type === "recommend" && "☽ Recommend"}
                    {a.type === "ending" && "⌛ Sale Ending"}
                    {a.type === "restock" && "↻ Restock"}
                    {a.type === "review" && "✎ Review"}
                    {a.type === "milestone" && "✧ Milestone"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>{a.time}</div>
                </div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 16, lineHeight: 1.1, marginTop: 4, color: "var(--bone)" }}>{a.headline}</div>
                <div style={{
                  fontFamily: a.body.startsWith("\"") ? "var(--font-serif)" : "var(--font-ui)",
                  fontStyle: a.body.startsWith("\"") ? "italic" : "normal",
                  fontSize: 12, lineHeight: 1.35, color: "var(--bone-2)", marginTop: 4,
                }}>{a.body}</div>
                {a.countdown && (
                  <div style={{ display: "inline-block", marginTop: 8, background: "var(--blood)", color: "var(--bone)", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 10, padding: "2px 6px", letterSpacing: "0.1em" }}>
                    {a.countdown} left
                  </div>
                )}
                {a.rating && <div style={{ marginTop: 6 }}><Stars rating={a.rating} size={12}/></div>}
                {a.store && <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>at {a.store}</div>}
              </div>
            </div>
          );
        })}

        <div style={{ padding: "24px 16px", textAlign: "center", fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", fontSize: 12 }}>
          ✦ ✦ ✦<br/>No older howls. The forest is quiet.
        </div>
      </div>
      <FGTabBar active="alerts"/>
      <HomeIndicator />
    </div>
  );
}

function MobileOnboarding() {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <div style={{ position: "absolute", top: 54, left: 0, right: 0, padding: "12px 16px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ color: "var(--bone)", fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 10 }}>← Back</div>
          <div className="eyebrow" style={{ color: "var(--muted)" }}>Step 3 of 4</div>
          <div style={{ color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 10 }}>Skip</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[1,2,3,4].map(n => (<div key={n} style={{ flex: 1, height: 3, background: n <= 3 ? "var(--accent)" : "var(--void-3)" }}/>))}
        </div>
      </div>

      <div style={{ position: "absolute", top: 120, left: 0, right: 0, bottom: 120, overflowY: "auto", padding: "8px 20px 0" }}>
        <div style={{ marginBottom: 6 }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>The Threshold</div>
        </div>
        <div className="display" style={{ fontSize: 56, lineHeight: 0.9, color: "var(--bone)", marginBottom: 10 }}>
          How cheap<br/>is <span style={{ color: "var(--accent)" }}>cheap</span>?
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.4, color: "var(--bone-2)", marginBottom: 24 }}>
          We'll only howl when a film you track drops below this price. Stingy is a virtue.
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--muted)" }}>$</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 140, color: "var(--accent)", lineHeight: 0.85 }}>5</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 48, color: "var(--accent)" }}>.00</span>
          </div>
        </div>
        <div style={{ padding: "0 4px" }}>
          <div style={{ position: "relative", height: 40 }}>
            <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 12, display: "flex", justifyContent: "space-between" }}>
              {[0,1,2,3,4,5,6,7,8].map(i => (<div key={i} style={{ width: 2, height: i === 5 ? 12 : 6, background: i <= 5 ? "var(--accent)" : "var(--muted-dark)" }}/>))}
            </div>
            <div style={{ position: "absolute", top: 20, left: 0, right: 0, height: 2, background: "var(--muted-dark)" }}/>
            <div style={{ position: "absolute", top: 20, left: 0, width: "56%", height: 2, background: "var(--accent)" }}/>
            <div style={{
              position: "absolute", top: 10, left: "calc(56% - 12px)",
              width: 24, height: 24, background: "var(--accent)",
              border: "2.5px solid var(--void)",
              boxShadow: "0 0 0 2px var(--accent), 3px 3px 0 var(--void)",
              transform: "rotate(45deg)",
            }}/>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
            <span>FREE</span>
            <span style={{ color: "var(--accent)" }}>$5</span>
            <span>$10</span>
          </div>
        </div>
        <div style={{ marginTop: 22, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { label: "Under $3", active: false, sub: "Parsimonious" },
            { label: "Under $5", active: true, sub: "Stingy" },
            { label: "Under $8", active: false, sub: "Generous" },
          ].map(p => (
            <div key={p.label} style={{
              border: "2px solid " + (p.active ? "var(--accent)" : "var(--muted-dark)"),
              background: p.active ? "var(--accent)" : "transparent",
              color: p.active ? "var(--accent-ink)" : "var(--bone)",
              padding: "6px 10px", textAlign: "center",
              boxShadow: p.active ? "3px 3px 0 var(--void)" : "none",
            }}>
              <div style={{ fontFamily: "var(--font-ui)", fontWeight: 900, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{p.label}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 10, marginTop: 1 }}>{p.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24, background: "var(--void-2)", border: "1.5px dashed var(--muted-dark)", padding: 12 }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 8 }}>At this threshold, tonight</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.5, color: "var(--bone-2)" }}>
            <strong style={{ fontFamily: "var(--font-ui)", fontWeight: 900, color: "var(--accent)" }}>14 films</strong> on your watchlist are under $5. We'd be howling at you tonight.
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {["midsommar", "skinamarink", "hereditary", "saintmaud", "mandy"].map(id => (
              <FilmPoster key={id} film={FILM_BY_ID[id]} size="xs" style={{ width: 38, height: 56 }}/>
            ))}
            <div style={{ width: 38, height: 56, border: "1.5px dashed var(--muted-dark)", display: "grid", placeItems: "center", fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>+9</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--void)", padding: "12px 16px 28px", borderTop: "2px solid var(--accent)", zIndex: 20 }}>
        <button className="btn btn-lg" style={{ width: "100%", justifyContent: "center" }}>Consecrate & Continue →</button>
      </div>
      <HomeIndicator />
    </div>
  );
}

function MobileHunt() {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--void)", borderBottom: "2px solid var(--bone)", paddingTop: 54 }}>
        <div style={{ padding: "10px 16px 12px" }}>
          <div className="display" style={{ fontSize: 26, color: "var(--accent)", marginBottom: 10 }}>Hunt</div>
          <div style={{ position: "relative", border: "2px solid var(--bone)", background: "var(--void-2)", display: "flex", alignItems: "center", padding: "10px 12px", gap: 10, boxShadow: "3px 3px 0 var(--accent)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)" }}>◎</span>
            <input defaultValue="egger" style={{ background: "transparent", border: "none", color: "var(--bone)", fontFamily: "var(--font-ui)", fontSize: 15, outline: "none", flex: 1, caretColor: "var(--accent)" }}/>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>✕</span>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--muted)", marginTop: 6, letterSpacing: "0.02em" }}>
            Titles · directors · curators · grimoires
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: "1.5px solid var(--muted-dark)" }}>
          {[
            { id: "films", label: "Films", count: 7, active: true },
            { id: "lists", label: "Grimoires", count: 2 },
            { id: "people", label: "Coven", count: 1 },
          ].map(t => (
            <div key={t.id} style={{
              flex: 1, color: t.active ? "var(--accent)" : "var(--muted)",
              borderBottom: "2px solid " + (t.active ? "var(--accent)" : "transparent"),
              padding: "10px 0", fontFamily: "var(--font-ui)", fontWeight: 700,
              fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center",
            }}>
              {t.label} <span style={{ opacity: 0.6 }}>{t.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 100 }}>
        <div style={{ padding: "16px 16px 8px" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 8 }}>Director match</div>
          <div style={{ display: "flex", gap: 12, padding: 12, border: "2px solid var(--accent)", background: "var(--void-2)", alignItems: "center" }}>
            <div style={{ width: 54, height: 54, background: "var(--yellow)", border: "2px solid var(--void)", boxShadow: "3px 3px 0 var(--void)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 32, color: "var(--void)", lineHeight: 1, flexShrink: 0 }}>RE</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 20, lineHeight: 1 }}>Robert Eggers</div>
              <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--bone-2)", marginTop: 2 }}>4 films · 2 on sale tonight</div>
            </div>
            <div style={{ background: "transparent", border: "1.5px solid var(--bone)", color: "var(--bone)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "4px 8px" }}>Follow</div>
          </div>
        </div>

        <div style={{ padding: "14px 16px 0" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>Films · 7 results</div>
          {[
            { id: "witch", match: "directed by Robert Eggers", deal: true },
            { id: "lighthouse", match: "directed by Robert Eggers", deal: true },
            { id: "hereditary", match: "similar: folk dread", deal: false },
            { id: "saintmaud", match: "similar: Rose Glass", deal: false },
          ].map(r => {
            const f = FILM_BY_ID[r.id];
            return (
              <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1.5px solid var(--void-3)" }}>
                <FilmPoster film={f} size="xs"/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-head)", fontSize: 16, lineHeight: 1.1 }}>{f.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>{f.director} · {f.year}</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--bone-2)", marginTop: 4 }}>{r.match}</div>
                  {r.deal && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ background: "var(--yellow)", color: "var(--void)", padding: "2px 6px", fontFamily: "var(--font-display)", fontSize: 14, border: "1.5px solid var(--void)", boxShadow: "2px 2px 0 var(--void)" }}>${f.prices[0].current} now</span>
                    </div>
                  )}
                </div>
                <div style={{ alignSelf: "flex-start", color: "var(--muted)", fontSize: 18 }}>+</div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "20px 16px 10px" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>Recent hunts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["folk horror", "j-horror 1990s", "giallo", "a24", "bergman", "the criterion"].map(q => (
              <div key={q} style={{ border: "1.5px solid var(--muted-dark)", color: "var(--bone)", padding: "5px 10px", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12 }}>{q}</div>
            ))}
          </div>
        </div>
      </div>
      <FGTabBar active="search"/>
      <HomeIndicator />
    </div>
  );
}

function MobileDeals() {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <FGHeader title="Deals" leading={<IconBtn>☰</IconBtn>} trailing={<IconBtn>⇅</IconBtn>} />
      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 110 }}>
        <div style={{ background: "var(--yellow)", color: "var(--void)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--void)" }}>
          <div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" }}>Tonight's take</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 0.95, marginTop: 2 }}>47 live drops</div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textAlign: "right", lineHeight: 1.2 }}>
            across 4 storefronts<br/><span style={{ fontWeight: 700 }}>updated 2m ago</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 16px", overflowX: "auto", scrollbarWidth: "none", borderBottom: "1.5px solid var(--muted-dark)", background: "var(--void)" }}>
          {[
            { label: "All Time Low", active: true },
            { label: "Under $5" },
            { label: "Watchlist" },
            { label: "Horror" },
            { label: "Ending Soon" },
            { label: "Apple TV" },
          ].map(p => (
            <div key={p.label} style={{
              background: p.active ? "var(--accent)" : "transparent",
              color: p.active ? "var(--accent-ink)" : "var(--bone)",
              border: "1.5px solid " + (p.active ? "var(--accent)" : "var(--muted-dark)"),
              padding: "5px 10px", fontFamily: "var(--font-ui)", fontWeight: 700,
              fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
              whiteSpace: "nowrap", boxShadow: p.active ? "2px 2px 0 var(--void)" : "none",
            }}>{p.label}</div>
          ))}
        </div>

        <div style={{ padding: "14px 16px 0" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>✦ Biggest drop tonight</div>
          <div style={{ border: "2px solid var(--accent)", background: "var(--void-2)", padding: 14, position: "relative", boxShadow: "4px 4px 0 var(--accent)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <FilmPoster film={FILM_BY_ID.hereditary} size="sm"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 22, lineHeight: 1 }}>Hereditary</div>
                <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>Ari Aster · 127m</div>
                <div style={{ marginTop: 10 }}>
                  <PriceDrop from={12.99} to={3.99} pct={69} size="sm"/>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: "var(--bone-2)", fontFamily: "var(--font-mono)" }}>
                  ▼ lowest in 140 days<br/>at Apple TV, iTunes
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 16px 0" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>All drops · sorted by % off</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {["midsommar", "skinamarink", "witch", "lighthouse", "mandy", "saintmaud", "greenknight", "cure"].map(id => {
              const f = FILM_BY_ID[id];
              const pct = Math.round(100 - f.prices[0].current / f.prices[0].was * 100);
              return (
                <div key={id} style={{ position: "relative" }}>
                  <div style={{ position: "relative" }}>
                    <FilmPoster film={f} size="sm" style={{ width: "100%", height: 230 }}/>
                    <div style={{
                      position: "absolute", top: -6, right: -6,
                      background: "var(--yellow)", color: "var(--void)",
                      border: "2px solid var(--void)", padding: "2px 6px",
                      fontFamily: "var(--font-display)", fontSize: 16,
                      transform: "rotate(4deg)", boxShadow: "2px 2px 0 var(--void)",
                    }}>-{pct}%</div>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                      ${f.prices[0].current}
                      <span style={{ color: "var(--muted)", fontWeight: 400, textDecoration: "line-through", marginLeft: 4 }}>${f.prices[0].was}</span>
                    </div>
                    <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", marginTop: 2 }}>
                      {id === "skinamarink" ? "ends in 4h" : "all-time low"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "22px 16px 0" }}>
          <div style={{ background: "var(--blood)", color: "var(--bone)", padding: "12px 14px", border: "2px solid var(--void)", boxShadow: "3px 3px 0 var(--void)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1 }}>⌛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" }}>Ending at midnight</div>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 18, lineHeight: 1.1, marginTop: 2 }}>
                3 sales disappear in <span style={{ fontFamily: "var(--font-mono)", background: "var(--void)", color: "var(--accent)", padding: "1px 6px" }}>7h 22m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <FGTabBar active="deals"/>
      <HomeIndicator />
    </div>
  );
}

function MobileCoven() {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <FGHeader title="Coven" leading={<IconBtn>☰</IconBtn>} trailing={<IconBtn>+</IconBtn>} />
      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 110 }}>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ background: "var(--bone)", color: "var(--void)", padding: "12px 14px", border: "2px solid var(--accent)", boxShadow: "3px 3px 0 var(--accent)", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--pink-deep)" }}>Your Coven</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 42, lineHeight: 0.9, marginTop: 4 }}>14 members</div>
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, textAlign: "right", lineHeight: 1.3 }}>
              3 howling now<br/>2 sent you films
            </div>
          </div>
        </div>

        <div style={{ padding: "8px 0 14px" }}>
          <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10, padding: "0 16px" }}>Howling · right now</div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
            {["Moss Witch", "Doom Slug", "Candle Flesh", "Ash Dovecote", "Bloody Reel", "Tallow Jones"].map((name, i) => (
              <div key={name} style={{ flexShrink: 0, textAlign: "center", width: 60 }}>
                <div style={{
                  padding: 2,
                  border: i < 3 ? "2px solid var(--accent)" : "2px solid var(--muted-dark)",
                  borderRadius: "50%",
                  boxShadow: i < 3 ? "2px 2px 0 var(--accent)" : "none",
                  display: "inline-block",
                }}>
                  <Avatar name={name} size={50}/>
                </div>
                <div style={{ fontSize: 9, marginTop: 4, color: "var(--bone-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name.split(" ")[0].toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", borderTop: "1.5px solid var(--muted-dark)", borderBottom: "1.5px solid var(--muted-dark)" }}>
          {[
            { id: "coven", label: "Following", count: 14, active: true },
            { id: "followers", label: "Followers", count: 38 },
            { id: "suggested", label: "Suggested", count: 9 },
          ].map(t => (
            <div key={t.id} style={{
              flex: 1, color: t.active ? "var(--accent)" : "var(--muted)",
              borderBottom: "2px solid " + (t.active ? "var(--accent)" : "transparent"),
              padding: "10px 0", fontFamily: "var(--font-ui)", fontWeight: 700,
              fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center",
            }}>{t.label} <span style={{ opacity: 0.6 }}>{t.count}</span></div>
          ))}
        </div>

        <div>
          {[
            { user: "moss.witch", name: "Moss Witch", reviews: 412, recent: "Midsommar ★★★★★", online: true },
            { user: "doomslug", name: "Doom Slug", reviews: 287, recent: "sent you Saint Maud", online: true },
            { user: "candleflesh", name: "Candle Flesh", reviews: 156, recent: "listed The Complete Eggers", online: false },
            { user: "ash.dovecote", name: "Ash Dovecote", reviews: 88, recent: "Hereditary ★★★★", online: false },
            { user: "bloodyreel", name: "Bloody Reel", reviews: 523, recent: "X ★★★½", online: false },
            { user: "gristleburn", name: "Gristle Burn", reviews: 244, recent: "tracked Cure", online: false },
          ].map((m, i) => (
            <div key={m.user} style={{ display: "flex", gap: 12, padding: "14px 16px", borderBottom: "1.5px solid var(--void-3)", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Avatar name={m.name} size={40}/>
                {m.online && <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, background: "var(--accent)", border: "2px solid var(--void)", borderRadius: 6 }}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-ui)", fontWeight: 900, fontSize: 13 }}>@{m.user}</span>
                  {i === 0 && <span style={{ background: "var(--accent)", color: "var(--accent-ink)", fontFamily: "var(--font-ui)", fontWeight: 900, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", padding: "1px 5px" }}>mutual</span>}
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, color: "var(--bone-2)", marginTop: 2 }}>{m.recent}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2, letterSpacing: "0.04em" }}>{m.reviews} reviews</div>
              </div>
              <div style={{ background: "transparent", border: "1.5px solid var(--muted-dark)", color: "var(--muted)", fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "5px 10px" }}>Recommend</div>
            </div>
          ))}
        </div>
      </div>
      <FGTabBar active="me"/>
      <HomeIndicator />
    </div>
  );
}

function MobileProfile() {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--void)", position: "relative", fontFamily: "var(--font-ui)", color: "var(--bone)" }}>
      <FGStatusBar dark />
      <div style={{ height: "100%", overflowY: "auto", paddingBottom: 100 }}>
        <div style={{ position: "absolute", top: 60, left: 12, right: 12, zIndex: 20, display: "flex", justifyContent: "space-between" }}>
          <IconBtn style={{ background: "rgba(20,20,20,0.8)", backdropFilter: "blur(10px)" }}>←</IconBtn>
          <div style={{ display: "flex", gap: 6 }}>
            <IconBtn style={{ background: "rgba(20,20,20,0.8)", backdropFilter: "blur(10px)" }}>✉</IconBtn>
            <IconBtn style={{ background: "rgba(20,20,20,0.8)", backdropFilter: "blur(10px)" }}>⋯</IconBtn>
          </div>
        </div>

        <div style={{ height: 150, position: "relative", overflow: "hidden", background: "#3a5f3a" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(#f5d300 2px, transparent 2.2px)", backgroundSize: "12px 12px", opacity: 0.4, mixBlendMode: "screen" }}/>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
            mixBlendMode: "multiply", opacity: 0.5,
          }}/>
        </div>

        <div style={{ position: "relative", padding: "0 16px", marginTop: -42 }}>
          <div style={{ position: "relative", width: 84, height: 84 }}>
            <Avatar name="Moss Witch" size={84}/>
            <div style={{
              position: "absolute", top: -4, right: -12,
              background: "var(--accent)", color: "var(--accent-ink)",
              fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1,
              padding: "4px 8px", transform: "rotate(-10deg)",
              border: "2px solid var(--void)", boxShadow: "2px 2px 0 var(--void)",
            }}>✦ 412</div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 0.95, color: "var(--accent)" }}>Moss Witch</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginTop: 2 }}>@moss.witch</div>
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.4, color: "var(--bone-2)", marginTop: 8, maxWidth: 320 }}>
              grief gardener. writes about folk horror + liturgical dread. the may queen is my comfort character.
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
              {["Folk Horror", "1970s", "A24", "J-Horror"].map(t => (<span key={t} className="chip" style={{ color: "var(--muted)", fontSize: 9 }}>{t}</span>))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 11, padding: "10px 12px" }}>✦ Following</button>
            <button className="btn btn-outline" style={{ padding: "10px 12px", fontSize: 11 }}>Recommend</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 16, border: "1.5px solid var(--muted-dark)" }}>
            {[{ n: "412", l: "Reviews" }, { n: "23", l: "Grimoires" }, { n: "1.8k", l: "Coven" }].map((s, i) => (
              <div key={s.l} style={{ padding: 10, textAlign: "center", borderRight: i < 2 ? "1.5px solid var(--muted-dark)" : "none" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--bone)", lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 20, borderTop: "1.5px solid var(--muted-dark)", borderBottom: "1.5px solid var(--muted-dark)" }}>
          {[{ label: "Reviews", active: true }, { label: "Grimoires" }, { label: "Watching" }].map(t => (
            <div key={t.label} style={{
              flex: 1, color: t.active ? "var(--accent)" : "var(--muted)",
              borderBottom: "2px solid " + (t.active ? "var(--accent)" : "transparent"),
              padding: "10px 0", fontFamily: "var(--font-ui)", fontWeight: 700,
              fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center",
            }}>{t.label}</div>
          ))}
        </div>

        <div style={{ padding: "14px 16px" }}>
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>✦ Pinned</div>
          <div style={{ border: "2px solid var(--accent)", padding: 14, position: "relative", background: "var(--void-2)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <FilmPoster film={FILM_BY_ID.midsommar} size="xs"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 17, lineHeight: 1 }}>Midsommar</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <Stars rating={9}/>
                  <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>rewatched 4×</span>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--bone-2)", marginTop: 8, lineHeight: 1.4 }}>
                  "communal grief as a crop rotation. i've been thinking about the may queen for six years. it's still not over."
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  <span>♥ 344</span>
                  <span>✎ 22</span>
                  <span>⟲ 18</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>
          {[
            { id: "witch", rating: 9, body: "the billy goat was always the protagonist. i accept this now.", likes: 128 },
            { id: "hereditary", rating: 8, body: "a chorus of grief. the scream in the third act is a liturgy.", likes: 241 },
          ].map(r => {
            const f = FILM_BY_ID[r.id];
            return (
              <div key={r.id} style={{ display: "flex", gap: 10, padding: "14px 0", borderBottom: "1.5px solid var(--void-3)" }}>
                <FilmPoster film={f} size="xs"/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-head)", fontSize: 16, lineHeight: 1 }}>{f.title}</div>
                  <Stars rating={r.rating} size={13}/>
                  <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, lineHeight: 1.35, marginTop: 4, color: "var(--bone-2)" }}>"{r.body}"</div>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 4, letterSpacing: "0.04em" }}>♥ {r.likes}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

const ARTBOARDS = [
  { id: "lockscreen", label: "01 · Lockscreen Howl", Component: MobileLockscreen },
  { id: "landing", label: "02 · Landing", Component: MobileLanding },
  { id: "home", label: "03 · Feed", Component: MobileHome },
  { id: "film", label: "04 · Film Detail", Component: MobileFilmDetail },
  { id: "alerts", label: "05 · Howls Inbox", Component: MobileAlerts },
  { id: "onboarding", label: "06 · Onboarding · Threshold", Component: MobileOnboarding },
  { id: "hunt", label: "07 · Hunt · Search", Component: MobileHunt },
  { id: "deals", label: "08 · Deals", Component: MobileDeals },
  { id: "coven", label: "09 · Coven", Component: MobileCoven },
  { id: "profile", label: "10 · Public Profile", Component: MobileProfile },
];

export default function MobilePage() {
  return (
    <div style={{
      minHeight: "100vh", background: "#f0eee9",
      backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)",
      backgroundSize: "24px 24px",
      padding: "60px 32px 60px",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto 40px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(60,50,40,0.6)", marginBottom: 6 }}>
          Mobile
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "rgba(40,30,20,0.85)", letterSpacing: -0.5 }}>
          Film Goblin · Mobile
        </div>
        <div style={{ fontSize: 15, color: "rgba(60,50,40,0.6)", marginTop: 4, fontStyle: "italic" }}>
          Phone-first. The push notification is the product.
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, 390px)",
        justifyContent: "center",
        gap: "60px 40px",
        maxWidth: 1400, margin: "0 auto",
      }}>
        {ARTBOARDS.map(a => (
          <div key={a.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: "rgba(60,50,40,0.7)", letterSpacing: "0.02em",
              marginBottom: 12, alignSelf: "flex-start",
            }}>
              {a.label}
            </div>
            <IOSFrame width={390} height={780} dark>
              <a.Component />
            </IOSFrame>
          </div>
        ))}
      </div>
    </div>
  );
}
