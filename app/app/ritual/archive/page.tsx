import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getArchivedRituals } from "@/lib/queries/ritual";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import FilmPoster from "@/components/FilmPoster";

export const dynamic = "force-dynamic";

export default async function RitualArchivePage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?redirect=/ritual/archive");

  const supabase = await createClient();
  const past = await getArchivedRituals(supabase, 50);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="ritual" />
      <BottomNav current="ritual" />

      <div className="container-wide" style={{ padding: "20px var(--container-pad) 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 18 }}>
          <Link href="/ritual" style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
            ← Current ritual
          </Link>
          <h1 className="h-display" style={{ margin: 0, fontSize: 28 }}>Past Rituals</h1>
        </div>

        {past.length === 0 ? (
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
            No archived rituals yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {past.map(r => (
              <li key={r.pick_id}>
                <Link
                  href={`/ritual/${r.pick_id}`}
                  style={{
                    display: "flex", gap: 14, alignItems: "center",
                    padding: 12, border: "1px solid #2a2a2a", background: "var(--void-2, #141414)",
                    textDecoration: "none", color: "var(--bone)",
                  }}
                >
                  <FilmPoster
                    film={r.film}
                    size="xs"
                    imageSizes="60px"
                    style={{ width: 54, height: 81, aspectRatio: "2 / 3" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="eyebrow" style={{ color: "var(--muted)", fontSize: 9, letterSpacing: "0.12em", marginBottom: 4 }}>
                      {formatTucson(r.effective_at)}
                    </div>
                    <div style={{ fontFamily: "var(--font-head)", fontSize: 18, color: "var(--bone)", lineHeight: 1.1 }}>
                      {r.film.title}
                    </div>
                    <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {r.film.director} · {r.film.year}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em",
                    flexShrink: 0,
                  }}>
                    {r.message_count} {r.message_count === 1 ? "voice" : "voices"} →
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTucson(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
