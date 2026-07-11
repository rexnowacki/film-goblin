import Link from "next/link";

export default function SocialPromise() {
  return (
    <section className="social-promise" aria-labelledby="social-promise-title">
      <div className="social-promise__topline">
        <div className="eyebrow" id="social-promise-title">What a coven unlocks</div>
        <Link className="social-promise__gazings" href="/coven/gazings" prefetch={false}>Your gazings →</Link>
      </div>
      <ul>
        <li><strong>Summon</strong> people to a shared gazing.</li>
        <li><strong>Recommend</strong> a film directly to someone.</li>
        <li><strong>Compare taste</strong> with people you have actually bonded with.</li>
        <li><strong>Plan a watch</strong> and return for the verdict.</li>
      </ul>
    </section>
  );
}
