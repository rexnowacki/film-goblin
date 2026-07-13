import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getPublicProfileBundle } from "@/lib/queries/profiles";
import { getCovenStateBetween } from "@/lib/queries/coven";
import { getReactionsForActivities } from "@/lib/queries/activity-reactions";
import { getCommentSummariesForActivities } from "@/lib/queries/activity-comments";
import { getProfileBadges } from "@/lib/queries/badges";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import CovenButton from "@/components/CovenButton";
import RoleBadge from "@/components/RoleBadge";
import ActivityRow from "@/components/activity/ActivityRow";
import InviteBanner from "@/components/InviteBanner";
import ShareProfileButton from "@/components/ShareProfileButton";
import ProfileCollectionTabs, {
  type ProfileFilm,
  type ProfileReview,
} from "@/components/profile/ProfileCollectionTabs";
import { formatProfileJoinedDate, formatProfileStat, getVerifiedProfileRole } from "@/lib/profile-page";
import ProfileCovenRoster from "@/components/profile/ProfileCovenRoster";
import ProfileRelics from "@/components/profile/ProfileRelics";
import Link from "next/link";

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { username } = await params;
  const { invite } = await searchParams;
  const isInvited = invite === "1";
  const supabase = await createClient();
  const bundle = await getPublicProfileBundle(supabase, username);
  if (!bundle) notFound();

  const user = await getServerUser();

  let coven: { state: "none" | "pending_outbound" | "pending_inbound" | "member"; requestId: string | null } =
    { state: "none", requestId: null };
  if (user && user.id !== bundle.profile.id) {
    coven = await getCovenStateBetween(supabase, user.id, bundle.profile.id);
  }

  const isOwner = user?.id === bundle.profile.id;
  const canViewWatched = Boolean(user && (isOwner || coven.state === "member"));
  const filmFields = "id, title, director, year, artwork_url";
  const [activityResult, watchlistResult, watchedResult, reviewsResult, staffResult, profileBadges] = await Promise.all([
    supabase
      .from("activity")
      .select("id, kind, payload, created_at, actor_user_id")
      .eq("actor_user_id", bundle.profile.id)
      .order("created_at", { ascending: false })
      .limit(10),
    isOwner
      ? supabase
          .from("watchlists")
          .select(`film:films!inner(${filmFields})`, { count: "exact" })
          .eq("user_id", bundle.profile.id)
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], count: null, error: null }),
    canViewWatched
      ? supabase
          .from("watched")
          .select(`film:films!inner(${filmFields})`, { count: "exact" })
          .eq("user_id", bundle.profile.id)
          .order("watched_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(24)
      : Promise.resolve({ data: [], count: null, error: null }),
    supabase
      .from("reviews")
      .select(`id, title, pullquote, film:films!inner(${filmFields})`, { count: "exact" })
      .eq("author_user_id", bundle.profile.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(12),
    supabase
      .from("staff")
      .select("role")
      .eq("user_id", bundle.profile.id)
      .maybeSingle(),
    getProfileBadges(supabase, bundle.profile.id),
  ]);

  const watchlistFilms = uniqueProfileFilms((watchlistResult.data ?? []).map(row => normalizeProfileFilm(row.film)));
  const watchedFilms = uniqueProfileFilms((watchedResult.data ?? []).map(row => normalizeProfileFilm(row.film)));
  const reviews: ProfileReview[] = (reviewsResult.data ?? []).flatMap(row => {
    const film = normalizeProfileFilm(row.film);
    return film ? [{ id: row.id, title: row.title, pullquote: row.pullquote, film }] : [];
  });
  const ownActivity = activityResult.data ?? [];
  const enrichedOwn = await enrichOwnActivity(supabase, ownActivity ?? [], bundle.profile, user?.id ?? null);
  const displayName = bundle.profile.display_name ?? bundle.profile.username;
  const isAdmin = staffResult.data?.role === "admin";
  const verifiedRole = getVerifiedProfileRole(bundle.profile.role, staffResult.data?.role);
  const stats = [
    { label: "Watched", value: canViewWatched ? watchedResult.count ?? watchedFilms.length : null },
    { label: "Watchlist", value: isOwner ? watchlistResult.count ?? watchlistFilms.length : null },
    { label: "Reviews", value: reviewsResult.count ?? reviews.length },
    { label: "Coven", value: bundle.coven.length },
  ];

  return (
    <div className="profile-page">
      {!user && isInvited && <InviteBanner inviterUsername={bundle.profile.username} />}
      <TopNav current="coven" />
      <BottomNav current="coven" />

      <section className="profile-hero">
        <div className="profile-shell profile-hero__inner">
          <div className="profile-avatar-ring">
            <Avatar name={displayName} color="var(--accent)" size={158} url={bundle.profile.avatar_url} />
          </div>
          <div className="profile-identity">
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 10 }}>Goblin profile</div>
            <h1>
              <span>{displayName}</span>
              <RoleBadge role={verifiedRole} size={28} title={isAdmin ? "Film Goblin admin" : undefined} />
            </h1>
            <div className="profile-handle">@{bundle.profile.username}</div>
            {bundle.profile.bio && <p className="profile-hero-bio">{bundle.profile.bio}</p>}
            {user && user.id !== bundle.profile.id && (
              <div className="profile-actions">
                <CovenButton targetUserId={bundle.profile.id} targetUsername={bundle.profile.username} initialState={coven.state} initialRequestId={coven.requestId} />
              </div>
            )}
            {isOwner && (
              <div className="profile-actions">
                <Link prefetch={false} href="/settings#profile" className="btn-outline">Edit profile</Link>
                <ShareProfileButton
                  username={bundle.profile.username}
                  displayName={displayName}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="profile-shell profile-main">
        <div className="profile-stats" aria-label="Profile totals">
          {stats.map(stat => (
            <div className="profile-stat" key={stat.label}>
              <strong>{formatProfileStat(stat.value)}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="profile-divider" aria-hidden="true"><span>✦</span></div>

        <section className="profile-section">
          <div className="profile-section__topline"><div className="eyebrow">Bio</div></div>
          <div className="profile-bio-card">
            {bundle.profile.bio || "No confession scratched into the ledger."}
          </div>
          <div className="profile-joined">⌖ {formatProfileJoinedDate(bundle.profile.created_at)}</div>
        </section>

        <section className="profile-section">
          <div className="profile-section__topline">
            <div className="eyebrow">Relics</div>
          </div>
          <ProfileRelics badges={profileBadges} />
        </section>

        <section className="profile-section">
          <ProfileCovenRoster members={bundle.coven} isOwner={isOwner} />
        </section>

        <ProfileCollectionTabs
          watchlist={watchlistFilms}
          watched={watchedFilms}
          reviews={reviews}
          lists={bundle.lists}
          watchlistPrivate={!isOwner}
          watchedPrivate={!canViewWatched}
        />

        <section className="profile-activity">
          <div className="profile-section__topline"><div className="eyebrow">Recent Activity</div></div>
          {enrichedOwn.length === 0 ? (
            <div className="profile-collection-empty">Nothing has stirred here yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 0 }}>
              {enrichedOwn.map(item => <ActivityRow key={item.id} item={item} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function normalizeProfileFilm(raw: unknown): ProfileFilm | null {
  const film = Array.isArray(raw) ? raw[0] : raw;
  if (!film || typeof film !== "object") return null;
  const value = film as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.year !== "number") return null;
  return {
    id: value.id,
    title: value.title,
    director: typeof value.director === "string" ? value.director : "",
    year: value.year,
    artwork_url: typeof value.artwork_url === "string" ? value.artwork_url : null,
  };
}

function uniqueProfileFilms(films: Array<ProfileFilm | null>): ProfileFilm[] {
  const seen = new Set<string>();
  return films.filter((film): film is ProfileFilm => {
    if (!film || seen.has(film.id)) return false;
    seen.add(film.id);
    return true;
  }).slice(0, 12);
}

async function enrichOwnActivity(supabase: any, rows: any[], profile: any, viewerId: string | null) {
  if (rows.length === 0) return [];
  const filmIds = Array.from(new Set(rows.map(r => r.payload?.film_id).filter(Boolean)));
  const recipientIds = Array.from(new Set(rows.map(r => r.payload?.to_user_id).filter(Boolean)));
  const listIds = Array.from(new Set(rows.map(r => r.payload?.list_id).filter(Boolean)));
  const watchLoggedFilmIds = Array.from(new Set(
    rows
      .filter(r => r.kind === "watch_logged")
      .map(r => r.payload?.film_id)
      .filter(Boolean)
  ));

  const [films, recipients, lists, reactionsMap, commentsMap, viewerWatchedRows] = await Promise.all([
    filmIds.length ? supabase.from("films").select("id, title, director, year, artwork_url, itunes_url").in("id", filmIds) : Promise.resolve({ data: [] }),
    recipientIds.length ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", recipientIds) : Promise.resolve({ data: [] }),
    listIds.length ? supabase.from("lists").select("id, title").in("id", listIds) : Promise.resolve({ data: [] }),
    getReactionsForActivities(supabase, rows.map(r => r.id), viewerId),
    getCommentSummariesForActivities(supabase, rows.map(r => r.id), viewerId),
    viewerId && watchLoggedFilmIds.length
      ? supabase.from("watched").select("film_id").eq("user_id", viewerId).in("film_id", watchLoggedFilmIds)
      : Promise.resolve({ data: [] }),
  ]);

  const filmMap = new Map((films.data ?? []).map((r: any) => [r.id, r]));
  const recipMap = new Map((recipients.data ?? []).map((r: any) => [r.id, r]));
  const listMap = new Map((lists.data ?? []).map((r: any) => [r.id, r]));
  const viewerWatchedFilmIds = new Set((viewerWatchedRows.data ?? []).map((row: any) => row.film_id));

  const actor = { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const out: any[] = [];
  for (const r of rows) {
    const reactions = reactionsMap.get(r.id) ?? { count: 0, likedByMe: false };
    const comments = commentsMap.get(r.id) ?? { count: 0, items: [] };
    const base = { id: r.id, created_at: r.created_at, actor, reactions, comments };
    const film = r.payload?.film_id ? filmMap.get(r.payload.film_id) as any : undefined;
    const recipient = r.payload?.to_user_id ? recipMap.get(r.payload.to_user_id) : undefined;
    const list = r.payload?.list_id ? listMap.get(r.payload.list_id) : undefined;
    switch (r.kind) {
      case "recommendation_sent": if (film && recipient) out.push({ ...base, kind: "recommendation_sent", film, recipient, note: r.payload.note ?? "" }); break;
      case "review_published":   if (film) out.push({ ...base, kind: "review_published", film, title: r.payload.title ?? "", pullquote: r.payload.pullquote ?? null }); break;
      case "watchlist_added":    if (film) out.push({ ...base, kind: "watchlist_added", film }); break;
      case "watch_logged":       if (film) out.push({ ...base, kind: "watch_logged", film, note: r.payload.note ?? null, recommended: typeof r.payload.recommended === "boolean" ? r.payload.recommended : null, spoiler: r.payload.spoiler === true, viewerHasWatched: viewerWatchedFilmIds.has(film.id) }); break;
      case "library_added":      if (film) out.push({ ...base, kind: "library_added", film }); break;
      case "list_created":       if (list) out.push({ ...base, kind: "list_created", list }); break;
      case "list_film_added":    if (list && film) out.push({ ...base, kind: "list_film_added", list, film }); break;
      case "coven_joined":       if (recipient) out.push({ ...base, kind: "coven_joined", other: recipient }); break;
    }
  }
  return out;
}
