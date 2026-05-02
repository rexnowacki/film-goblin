import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import {
  getPendingInvites,
  getMyCovenMembers,
  getRelationshipMap,
} from "@/lib/queries/coven";
import { getMyProfile, getProfilesBySearch } from "@/lib/queries/profiles";
import { getRankedCovenfolk } from "@/lib/queries/coven-interactions";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import CovenInviteActions from "@/components/CovenInviteActions";
import CovenChipRow from "@/components/coven/CovenChipRow";
import PeopleSearch from "@/components/PeopleSearch";
import SearchPersonRow from "@/components/SearchPersonRow";
import InviteFriendButton from "@/components/InviteFriendButton";
import Link from "next/link";

export default async function CovenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?redirect=/coven");
  const supabase = await createClient();

  const [invites, members, ranked, myProfile] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
    getRankedCovenfolk(supabase, user.id),
    getMyProfile(supabase),
  ]);

  const memberIds = members.map((m) => m.id);
  const profiles = await getProfilesBySearch(supabase, {
    q,
    excludeUserIds: [user.id, ...memberIds],
  });
  const relationshipMap = await getRelationshipMap(
    supabase,
    user.id,
    profiles.map((p) => p.id),
  );

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="coven" />
      <BottomNav current="coven" />

      <section
        style={{
          background: "var(--bone)",
          color: "var(--void)",
          borderBottom: "3px solid var(--void)",
          padding: "22px 0 18px",
        }}
        className="grain-light"
      >
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", margin: 0 }}>
            The <em style={{ color: "var(--accent)" }}>Covenfolk</em>.
          </h1>
        </div>
      </section>

      {invites.length > 0 && (
        <section style={{ padding: "24px 0", borderBottom: "3px solid var(--void)" }}>
          <div className="container-wide">
            <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: "0 0 16px" }}>Pending Invitations</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: 14, border: "1px solid var(--muted)" }}
                >
                  <Avatar
                    name={inv.from.username}
                    color="var(--accent)"
                    size={44}
                    url={inv.from.avatar_url}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="head" style={{ fontSize: 16, lineHeight: 1 }}>
                      <Link
                        href={`/p/${encodeURIComponent(inv.from.username)}`}
                        style={{ color: "var(--bone)", textDecoration: "none" }}
                      >
                        {inv.from.username}
                      </Link>
                    </div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                      @{inv.from.username}
                    </div>
                  </div>
                  <CovenInviteActions requestId={inv.id} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section style={{ padding: "32px 0 60px" }}>
        <div className="container-wide">
          <div
            className="stackable"
            style={{ "--stack-template": "1fr 1fr", "--stack-gap": "32px", alignItems: "start" } as React.CSSProperties}
          >
            <div>
              <CovenChipRow members={ranked} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 0 16px", gap: 12, flexWrap: "wrap" }}>
                <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: 0 }}>Find People</h2>
                {myProfile?.username && <InviteFriendButton inviterUsername={myProfile.username} />}
              </div>
              <PeopleSearch />
              {profiles.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "var(--muted)",
                  }}
                >
                  {q ? "No souls match your search." : "No souls in the realm yet."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {profiles.map((p) => {
                    const rel = relationshipMap.get(p.id);
                    const state = rel?.state ?? "none";
                    return (
                      <SearchPersonRow
                        key={p.id}
                        profile={p}
                        state={state}
                        incomingRequestId={state === "pending_inbound" ? rel?.requestId : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
