import FilmPoster from "../components/FilmPoster.jsx";
import PriceDrop from "../components/PriceDrop.jsx";
import HalftoneBar from "../components/HalftoneBar.jsx";
import { FILMS, FILM_BY_ID, LISTS } from "../data.js";

export default function LandingPage({ onNavigate }) {
  const dealFilms = FILMS.slice(0, 10);
  const marqueeStrip = [...dealFilms, ...dealFilms];
  const featuredLists = LISTS.slice(0, 4);

  return (
    <div style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", fontFamily: "var(--font-ui)" }}>
      <div style={{ borderBottom: "2px solid var(--void)", background: "var(--bone)", position: "relative" }} className="grain-light">
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <span className="eyebrow" style={{ marginLeft: 6, opacity: 0.6 }}>Est. 2026 · Issue nº1</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a className="caps" style={{ fontSize: 12 }}>Deals</a>
            <a className="caps" style={{ fontSize: 12 }}>Lists</a>
            <a className="caps" style={{ fontSize: 12 }}>The Manifesto</a>
            <button className="btn btn-dark btn-sm" onClick={() => onNavigate("onboarding")}>Sign In</button>
          </div>
        </div>
      </div>

      <section style={{ borderBottom: "2px solid var(--void)", position: "relative", overflow: "hidden" }} className="grain-light">
        <div className="container-wide" style={{ padding: "48px 32px 32px", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, alignItems: "stretch" }}>
            <div>
              <div className="stamp" style={{ background: "var(--void)", color: "var(--yellow)", borderColor: "var(--void)", marginBottom: 20 }}>
                ✦ Watch Weirder ✦
              </div>
              <h1 className="display" style={{
                fontSize: "clamp(80px, 11vw, 180px)",
                margin: 0,
                color: "var(--void)",
                lineHeight: 0.82,
                letterSpacing: "-0.02em",
              }}>
                FILM
                <br />
                <span style={{ color: "var(--accent)", position: "relative", display: "inline-block" }}>
                  GOBLIN
                </span>
              </h1>
              <p className="head" style={{ fontSize: 30, lineHeight: 1.12, margin: "28px 0 12px", maxWidth: 560, textWrap: "balance" }}>
                A covenant of cinephiles, hunting cheap movies on Apple TV &amp; iTunes.
              </p>
              <p style={{ fontSize: 16, maxWidth: 520, lineHeight: 1.5, margin: "0 0 28px", color: "var(--void)" }}>
                Scry the marketplace. Summon a deal when a film drops in price. Recommend it to a friend before the moon wanes. Track what you've owned and what you've merely borrowed from the void.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <button className="btn btn-lg" onClick={() => onNavigate("onboarding")}>
                  ✦ Join The Coven
                </button>
                <button className="btn btn-outline btn-lg">How It Works</button>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 28, flexWrap: "wrap", fontSize: 12 }} className="caps">
                <span>✦ 18,402 Films Tracked</span>
                <span>✦ $4.10 Avg. Summoned Deal</span>
                <span>✦ Free Forever</span>
              </div>
            </div>

            <div style={{ position: "relative", minHeight: 560 }}>
              <div style={{ position: "absolute", top: 20, right: 40, transform: "rotate(-4deg)" }}>
                <FilmPoster film={FILM_BY_ID.midsommar} size="lg" />
                <div style={{ position: "absolute", top: -18, right: -18, zIndex: 3 }}>
                  <PriceDrop from={14.99} to={4.99} pct={67} />
                </div>
              </div>
              <div style={{ position: "absolute", top: 180, left: 0, transform: "rotate(3deg)" }}>
                <FilmPoster film={FILM_BY_ID.hereditary} size="md" />
                <div style={{ position: "absolute", top: -14, left: -14 }}>
                  <PriceDrop from={12.99} to={3.99} pct={69} size="sm" />
                </div>
              </div>
              <div style={{ position: "absolute", bottom: 20, right: 0, transform: "rotate(5deg)" }}>
                <FilmPoster film={FILM_BY_ID.suspiria} size="md" />
              </div>
              <svg style={{ position: "absolute", top: 30, left: 40, width: 120, height: 80 }} viewBox="0 0 120 80">
                <path d="M5 60 Q 40 10, 100 20 L 90 10 M 100 20 L 92 30" stroke="var(--void)" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", top: 5, left: 60, fontFamily: "var(--font-display)", fontSize: 22, transform: "rotate(-8deg)" }}>
                67% off!!
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 18, background: "var(--void)", color: "var(--accent)", position: "relative" }}>
          <HalftoneBar color="currentColor" height={18} />
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", borderBottom: "2px solid var(--void)", padding: "40px 0", overflow: "hidden" }}>
        <div className="container-wide" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>Chapter I</div>
            <h2 className="display" style={{ fontSize: 72, margin: 0, lineHeight: 0.9 }}>
              Deals, Fresh <span style={{ color: "var(--accent)", fontStyle: "italic" }}>From The Pit</span>
            </h2>
          </div>
          <div style={{ maxWidth: 320, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.4, opacity: 0.7 }}>
            Updated hourly. We trawl every Apple storefront so you don't have to summon them yourself.
          </div>
        </div>

        <div style={{ overflow: "hidden", padding: "20px 0", position: "relative" }}>
          <div className="marquee" style={{ gap: 24 }}>
            {marqueeStrip.map((f, i) => {
              const p = f.prices[0];
              const pct = Math.round((1 - p.current / p.was) * 100);
              return (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  <FilmPoster film={f} size="md" />
                  <div style={{ position: "absolute", top: -12, right: -12, zIndex: 3 }}>
                    <PriceDrop from={p.was} to={p.current} pct={pct} size="sm" />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                    was <span style={{ textDecoration: "line-through" }}>${p.was}</span> · now <span style={{ color: "var(--accent)" }}>${p.current}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--bone)", color: "var(--void)", padding: "72px 0", borderBottom: "2px solid var(--void)", position: "relative" }} className="grain-light">
        <div className="container-wide">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 40 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>Chapter II</div>
              <h2 className="display" style={{ fontSize: 80, margin: 0, lineHeight: 0.88, color: "var(--void)" }}>
                The Curated<br/><em style={{ color: "var(--accent)" }}>Grimoires</em>
              </h2>
            </div>
            <div style={{ maxWidth: 320, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.4 }}>
              Watchlists compiled by the coven. Subscribe to be notified whenever any film on a list drops below its mean price.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {featuredLists.map((list, i) => (
              <div key={list.id} style={{
                background: list.bg,
                color: list.fg || "var(--bone)",
                border: "2px solid var(--void)",
                boxShadow: "5px 5px 0 var(--void)",
                padding: 0,
                overflow: "hidden",
                position: "relative",
                transform: `rotate(${[-1.5, 0.5, -0.8, 1.2][i]}deg)`,
                cursor: "pointer",
              }}>
                <div style={{
                  height: 280,
                  position: "relative",
                  overflow: "hidden",
                  background: list.bg,
                  color: list.fg || "var(--bone)",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `radial-gradient(${list.accent} 1.8px, transparent 2px)`,
                    backgroundSize: "10px 10px",
                    opacity: 0.4,
                  }} />
                  <div style={{
                    position: "absolute", inset: 16,
                    display: "flex", flexDirection: "column", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      {list.official && (
                        <span className="stamp" style={{ background: list.accent, color: list.bg, borderColor: list.accent }}>
                          ✦ Official ✦
                        </span>
                      )}
                      <span className="caps" style={{ fontSize: 10, color: list.accent, marginLeft: "auto" }}>
                        #{String(i+1).padStart(3,"0")}
                      </span>
                    </div>
                    <div className="display" style={{
                      fontSize: list.title.length > 20 ? 28 : 40,
                      lineHeight: 0.92,
                    }}>
                      {list.title}
                    </div>
                  </div>
                  <div style={{
                    position: "absolute", top: -10, right: -30, width: 90, height: 24,
                    background: list.accent,
                    transform: "rotate(45deg)",
                    opacity: 0.7,
                  }} />
                </div>
                <div style={{
                  padding: "14px 16px",
                  background: list.bg,
                  borderTop: `2px solid ${list.fg || "var(--bone)"}`,
                  color: list.fg || "var(--bone)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 11,
                  fontFamily: "var(--font-ui)",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  <span>@{list.curator}</span>
                  <span>{list.count} films</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--void)", color: "var(--bone)", padding: "80px 0", borderBottom: "2px solid var(--void)", position: "relative", overflow: "hidden" }}>
        <div className="container-wide" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Chapter III · The Rites</div>
            <h2 className="display" style={{ fontSize: 84, margin: "0 0 32px", lineHeight: 0.88 }}>
              How The<br/><span style={{ color: "var(--accent)" }}>Summoning</span><br/>Works.
            </h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 24 }}>
              {[
                { n: "I", t: "Track a film", d: "Add any movie on Apple TV or iTunes to your watchlist. We'll remember its sticker price." },
                { n: "II", t: "Wait for the omens", d: "When a film drops in price — we alert you. No email newsletter noise. Just the deal, and the deadline." },
                { n: "III", t: "Recommend to a friend", d: "One-tap send to anyone in your coven. They get the deal. You get credit for being the weird one who found it first." },
              ].map(step => (
                <li key={step.n} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 20, alignItems: "start", borderTop: "2px solid var(--muted-dark)", paddingTop: 16 }}>
                  <div className="display" style={{ fontSize: 72, lineHeight: 0.85, color: "var(--accent)" }}>{step.n}</div>
                  <div>
                    <h3 className="head" style={{ fontSize: 28, margin: "0 0 6px" }}>{step.t}</h3>
                    <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.5, margin: 0, opacity: 0.85 }}>{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div style={{ position: "relative" }}>
            <div style={{
              background: "var(--bone)",
              color: "var(--void)",
              border: "3px solid var(--void)",
              padding: "40px 32px 32px",
              transform: "rotate(-1.5deg)",
              boxShadow: "12px 12px 0 var(--accent)",
              position: "relative",
            }} className="grain-light">
              <div style={{ textAlign: "center" }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>The Initiation</div>
                <h3 className="display" style={{ fontSize: 58, margin: "0 0 14px", lineHeight: 0.9 }}>
                  ACCESS<br/>SECRETS
                </h3>
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.45, margin: "0 auto 24px", maxWidth: 360 }}>
                  Join the list of lunarians to be the first to know about price drops, restocks, new rituals, and to get a cult discount on everything.
                </p>
                <div style={{ border: "2px solid var(--void)", padding: "12px 14px", textAlign: "left", fontFamily: "var(--font-ui)", color: "var(--muted-dark)", marginBottom: 14 }}>
                  your-name@coven.mail
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, textAlign: "left", marginBottom: 20, alignItems: "flex-start" }}>
                  <div style={{ width: 14, height: 14, border: "2px solid var(--void)", flexShrink: 0, background: "var(--accent)" }} />
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", lineHeight: 1.4 }}>
                    By providing your email, you agree to receive updates via carrier raven or text from Film Goblin and our other partners on our behalf.
                  </span>
                </div>
                <button className="btn btn-dark btn-lg" style={{ width: "100%", justifyContent: "center" }}>
                  ✦ Agree And Seal ✦
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: "var(--bone)", color: "var(--void)", padding: "64px 0 32px", position: "relative" }} className="grain-light">
        <div className="container-wide">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="display" style={{ fontSize: 120, lineHeight: 0.85 }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <div className="caps" style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>Printed in the basement. Shipped to production.</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 32, marginBottom: 48 }}>
            {[
              { title: "Of The App", links: ["Watchlist", "Deals", "Lists", "Friends"] },
              { title: "Of The Community", links: ["The Coven", "Reviewers", "Lists", "The Oracle"] },
              { title: "Of The Firm", links: ["Manifesto", "Press", "Contact", "Pricing"] },
              { title: "Of The Law", links: ["Terms", "Privacy", "Cookies", "Blood Pacts"] },
              { title: "Of The Realms", links: ["Apple TV", "iTunes US", "iTunes UK", "iTunes CA", "iTunes AU"] },
            ].map(col => (
              <div key={col.title}>
                <div className="eyebrow" style={{ marginBottom: 14, borderBottom: "2px solid var(--void)", paddingBottom: 6 }}>
                  ✦ {col.title}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                  {col.links.map(l => (
                    <li key={l} style={{ fontFamily: "var(--font-serif)", fontSize: 15 }}>
                      <a style={{ textDecoration: "underline", textDecorationThickness: 1, textUnderlineOffset: 3 }}>{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "2px solid var(--void)", paddingTop: 16, display: "flex", justifyContent: "space-between", fontSize: 11 }} className="caps">
            <span>© Film Goblin MMXXVI · All hexes reserved</span>
            <span>Not affiliated with Apple. We just trawl their marketplace.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
