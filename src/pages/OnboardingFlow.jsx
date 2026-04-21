import { useState, useMemo } from "react";
import FilmPoster from "../components/FilmPoster.jsx";
import Avatar from "../components/Avatar.jsx";
import { FILMS, USERS } from "../data.js";

const GENRES = [
  { id: "folk", label: "Folk", sub: "dirt, rites, harvest", bg: "#3a5f3a", fg: "#f5d300", glyph: "✿" },
  { id: "slow", label: "Slow Burn", sub: "patience. then rot.", bg: "#1a2a1a", fg: "#f5d300", glyph: "⌛" },
  { id: "body", label: "Body Horror", sub: "the vessel betrays", bg: "#b8221c", fg: "#f5d300", glyph: "✷" },
  { id: "cosmic", label: "Cosmic", sub: "larger than sense", bg: "#3a1a5f", fg: "#ff2d88", glyph: "✦" },
  { id: "j", label: "J-Horror", sub: "quiet. then not.", bg: "#0a0a0a", fg: "#ff2d88", glyph: "鬼" },
  { id: "slasher", label: "Slasher", sub: "masked. methodical.", bg: "#d93a2e", fg: "#f3ecd8", glyph: "✂" },
  { id: "gothic", label: "Gothic", sub: "ornate decay", bg: "#2a1f3a", fg: "#f3ecd8", glyph: "✙" },
  { id: "vhs", label: "Video Nasty", sub: "grain. gristle.", bg: "#f5d300", fg: "#0a0a0a", glyph: "▲" },
  { id: "psych", label: "Psychological", sub: "the mind as the room", bg: "#0a0a0a", fg: "#ff6a1f", glyph: "◉" },
];

const STORES = [
  { id: "appletv", label: "Apple TV", sub: "the blessed storefront", icon: "◉" },
  { id: "itunes", label: "iTunes", sub: "the elder storefront", icon: "♪" },
  { id: "prime", label: "Prime Video", sub: "occasionally useful", icon: "▶" },
  { id: "criterion", label: "Criterion Channel", sub: "canonical", icon: "✦" },
  { id: "shudder", label: "Shudder", sub: "for the devout", icon: "☾" },
  { id: "mubi", label: "Mubi", sub: "for the insufferable", icon: "◐" },
];

const COVEN_SEEDS = USERS.slice(0, 6);

function toRoman(n) {
  return ["0", "I", "II", "III", "IV", "V", "VI"][n] || String(n);
}

export default function OnboardingFlow({ onNavigate }) {
  const [chapter, setChapter] = useState(0);
  const [genres, setGenres] = useState([]);
  const [stores, setStores] = useState(["appletv", "itunes"]);
  const [watchlist, setWatchlist] = useState([]);
  const [follows, setFollows] = useState([]);
  const [threshold, setThreshold] = useState(30);
  const [coven, setCoven] = useState("");
  const [signed, setSigned] = useState(false);

  const totalChapters = 5;
  const progress = Math.round(((chapter) / (totalChapters - 1)) * 100);

  const next = () => setChapter(c => Math.min(c + 1, totalChapters - 1));
  const back = () => setChapter(c => Math.max(c - 1, 0));

  const canAdvance = (() => {
    if (chapter === 0) return true;
    if (chapter === 1) return genres.length >= 3;
    if (chapter === 2) return stores.length >= 1;
    if (chapter === 3) return watchlist.length >= 3;
    if (chapter === 4) return signed;
    return true;
  })();

  return (
    <div style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100vh", position: "relative" }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.18,
        backgroundImage: "radial-gradient(var(--void) 0.8px, transparent 1px)",
        backgroundSize: "4px 4px", zIndex: 1,
      }} />

      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--bone)", borderBottom: "2px solid var(--void)",
      }}>
        <div className="container-wide" style={{ padding: "14px 32px", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1, cursor: "pointer" }} onClick={() => onNavigate("landing")}>
            Film<span style={{ color: "var(--accent)" }}>Goblin</span>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14 }}>
            <span className="caps" style={{ fontSize: 10, opacity: 0.6 }}>The Ritual</span>
            <div style={{ flex: 1, maxWidth: 420, height: 10, background: "transparent", border: "2px solid var(--void)", position: "relative" }}>
              <div style={{
                position: "absolute", inset: 0, width: `${progress}%`,
                background: "var(--accent)",
                transition: "width 420ms cubic-bezier(.7,0,.3,1)",
              }} />
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: "repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), var(--void) calc(25% - 1px) 25%)",
                pointerEvents: "none",
              }} />
            </div>
            <span className="caps" style={{ fontSize: 10, fontWeight: 700 }}>
              Chapter {toRoman(chapter)} / {toRoman(totalChapters - 1)}
            </span>
          </div>
          <button className="caps" onClick={() => onNavigate("landing")} style={{
            background: "transparent", border: "1px solid var(--void)", padding: "6px 12px",
            fontSize: 10, cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 700,
          }}>✗ Abandon</button>
        </div>
      </header>

      <div style={{ position: "relative", zIndex: 2 }}>
        {chapter === 0 && <Prologue onNext={next} />}
        {chapter === 1 && <ChapterGenres selected={genres} onToggle={g => setGenres(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g])} />}
        {chapter === 2 && <ChapterStores selected={stores} onToggle={s => setStores(ss => ss.includes(s) ? ss.filter(x => x !== s) : [...ss, s])} />}
        {chapter === 3 && <ChapterWatchlist selected={watchlist} onToggle={f => setWatchlist(ws => ws.includes(f) ? ws.filter(x => x !== f) : ws.length < 10 ? [...ws, f] : ws)} genres={genres} />}
        {chapter === 4 && <ChapterOath
          threshold={threshold} setThreshold={setThreshold}
          coven={coven} setCoven={setCoven}
          follows={follows}
          onToggleFollow={h => setFollows(fs => fs.includes(h) ? fs.filter(x => x !== h) : [...fs, h])}
          signed={signed} setSigned={setSigned}
          genres={genres} stores={stores} watchlist={watchlist}
          onEnter={() => onNavigate("home")}
        />}
      </div>

      {chapter > 0 && chapter < 4 && (
        <footer style={{
          position: "sticky", bottom: 0, zIndex: 20,
          background: "var(--bone)", borderTop: "2px solid var(--void)",
        }}>
          <div className="container-wide" style={{ padding: "14px 32px", display: "flex", alignItems: "center", gap: 14 }}>
            <button className="btn btn-outline" onClick={back}>← Previous Chapter</button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, opacity: 0.65 }}>
              {chapter === 1 && `Select at least three. Chosen: ${genres.length}.`}
              {chapter === 2 && `Bind at least one storefront. Bound: ${stores.length}.`}
              {chapter === 3 && `Seed three films. Seeded: ${watchlist.length} of 10.`}
            </div>
            <button className="btn" onClick={next} disabled={!canAdvance} style={{ opacity: canAdvance ? 1 : 0.35, cursor: canAdvance ? "pointer" : "not-allowed" }}>
              Next Chapter →
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Prologue({ onNext }) {
  return (
    <section style={{ padding: "64px 0 48px", position: "relative" }}>
      <div className="container-wide" style={{ maxWidth: 860, textAlign: "center", position: "relative" }}>
        <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 20 }}>
          ✦ Chapter Zero · The Prologue ✦
        </div>
        <h1 className="display" style={{ fontSize: 156, lineHeight: 0.85, margin: "0 0 28px" }}>
          Join The<br /><span style={{ color: "var(--accent)" }}>Coven</span>.
        </h1>
        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 22, lineHeight: 1.45, maxWidth: 640, margin: "0 auto 22px" }}>
          This will take four minutes. We will ask your poisons, bind your storefronts, seed your altar, and take your oath. Then the watching begins in earnest.
        </p>

        <div style={{
          margin: "44px auto 36px", maxWidth: 640,
          border: "2px solid var(--void)", background: "var(--bone-2)",
          padding: "0", textAlign: "left",
        }}>
          {[
            { n: "I", t: "Declare Your Poisons", d: "Pick the genres that keep you up. We'll tune the oracle." },
            { n: "II", t: "Bind Your Storefronts", d: "Tell us where you actually buy films. We'll only watch those." },
            { n: "III", t: "Seed The Altar", d: "Add three films to your watchlist. The price-watch starts now." },
            { n: "IV", t: "Swear The Oath", d: "Name yourself. Set thy threshold. Sign in blood (metaphorically)." },
          ].map((c, i) => (
            <div key={c.n} style={{
              display: "grid", gridTemplateColumns: "64px 1fr",
              borderBottom: i < 3 ? "1.5px solid var(--void)" : "none",
            }}>
              <div style={{
                background: i === 0 ? "var(--accent)" : "transparent",
                borderRight: "1.5px solid var(--void)",
                display: "grid", placeItems: "center",
                fontFamily: "var(--font-display)", fontSize: 36, lineHeight: 1,
                color: i === 0 ? "var(--accent-ink)" : "var(--void)",
              }}>{c.n}</div>
              <div style={{ padding: "14px 20px" }}>
                <div className="head" style={{ fontSize: 20, lineHeight: 1.1, marginBottom: 2 }}>{c.t}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", opacity: 0.75 }}>{c.d}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-lg" onClick={onNext} style={{ fontSize: 16 }}>
          Begin The Ritual →
        </button>
        <div style={{ marginTop: 14, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, opacity: 0.55 }}>
          You may abandon at any time. We will remember nothing. Probably.
        </div>
      </div>
    </section>
  );
}

function ChapterGenres({ selected, onToggle }) {
  return (
    <section style={{ padding: "48px 0", position: "relative" }}>
      <div className="container-wide">
        <ChapterHeader n="I" title="Declare Thy Poisons" quote="What flavour of dread? Pick three. Or twelve. We are not a jealous system." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, maxWidth: 980, margin: "0 auto" }}>
          {GENRES.map((g, i) => {
            const on = selected.includes(g.id);
            return (
              <button key={g.id} onClick={() => onToggle(g.id)} style={{
                background: on ? g.bg : "var(--bone-2)",
                color: on ? g.fg : "var(--void)",
                border: `2px solid var(--void)`,
                padding: "22px 20px",
                textAlign: "left", cursor: "pointer",
                position: "relative", overflow: "hidden",
                transform: on ? `rotate(${(i % 2 === 0 ? -1 : 1) * 0.8}deg) translateY(-2px)` : "none",
                boxShadow: on ? `6px 6px 0 var(--void)` : "none",
                transition: "transform 200ms, box-shadow 200ms",
                fontFamily: "inherit",
              }}>
                {on && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `radial-gradient(${g.fg} 1.4px, transparent 1.6px)`,
                    backgroundSize: "10px 10px", opacity: 0.2, pointerEvents: "none",
                  }} />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, position: "relative" }}>
                  <span className="caps" style={{ fontSize: 10, opacity: on ? 1 : 0.55 }}>{on ? "✓ Chosen" : "Choose"}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1, opacity: on ? 0.75 : 0.25 }}>{g.glyph}</span>
                </div>
                <div className="head" style={{ fontSize: 28, lineHeight: 1, marginBottom: 4, position: "relative" }}>{g.label}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontStyle: "italic", opacity: on ? 0.85 : 0.55, position: "relative" }}>{g.sub}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ChapterStores({ selected, onToggle }) {
  return (
    <section style={{ padding: "48px 0", position: "relative" }}>
      <div className="container-wide">
        <ChapterHeader n="II" title="Bind Thy Storefronts" quote="We watch these. No others. Untick them if you don't care." />
        <div style={{ maxWidth: 760, margin: "0 auto", border: "2px solid var(--void)" }}>
          {STORES.map((s, i) => {
            const on = selected.includes(s.id);
            return (
              <label key={s.id} style={{
                display: "grid", gridTemplateColumns: "64px 56px 1fr 110px", alignItems: "center",
                borderBottom: i < STORES.length - 1 ? "1.5px solid var(--void)" : "none",
                background: on ? "var(--accent)" : "var(--bone-2)",
                color: on ? "var(--accent-ink)" : "var(--void)",
                cursor: "pointer",
                transition: "background 180ms",
              }}>
                <div style={{
                  borderRight: "1.5px solid var(--void)", padding: "18px 0",
                  textAlign: "center",
                  fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1,
                }}>{s.icon}</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    width: 22, height: 22, margin: "0 auto",
                    border: "2px solid var(--void)",
                    background: on ? "var(--void)" : "transparent",
                    position: "relative",
                  }}>
                    {on && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--accent)", fontWeight: 900, fontSize: 14 }}>✓</span>}
                  </div>
                </div>
                <div style={{ padding: "16px 8px" }}>
                  <div className="head" style={{ fontSize: 22, lineHeight: 1, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 12, fontStyle: "italic", opacity: 0.7 }}>{s.sub}</div>
                </div>
                <div style={{ textAlign: "right", padding: "0 20px", fontSize: 11 }} className="caps">
                  {on ? "Bound" : "Bind"}
                </div>
                <input type="checkbox" checked={on} onChange={() => onToggle(s.id)} style={{ display: "none" }} />
              </label>
            );
          })}
        </div>
        <div style={{ textAlign: "center", marginTop: 20, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, opacity: 0.6 }}>
          Region: United States · Currency: USD · <a style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>change</a>
        </div>
      </div>
    </section>
  );
}

function ChapterWatchlist({ selected, onToggle }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return FILMS;
    const n = q.trim().toLowerCase();
    return FILMS.filter(f => f.title.toLowerCase().includes(n) || f.director.toLowerCase().includes(n));
  }, [q]);

  return (
    <section style={{ padding: "48px 0", position: "relative" }}>
      <div className="container-wide">
        <ChapterHeader n="III" title="Seed The Altar" quote="Three films you want to own but don't yet. We'll whisper when they bleed." />

        <div style={{ maxWidth: 720, margin: "0 auto 28px", position: "relative" }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search the grimoire…"
            style={{
              width: "100%", padding: "14px 18px",
              background: "var(--bone-2)", border: "2px solid var(--void)",
              fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--void)",
              outline: "none",
            }}
          />
          <span className="caps" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, opacity: 0.6 }}>
            {results.length} results
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, maxWidth: 1080, margin: "0 auto" }}>
          {results.slice(0, 18).map(f => {
            const on = selected.includes(f.id);
            const p = f.prices[0];
            const sale = p && p.current < p.was;
            return (
              <button key={f.id} onClick={() => onToggle(f.id)} style={{
                background: "transparent", border: "0", padding: 0, cursor: "pointer",
                textAlign: "left", position: "relative",
                transform: on ? "translateY(-4px) rotate(-1deg)" : "none",
                transition: "transform 220ms",
                fontFamily: "inherit",
              }}>
                <div style={{ position: "relative", border: on ? "3px solid var(--accent)" : "3px solid transparent" }}>
                  <FilmPoster film={f} size="sm" style={{ width: "100%", height: 220 }} />
                  {on && (
                    <div style={{
                      position: "absolute", top: -10, right: -10,
                      width: 32, height: 32, borderRadius: "50%",
                      background: "var(--accent)", color: "var(--accent-ink)",
                      display: "grid", placeItems: "center",
                      fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1,
                      border: "2px solid var(--void)",
                      boxShadow: "2px 2px 0 var(--void)",
                    }}>✦</div>
                  )}
                  {sale && !on && (
                    <div style={{
                      position: "absolute", top: 8, left: 8,
                      background: "var(--accent)", color: "var(--accent-ink)",
                      padding: "2px 6px", fontSize: 9, fontWeight: 800,
                      fontFamily: "var(--font-ui)", letterSpacing: "0.1em",
                    }}>ON SALE</div>
                  )}
                </div>
                <div style={{ marginTop: 6, fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 700 }}>
                  {f.title} <span style={{ opacity: 0.55, fontWeight: 400 }}>· {f.year}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selected.length > 0 && (
          <div style={{ marginTop: 28, textAlign: "center", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14 }}>
            Sowed: {selected.map(id => FILMS.find(f => f.id === id)?.title).join(" · ")}
          </div>
        )}
      </div>
    </section>
  );
}

function ChapterOath({ threshold, setThreshold, coven, setCoven, follows, onToggleFollow, signed, setSigned, genres, stores, watchlist, onEnter }) {
  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }, []);

  return (
    <section style={{ padding: "48px 0", position: "relative" }}>
      <div className="container-wide">
        <ChapterHeader n="IV" title="Swear The Oath" quote="Name thyself. Declare thy threshold. Sign." />

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, maxWidth: 1100, margin: "0 auto" }}>
          <div>
            <div style={{ marginBottom: 32 }}>
              <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>✦ Your Coven Name</div>
              <input
                value={coven}
                onChange={e => setCoven(e.target.value)}
                placeholder="moss.witch"
                maxLength={24}
                style={{
                  width: "100%", padding: "16px 18px",
                  background: "var(--bone-2)", border: "2px solid var(--void)",
                  fontFamily: "var(--font-head)", fontSize: 28, color: "var(--void)",
                  outline: "none",
                }}
              />
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontStyle: "italic", opacity: 0.6, marginTop: 6 }}>
                Lowercase. Dots allowed. This is what the coven will see when you review.
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>✦ Thy Threshold Of Pain</div>
              <div style={{ background: "var(--bone-2)", border: "2px solid var(--void)", padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14 }}>Alert me when a tracked film drops at least</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: 1, color: "var(--accent)" }}>
                    −{threshold}%
                  </span>
                </div>
                <input
                  type="range" min={10} max={75} step={5}
                  value={threshold}
                  onChange={e => setThreshold(+e.target.value)}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-ui)", fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                  <span>−10% (a flinch)</span>
                  <span>−40% (a real deal)</span>
                  <span>−75% (a gift)</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>✦ Seed Thy Coven (optional)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {COVEN_SEEDS.map(u => {
                  const on = follows.includes(u.handle);
                  return (
                    <button key={u.handle} onClick={() => onToggleFollow(u.handle)} style={{
                      display: "grid", gridTemplateColumns: "40px 1fr 70px", alignItems: "center", gap: 10,
                      padding: "8px 12px",
                      background: on ? "var(--accent)" : "var(--bone-2)",
                      color: on ? "var(--accent-ink)" : "var(--void)",
                      border: "2px solid var(--void)",
                      cursor: "pointer", fontFamily: "inherit",
                    }}>
                      <Avatar name={u.name} color={u.color} size={36} />
                      <div style={{ textAlign: "left", overflow: "hidden" }}>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 700, lineHeight: 1, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>@{u.handle}</div>
                      </div>
                      <span className="caps" style={{ fontSize: 9, textAlign: "right" }}>{on ? "✓ Following" : "+ Follow"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>✦ The Blood Pact</div>
            <div style={{
              background: "var(--bone-2)",
              border: "3px double var(--void)",
              padding: "28px 28px 20px",
              position: "relative",
              fontFamily: "var(--font-serif)",
              transform: "rotate(-0.6deg)",
            }}>
              <div style={{ position: "absolute", top: 10, left: 10, right: 10, bottom: 10, border: "1px solid var(--void)", pointerEvents: "none" }} />

              <div style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1, marginBottom: 4 }}>
                ✦ Certificate ✦
              </div>
              <div style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1, marginBottom: 18, opacity: 0.7 }}>
                of Induction into the Coven
              </div>

              <p style={{ fontStyle: "italic", fontSize: 13, lineHeight: 1.55, margin: "0 0 10px" }}>
                Let it be known that on the <b>{today}</b>, the soul known as:
              </p>
              <div style={{ fontFamily: "var(--font-head)", fontSize: 24, lineHeight: 1, textAlign: "center", padding: "10px 0", borderTop: "1px solid var(--void)", borderBottom: "1px solid var(--void)", margin: "0 0 14px", color: coven ? "var(--void)" : "var(--muted)" }}>
                @{coven || "———"}
              </div>
              <p style={{ fontStyle: "italic", fontSize: 13, lineHeight: 1.55, margin: "0 0 10px" }}>
                did formally swear to watch with intention, to pay no more than necessary, and to be disturbed only when a film they love drops by <b>{threshold}% or more</b>.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "14px 0", fontSize: 11 }}>
                <CertStat big={genres.length} small="Poisons" />
                <CertStat big={stores.length} small="Storefronts" />
                <CertStat big={watchlist.length} small="Films Sown" />
              </div>

              <p style={{ fontStyle: "italic", fontSize: 13, lineHeight: 1.55, margin: "0 0 18px" }}>
                The signed hereby understands that Film Goblin makes no promises re: refunds, the arc of the moral universe, or whether the next A24 release will be any good.
              </p>

              <div style={{
                height: 56, borderBottom: "2px solid var(--void)",
                display: "flex", alignItems: "flex-end",
                cursor: signed ? "default" : "pointer",
                position: "relative",
              }} onClick={() => !signed && setSigned(true)}>
                {signed ? (
                  <span style={{
                    fontFamily: "'Caveat', var(--font-serif)", fontSize: 40, lineHeight: 1,
                    color: "var(--accent-deep)",
                    transform: "rotate(-3deg)", paddingLeft: 8,
                  }}>
                    {coven || "a signature"}
                  </span>
                ) : (
                  <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, opacity: 0.5, padding: "0 0 4px 4px" }}>
                    click here to sign →
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10 }} className="caps">
                <span>Signed, in lieu of blood</span>
                <span>{today}</span>
              </div>

              {signed && (
                <div style={{
                  position: "absolute", top: 26, right: 18,
                  transform: "rotate(12deg)",
                  border: "3px solid var(--accent)", color: "var(--accent)",
                  padding: "8px 14px", background: "rgba(255,255,255,0.4)",
                  fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1,
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}>
                  INDUCTED
                </div>
              )}
            </div>

            <button
              onClick={onEnter}
              disabled={!signed}
              className="btn btn-lg"
              style={{
                width: "100%", justifyContent: "center", marginTop: 20,
                opacity: signed ? 1 : 0.4, cursor: signed ? "pointer" : "not-allowed",
                fontSize: 18,
              }}
            >
              ✦ Enter The Coven →
            </button>
            <div style={{ textAlign: "center", marginTop: 8, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 11, opacity: 0.55 }}>
              {signed ? "Welcome. The watching begins." : "Sign the pact to enter."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CertStat({ big, small }) {
  return (
    <div style={{ textAlign: "center", border: "1px solid var(--void)", padding: "6px 4px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1, color: "var(--accent-deep)" }}>{big}</div>
      <div className="caps" style={{ fontSize: 8, marginTop: 2, opacity: 0.7 }}>{small}</div>
    </div>
  );
}

function ChapterHeader({ n, title, quote }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 36 }}>
      <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 8 }}>
        ✦ Chapter {n} ✦
      </div>
      <h2 className="display" style={{ fontSize: 88, lineHeight: 0.9, margin: "0 0 14px" }}>
        {title}
      </h2>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 18, lineHeight: 1.4, maxWidth: 620, margin: "0 auto", opacity: 0.8 }}>
        {quote}
      </p>
    </div>
  );
}
