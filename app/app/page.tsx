import Link from "next/link";
import { getLandingMarquee } from "@/lib/supabase/cached";
import FilmPoster from "@/components/FilmPoster";
import PriceDrop from "@/components/PriceDrop";
import HalftoneBar from "@/components/HalftoneBar";

export default async function LandingPage() {
  const marqueeFilms = await getLandingMarquee();

  // Double the marquee for seamless loop
  const marqueeStrip = [...marqueeFilms, ...marqueeFilms];

  return (
    <div style={{ background: "var(--bone)", color: "var(--void)", minHeight: "100dvh", fontFamily: "var(--font-ui)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "2px solid var(--void)", background: "var(--bone)", position: "relative", paddingTop: "env(safe-area-inset-top)" }} className="grain-light">
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <span className="eyebrow" style={{ marginLeft: 6, opacity: 0.6 }}>Est. 2026 · Issue nº1</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Link href="/films" className="caps" style={{ fontSize: 12, textDecoration: "none", color: "var(--void)" }}>Films</Link>
            <Link href="/lists" className="caps" style={{ fontSize: 12, textDecoration: "none", color: "var(--void)" }}>Lists</Link>
            <Link href="/auth/signin" className="btn btn-dark btn-sm" style={{ textDecoration: "none" }}>Sign In</Link>
          </div>
        </div>
      </div>

      {/* HERO */}
      <section style={{ borderBottom: "2px solid var(--void)", position: "relative", overflow: "hidden" }} className="grain-light">
        <div className="container-wide" style={{ padding: "48px 32px 32px", position: "relative" }}>
          <div className="stackable" style={{ "--stack-template": "1.4fr 1fr", "--stack-gap": "40px", alignItems: "stretch" } as React.CSSProperties}>
            <div>
              <div className="stamp" style={{ background: "var(--void)", color: "var(--highlight)", borderColor: "var(--void)", marginBottom: 20 }}>
                ✦ Watch Weirder ✦
              </div>
              <h1 className="display" style={{ fontSize: "clamp(80px, 11vw, 180px)", margin: 0, color: "var(--void)", lineHeight: 0.82, letterSpacing: "-0.02em" }}>
                FILM
                <br />
                <span style={{ color: "var(--accent)", position: "relative", display: "inline-block" }}>GOBLIN</span>
              </h1>
              <p className="head" style={{ fontSize: 30, lineHeight: 1.12, margin: "28px 0 12px", maxWidth: 560 }}>
                A covenant of cinephiles, hunting cheap movies on Apple TV.
              </p>
              <p style={{ fontSize: 16, maxWidth: 520, lineHeight: 1.5, margin: "0 0 28px" }}>
                Scry the marketplace. Summon a deal when a film drops in price. Recommend it to a friend before the moon wanes.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link href="/auth/signup" className="btn btn-lg" style={{ textDecoration: "none" }}>✦ Join The Coven</Link>
                <Link href="/films" className="btn btn-outline btn-lg" style={{ textDecoration: "none" }}>Browse Films</Link>
              </div>
            </div>
            <div className="hero-posters" style={{ position: "relative", minHeight: 560 }}>
              {marqueeFilms.slice(0, 3).map((f, i) => (
                <div key={f.id} className="hero-poster" style={{
                  position: "absolute",
                  top: i === 0 ? 20 : i === 1 ? 180 : "auto",
                  right: i === 0 ? 40 : i === 2 ? 0 : "auto",
                  left: i === 1 ? 0 : "auto",
                  bottom: i === 2 ? 20 : "auto",
                  transform: `rotate(${[-4, 3, 5][i]}deg)`,
                }}>
                  <FilmPoster film={f} size={i === 0 ? "lg" : "md"} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ height: 18, background: "var(--void)", color: "var(--accent)", position: "relative" }}>
          <HalftoneBar color="currentColor" height={18} />
        </div>
      </section>

      {/* MARQUEE */}
      <section style={{ background: "var(--void)", color: "var(--bone)", borderBottom: "2px solid var(--void)", padding: "40px 0", overflow: "hidden" }}>
        <div className="container-wide" style={{ marginBottom: 20 }}>
          <h2 className="h-display">
            Deals, Fresh <span style={{ color: "var(--accent)", fontStyle: "italic" }}>From The Pit</span>
          </h2>
        </div>
        <div style={{ overflow: "hidden", padding: "20px 0", position: "relative" }}>
          <div className="marquee" style={{ gap: 24 }}>
            {marqueeStrip.map((f, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                <FilmPoster film={f} size="md" />
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
