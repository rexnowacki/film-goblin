import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPendingInvites,
  getMyCovenMembers,
  getRelationshipMap,
} from "@/lib/queries/coven";
import { getProfilesBySearch } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import CovenInviteActions from "@/components/CovenInviteActions";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import PeopleSearch from "@/components/PeopleSearch";
import SearchPersonRow from "@/components/SearchPersonRow";
import Link from "next/link";

export default async function CovenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/coven");

  const [invites, members] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
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
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>
            Chapter IV · The Covenfolk
          </div>
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
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
                    name={inv.from.display_name ?? inv.from.username}
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
                        {inv.from.display_name ?? inv.from.username}
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
              <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: "0 0 16px" }}>Your Coven</h2>
              {members.length === 0 ? (
                <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
                  Your coven is empty. Search to your right to find souls to bind with.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {members.map((m) => (
                    <div key={m.id} style={{ border: "1px solid var(--muted)", padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <Avatar
                          name={m.display_name ?? m.username}
                          color="var(--accent)"
                          size={44}
                          url={m.avatar_url}
                        />
                        <div style={{ flex: 1 }}>
                          <Link href={`/p/${encodeURIComponent(m.username)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                            <div className="head" style={{ fontSize: 16, lineHeight: 1 }}>
                              {m.display_name ?? m.username}
                            </div>
                            <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                              @{m.username}
                            </div>
                          </Link>
                        </div>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <LeaveCovenButton
                          otherUserId={m.id}
                          otherUsername={m.username}
                          otherDisplayName={m.display_name ?? m.username}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="eyebrow" style={{ fontSize: 14, color: "var(--accent)", margin: "0 0 16px" }}>Find People</h2>
              <div style={{ display: "flex", gap: 0, border: "1px solid var(--muted)", background: "var(--bone)", boxShadow: "6px 6px 0 var(--accent)", marginBottom: 20 }}>
                <span style={{ padding: "14px 16px", color: "var(--accent-deep)", lineHeight: 1, display: "inline-flex", alignItems: "center" }} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  </svg>
                </span>
                <PeopleSearch />
              </div>
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
