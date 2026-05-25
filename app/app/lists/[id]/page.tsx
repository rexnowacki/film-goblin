import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import {
  getList,
  getListFilms,
  getListOwner,
  getMySubscribedLists,
} from "@/lib/queries/lists";
import TopNav from "@/components/nav/TopNav";
import BottomNav from "@/components/nav/BottomNav";
import FilmPoster from "@/components/FilmPoster";
import Avatar from "@/components/ui/Avatar";
import SubscribeButton from "@/components/SubscribeButton";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Film Goblin" };
  const supabase = await createClient();
  const list = await getList(supabase, id);
  if (!list) return { title: "Film Goblin" };
  const description = list.description?.trim() || "A grimoire of films.";
  return {
    title: `${list.title} — Film Goblin`,
    description,
    openGraph: { title: list.title, description, type: "website" },
  };
}

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const user = await getServerUser();
  const list = await getList(supabase, id);
  if (!list) notFound();

  const [films, owner, mySubs] = await Promise.all([
    getListFilms(supabase, list.id),
    getListOwner(supabase, list.owner_user_id),
    user ? getMySubscribedLists(supabase, user.id).then(ids => new Set(ids)) : Promise.resolve(new Set<string>()),
  ]);

  const isOwner = !!user && user.id === list.owner_user_id;
  const subscribed = mySubs.has(list.id);
  const filmCount = films.length;

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="lists" showBack />
      <BottomNav current="lists" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "32px 0 28px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 8, color: "var(--accent-deep)" }}>
            {list.is_official ? "✦ Official Grimoire" : "Grimoire"}
          </div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 56px)", margin: 0, lineHeight: 0.92 }}>
            {list.title}.
          </h1>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: "var(--font-ui)", fontSize: 13 }}>
            {owner && (
              <Link
                prefetch={false}
                href={`/p/${owner.username}`}
                style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}
              >
                <Avatar name={owner.display_name || owner.username} url={owner.avatar_url} size={28} />
                <span style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
                  @{owner.username}
                </span>
              </Link>
            )}
            <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
            <span style={{ opacity: 0.75 }}>{filmCount} {filmCount === 1 ? "film" : "films"}</span>
          </div>
          {list.description && (
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontStyle: "italic", lineHeight: 1.4, margin: "20px 0 0", maxWidth: 720 }}>
              {list.description}
            </p>
          )}
          <div style={{ marginTop: 22 }}>
            {isOwner ? (
              <span className="caps" style={{ fontSize: 11, opacity: 0.65 }}>Your grimoire</span>
            ) : user ? (
              <SubscribeButton listId={list.id} initialSubscribed={subscribed} />
            ) : (
              <Link
                href={`/auth/signin?next=/lists/${list.id}`}
                className="caps"
                style={{ fontSize: 11, color: "var(--void)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
              >
                Sign in to subscribe
              </Link>
            )}
          </div>
        </div>
      </section>

      <section style={{ padding: "32px 0 60px" }}>
        <div className="container-wide">
          {filmCount === 0 ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)" }}>
              {isOwner
                ? "Empty grimoire. Add films from any film's page."
                : "Nothing in this grimoire yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--grid-gap)" }}>
              {films.map(r => (
                <Link
                  key={r.film.id}
                  prefetch={false}
                  href={`/film/${r.film.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <FilmPoster
                    film={r.film as never}
                    size="md"
                    style={{ width: "100%", height: "auto", aspectRatio: "2/3" }}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
