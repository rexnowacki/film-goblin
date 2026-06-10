import Link from "next/link";
import { getLandingFeed, getRecentlySummoned } from "@/lib/supabase/cached";
import FilmPoster from "@/components/FilmPoster";
import HalftoneBar from "@/components/HalftoneBar";
import LandingFeedCard from "@/components/LandingFeedCard";

// Pre-login landing page. Middleware redirects authenticated users from "/"
// to /home, so this only ever renders logged-out.
export default async function LandingPage() {
  // Feed failures degrade to the hidden-card state for this request only —
  // the cached wrapper propagates errors uncached so the next request retries.
  const [feedRows, summoned] = await Promise.all([
    getLandingFeed().catch(err => {
      console.error("[landing] feed query failed, hiding card:", err);
      return [];
    }),
    getRecentlySummoned(),
  ]);
  const hasFeed = feedRows.length > 0;

  // Double the strip for a seamless marquee loop
  const marqueeStrip = [...summoned, ...summoned];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh", fontFamily: "var(--font-ui)" }}>
      {/* Top bar */}
      <div style={{ borderBottom: "2px solid var(--bone)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="container-wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px var(--container-pad)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Film <span style={{ color: "var(--accent)" }}>Goblin</span>
            </div>
            <span className="eyebrow desktop-only" style={{ marginLeft: 6, color: "var(--muted)" }}>Est. 2026 · Issue nº1</span>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <Link href="/films" className="caps" style={{ fontSize: 12 }}>Films</Link>
            <Link href="/lists" className="caps" style={{ fontSize: 12 }}>Lists</Link>
            <Link href="/auth/signin" className="btn btn-outline btn-sm">Sign In</Link>
          </div>
        </div>
      </div>

      {/* HERO — pitch + live feed card */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div className="container-wide" style={{ padding: "48px var(--container-pad) 44px" }}>
          <div
            className="stackable"
            style={{ "--stack-template": hasFeed ? "1.15fr 1fr" : "1fr", "--stack-gap": "40px", alignItems: "center" } as React.CSSProperties}
          >
            <div style={hasFeed ? undefined : { maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
              <div className="stamp" style={{ color: "var(--highlight)", marginBottom: 20 }}>✦ Watch Weirder ✦</div>
              <h1 className="display" style={{ fontSize: "clamp(64px, 11vw, 160px)", margin: 0, lineHeight: 0.82, letterSpacing: "-0.02em" }}>
                FILM
                <br />
                <span style={{ color: "var(--accent)" }}>GOBLIN</span>
              </h1>
              <p className="head" style={{ fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.12, margin: "26px 0 12px", maxWidth: hasFeed ? 460 : undefined }}>
                A coven for people who take movies seriously.
              </p>
              <p style={{ fontSize: 15, maxWidth: hasFeed ? 440 : 480, lineHeight: 1.55, margin: hasFeed ? "0 0 28px" : "0 auto 28px", color: "var(--bone-2)" }}>
                Log what you watch. Press films on your friends. Keep a watchlist
                that hunts price drops on Apple TV while you sleep.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: hasFeed ? undefined : "center" }}>
                <Link href="/auth/signup" className="btn btn-lg">✦ Join The Coven</Link>
                <Link href="/films" className="btn btn-outline btn-lg">Browse Films</Link>
              </div>
            </div>
            {hasFeed && <LandingFeedCard rows={feedRows} />}
          </div>
        </div>
        <HalftoneBar color="var(--accent)" height={18} />
      </section>

      {/* THE RITES — bone band */}
      <section className="grain-light" style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "2px solid var(--void)" }}>
        <div className="container-wide landing-rites" style={{ padding: "30px var(--container-pad)" }}>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite I</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>The Feed</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Every watch, rating, and review your coven logs — one haunted scroll.
            </p>
          </div>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite II</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>Recommendations</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Press a film on a friend. They&apos;ll see it until they watch it. No escape.
            </p>
          </div>
          <div className="landing-rite">
            <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 6 }}>⛧ Rite III</div>
            <div className="head" style={{ fontSize: 22, marginBottom: 6 }}>The Hunt</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: "var(--ink)" }}>
              Your watchlist stalks Apple TV prices and howls when one drops.
            </p>
          </div>
        </div>
      </section>

      {/* RECENTLY SUMMONED — marquee */}
      <section style={{ background: "var(--void-2)", padding: "28px 0 32px", overflow: "hidden" }}>
        <div className="container-wide" style={{ marginBottom: 18 }}>
          <h2 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Recently <span style={{ color: "var(--accent)", fontStyle: "italic" }}>Summoned</span>
          </h2>
        </div>
        <div style={{ overflow: "hidden", padding: "10px 0" }}>
          <div className="marquee" style={{ gap: 24 }}>
            {marqueeStrip.map((f, i) => (
              <FilmPoster key={`${f.id}-${i}`} film={f} size="md" />
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ borderTop: "2px solid var(--bone)", textAlign: "center", padding: "44px var(--container-pad) 56px" }}>
        <div className="head" style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontStyle: "italic", marginBottom: 22 }}>
          The moon is right. The prices are wrong.
        </div>
        <Link href="/auth/signup" className="btn btn-lg">✦ Join The Coven</Link>
        <div className="eyebrow" style={{ color: "var(--muted)", marginTop: 28 }}>
          Film Goblin · Est. 2026 · Printed in a garage
        </div>
      </section>
    </div>
  );
}
