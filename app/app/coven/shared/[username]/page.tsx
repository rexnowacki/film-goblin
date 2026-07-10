import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getSharedTaste } from "@/lib/queries/shared-taste";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";

export default async function SharedTastePage({ params }: { params: Promise<{ username: string }> }) {
  const user = await getServerUser();
  const { username } = await params;
  if (!user) redirect(`/auth/signin?redirect=${encodeURIComponent(`/coven/shared/${username}`)}`);
  const client = await createClient();
  const summary = await getSharedTaste(client, user.id, decodeURIComponent(username));
  if (!summary) notFound();
  return (
    <div style={{ minHeight: "100dvh", background: "var(--void)", color: "var(--bone)" }}>
      <TopNav current="coven" /><BottomNav current="coven" />
      <main className="container" style={{ padding: "48px var(--container-pad) 96px" }}>
        <div className="eyebrow" style={{ color: "var(--accent)" }}>Shared taste</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "18px 0" }}>
          <Avatar name={summary.person.username} url={summary.person.avatar_url} color="var(--accent)" size={56} />
          <h1 className="h-display" style={{ margin: 0 }}>You + @{summary.person.username}</h1>
        </div>
        {summary.traits.length > 0 && <p className="shared-taste-traits">{summary.traits.join(" · ")}</p>}
        {summary.sharedFilms.length > 0 && <section><h2 className="eyebrow">Films you both anointed</h2>{summary.sharedFilms.map(film => <Link key={film.id} prefetch={false} href={`/film/${film.id}`} className="pill-row">{film.title}</Link>)}</section>}
        <div style={{ marginTop: 28 }}><Link prefetch={false} href="/films" className="btn">Recommend a film →</Link></div>
      </main>
    </div>
  );
}
