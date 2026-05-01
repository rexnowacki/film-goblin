import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
    <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
      Nothing watched yet. Mark a film as watched from any film&rsquo;s page.
      <div style={{ marginTop: 24 }}>
        <Link href="/films" className="btn btn-lg">Browse the archive →</Link>
      </div>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ rate?: string }>;
}

export default async function WatchedPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/watched");
  const { rate } = await searchParams;

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
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="watched" />
      <BottomNav current="watched" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            Your <em style={{ color: "var(--accent)" }}>Diary</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          {rows.length === 0 ? (
            <WatchedEmpty />
          ) : (
            <>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24, fontFamily: "var(--font-ui)", fontSize: 13 }}>
                <span>
                  <span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>Total</span>
                  <strong style={{ color: "var(--accent)" }}>{stats.total}</strong>
                </span>
                <span>
                  <span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>{new Date().getUTCFullYear()}</span>
                  <strong style={{ color: "var(--accent)" }}>{stats.thisYear}</strong>
                </span>
                {topName && (
                  <span>
                    <span className="caps" style={{ fontSize: 10, color: "var(--muted)", marginRight: 6 }}>Most watched</span>
                    <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{topName.film.title}</em>
                    <span style={{ color: "var(--muted)" }}> &times;{topName.count}</span>
                  </span>
                )}
              </div>

              {stats.topFilms.length > 0 && (
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, marginBottom: 24 }}>
                  {stats.topFilms.map((t, i) => (
                    <Link key={t.film.id} href={`/film/${t.film.id}`} style={{ flexShrink: 0, textDecoration: "none", color: "inherit" }}>
                      <Image
                        src={t.film.artwork_url}
                        alt={t.film.title}
                        width={70}
                        height={105}
                        style={{ display: "block", objectFit: "cover", border: "1px solid var(--void)" }}
                        priority={i < 3}
                      />
                      <div className="caps" style={{ fontSize: 10, color: "var(--accent)", marginTop: 4, textAlign: "center" }}>&times;{t.count}</div>
                    </Link>
                  ))}
                </div>
              )}

              <div>
                {grouped.map(g => (
                  <div key={g.key} style={{ marginBottom: 28 }}>
                    <div className="caps" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--muted)" }}>
                      {monthHeader(g.key)}
                    </div>
                    {g.rows.map(r => <DiaryRow key={r.id} row={r} initialOpen={rate === r.id} />)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
