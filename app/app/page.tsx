import Link from "next/link";
import { getLandingFeed, getRecentlySummoned } from "@/lib/supabase/cached";
import FilmPoster from "@/components/FilmPoster";
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
    getRecentlySummoned().catch(err => {
      console.error("[landing] summoned query failed, hiding marquee:", err);
      return [];
    }),
  ]);
  const hasFeed = feedRows.length > 0;

  // Double the strip for a seamless marquee loop
  const marqueeStrip = [...summoned, ...summoned];

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="container-wide landing-nav__inner">
          <div className="landing-nav__identity">
            <Link href="/" className="landing-wordmark">Film<span>Goblin</span></Link>
            <span className="eyebrow desktop-only">Watch weirder · Est. 2026</span>
          </div>
          <div className="landing-nav__links">
            <Link href="/films" className="caps">Discover</Link>
            <Link href="/lists" className="caps desktop-only">Lists</Link>
            <Link href="/auth/signin" className="btn btn-outline btn-sm">Enter</Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="container-wide landing-hero__inner">
          <div
            className={`landing-hero__grid${hasFeed ? "" : " landing-hero__grid--solo"}`}
          >
            <div className="landing-hero__copy">
              <div className="eyebrow">A coven for the cinematically afflicted</div>
              <h1>Watch<br /><em>weirder</em>.</h1>
              <p className="landing-hero__declaration">Movies are better when somebody else won&rsquo;t stop talking about them.</p>
              <p className="landing-hero__body">
                Log what you watch. Press films on your friends. Hoard what you want. Let the pit stalk Apple TV prices while you sleep.
              </p>
              <div className="landing-hero__actions">
                <Link href="/auth/signup" className="btn btn-lg">Join the coven →</Link>
                <Link href="/films" className="btn btn-outline btn-lg">Browse the archive</Link>
              </div>
              <div className="landing-hero__proof"><span>◉</span> Real watches. Real recommendations. No percentage pretending to know your soul.</div>
            </div>
            {hasFeed && <div className="landing-hero__feed"><div className="eyebrow">Happening in the pit</div><LandingFeedCard rows={feedRows} /></div>}
          </div>
        </div>
      </section>

      <section className="landing-rites-band grain-light">
        <div className="container-wide landing-rites">
          <div className="landing-rite">
            <div className="landing-rite__number">01</div><div className="eyebrow">Keep the record</div><h2>Log every watch</h2><p>Your diary remembers the date, verdict, notes, and films that keep coming back.</p>
          </div>
          <div className="landing-rite">
            <div className="landing-rite__number">02</div><div className="eyebrow">Summon the coven</div><h2>Press films on friends</h2><p>Recommendations linger until answered. Plan a shared gazing when the night is right.</p>
          </div>
          <div className="landing-rite">
            <div className="landing-rite__number">03</div><div className="eyebrow">Feed the hoard</div><h2>Hunt the price drop</h2><p>Keep a wanted list. Film Goblin watches Apple TV and howls when the tithe falls.</p>
          </div>
        </div>
      </section>

      {/* RECENTLY SUMMONED — marquee */}
      {summoned.length > 0 && (
        <section className="landing-summoned">
          <div className="container-wide landing-section-heading">
            <div><div className="eyebrow">Fresh from the dark</div><h2>Recently <em>summoned</em>.</h2></div>
            <Link href="/films" className="caps">Enter the archive →</Link>
          </div>
          <div className="landing-summoned__rail">
            <div className="marquee">
              {marqueeStrip.map((f, i) => (
                <FilmPoster key={`${f.id}-${i}`} film={f} size="md" />
              ))}
            </div>
          </div>
        </section>
      )}

      <section aria-label="Join Film Goblin" className="landing-final">
        <div className="eyebrow">The moon is right</div><h2>The prices are wrong.<br /><em>Come inside.</em></h2>
        <Link href="/auth/signup" className="btn btn-lg">Begin the initiation →</Link>
        <div className="landing-final__footer">Film Goblin · Est. 2026 · Printed in a garage</div>
      </section>
    </div>
  );
}
