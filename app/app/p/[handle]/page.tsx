import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfileBundle } from "@/lib/queries/profiles";
import { getCovenStateBetween } from "@/lib/queries/coven";
import { getReactionsForActivities } from "@/lib/queries/activity-reactions";
import TopNav from "@/components/TopNav";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import CovenButton from "@/components/CovenButton";
import ActivityRow from "@/components/activity/ActivityRow";
import Link from "next/link";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();
  const bundle = await getPublicProfileBundle(supabase, handle);
  if (!bundle) notFound();

  const { data: { user } } = await supabase.auth.getUser();

  let amFollowing = false;
  let coven: { state: "none" | "pending_outbound" | "pending_inbound" | "member"; requestId: string | null } =
    { state: "none", requestId: null };
  if (user && user.id !== bundle.profile.id) {
    const { data: follow } = await supabase
      .from("follows")
      .select("follower_user_id")
      .eq("follower_user_id", user.id)
      .eq("followed_user_id", bundle.profile.id)
      .maybeSingle();
    amFollowing = !!follow;
    coven = await getCovenStateBetween(supabase, user.id, bundle.profile.id);
  }

  const { data: ownActivity } = await supabase
    .from("activity")
    .select("id, kind, payload, created_at, actor_user_id")
    .eq("actor_user_id", bundle.profile.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const enrichedOwn = await enrichOwnActivity(supabase, ownActivity ?? [], bundle.profile, user?.id ?? null);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav />

      <section style={{ background: "var(--void-2)", borderBottom: "3px solid var(--void)", padding: "48px 0" }}>
        <div className="container-wide stackable" style={{ "--stack-template": "140px 1fr", "--stack-gap": "32px", alignItems: "center" } as React.CSSProperties}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Avatar name={bundle.profile.display_name ?? bundle.profile.handle} color="var(--accent)" size={140} url={bundle.profile.avatar_url} />
          </div>
          <div>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>Profile</div>
            <h1 className="h-display">
              {bundle.profile.display_name ?? bundle.profile.handle}
            </h1>
            <div className="caps" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>@{bundle.profile.handle}</div>
            {bundle.profile.bio && <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontStyle: "italic", marginTop: 20, maxWidth: 560 }}>{bundle.profile.bio}</p>}
            {user && user.id !== bundle.profile.id && (
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <FollowButton userId={bundle.profile.id} handle={bundle.profile.handle} initialFollowing={amFollowing} />
                <CovenButton targetUserId={bundle.profile.id} targetHandle={bundle.profile.handle} initialState={coven.state} initialRequestId={coven.requestId} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ padding: "48px 0", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Their Coven</div>
          {bundle.coven.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No coven yet.</div>
          ) : (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {bundle.coven.map(m => (
                <Link key={m.id} href={`/p/${encodeURIComponent(m.handle)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none" }}>
                  <Avatar name={m.display_name ?? m.handle} color="var(--accent)" size={56} url={m.avatar_url} />
                  <div className="caps" style={{ fontSize: 10 }}>@{m.handle}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Recent Activity</div>
          {enrichedOwn.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>Nothing yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 0 }}>
              {enrichedOwn.map(item => <ActivityRow key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

async function enrichOwnActivity(supabase: any, rows: any[], profile: any, viewerId: string | null) {
  if (rows.length === 0) return [];
  const filmIds = Array.from(new Set(rows.map(r => r.payload?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(rows.map(r => r.payload?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(rows.map(r => r.payload?.list_id).filter(Boolean)));

  const [films, recipients, lists, reactionsMap] = await Promise.all([
    filmIds.length ? supabase.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] }),
    recipientIds.length ? supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] }),
    listIds.length ? supabase.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] }),
    getReactionsForActivities(supabase, rows.map(r => r.id), viewerId),
  ]);

  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));

  const actor = { id: profile.id, handle: profile.handle, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const out: any[] = [];
  for (const r of rows) {
    const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
    const base = { id: r.id, created_at: r.created_at, actor, reactions };
    const film = r.payload?.film_id ? filmMap.get(r.payload.film_id) : undefined;
    const recipient = r.payload?.to_user_id ? recipMap.get(r.payload.to_user_id) : undefined;
    const list = r.payload?.list_id ? listMap.get(r.payload.list_id) : undefined;
    switch (r.kind) {
      case "recommendation_sent": if (film && recipient) out.push({ ...base, kind: "recommendation_sent", film, recipient, note: r.payload.note ?? "" }); break;
      case "review_published":   if (film) out.push({ ...base, kind: "review_published", film, title: r.payload.title ?? "", pullquote: r.payload.pullquote ?? null }); break;
      case "watchlist_added":    if (film) out.push({ ...base, kind: "watchlist_added", film }); break;
      case "list_created":       if (list) out.push({ ...base, kind: "list_created", list }); break;
      case "list_film_added":    if (list && film) out.push({ ...base, kind: "list_film_added", list, film }); break;
      case "coven_joined":       if (recipient) out.push({ ...base, kind: "coven_joined", other: recipient }); break;
    }
  }
  return out;
}
