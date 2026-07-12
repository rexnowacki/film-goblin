import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getWatchedDiary, getWatchedStats } from "@/lib/queries/watched";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import DiaryRow from "./DiaryRow";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthKey(date: string): string {
  // YYYY-MM-DD → "YYYY-MM"
  return date.slice(0, 7);
}

function monthHeader(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function WatchedEmpty() {
  return (
    <div className="collection-empty">
      <div className="collection-empty__mark" aria-hidden="true">◐</div>
      <div className="eyebrow">No scratches in the ledger</div>
      <h2>Nothing witnessed yet.</h2>
      <p>Log the first film and the diary will begin keeping your nights, verdicts, and dangerous little notes.</p>
      <Link href="/films" className="btn btn-lg">Find the first one →</Link>
    </div>
  );
}

export default async function WatchedPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/watched");
  const supabase = await createClient();

  const [rows, stats] = await Promise.all([
    getWatchedDiary(supabase, user.id),
    getWatchedStats(supabase, user.id),
  ]);

  // Group by month-key, preserving newest-first order.
  const grouped: Array<{ key: string; rows: typeof rows }> = [];
  for (const row of rows) {
    const key = monthKey(row.watched_at);
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      grouped.push({ key, rows: [row] });
    }
  }

  const topName = stats.topFilms[0];

  return (
    <div className="collection-page collection-page--diary">
      <TopNav current="watched" />
      <BottomNav current="watched" />

      <section className="collection-hero">
        <div className="container-wide collection-hero__inner">
          <div className="collection-hero__copy">
            <div className="eyebrow">What you saw · what survived</div>
            <h1>Your <em>Diary</em>.</h1>
            <p>A record of every watch, every verdict, and every note you scrawled before the credits went cold.</p>
          </div>
          <div className="collection-hero__tally" aria-label={`${stats.total} films watched`}>
            <strong>{stats.total}</strong>
            <span>{stats.total === 1 ? "watch logged" : "watches logged"}</span>
          </div>
        </div>
      </section>

      <section className="collection-content">
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchedEmpty />
          ) : (
            <>
              <div className="diary-ledger">
                <span><small>Total watches</small><strong>{stats.total}</strong></span>
                <span><small>{new Date().getUTCFullYear()}</small><strong>{stats.thisYear}</strong></span>
                {topName && (
                  <span>
                    <small>Most summoned</small>
                    <strong className="diary-ledger__film">{topName.film.title} <i>&times;{topName.count}</i></strong>
                  </span>
                )}
              </div>

              {stats.topFilms.length > 0 && (
                <div className="diary-repeats" aria-label="Most watched films">
                  <div className="diary-repeats__heading">
                    <span className="eyebrow">Repeat hauntings</span>
                    <strong>The films that came back</strong>
                  </div>
                  <div className="diary-repeats__rail">
                  {stats.topFilms.map((t, i) => (
                    <Link key={t.film.id} href={`/film/${t.film.id}`}>
                      <Image
                        src={t.film.artwork_url}
                        alt={t.film.title}
                        width={70}
                        height={105}
                        style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
                        priority={i < 3}
                      />
                      <div className="caps">&times;{t.count}</div>
                    </Link>
                  ))}
                  </div>
                </div>
              )}

              <div className="diary-months">
                {grouped.map(g => (
                  <section key={g.key} className="diary-month">
                    <h2>
                      {monthHeader(g.key)}
                    </h2>
                    {g.rows.map(r => <DiaryRow key={r.id} row={r} />)}
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
