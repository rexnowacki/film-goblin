import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvites, getMyCovenMembers } from "@/lib/queries/coven";
import TopNav from "@/components/TopNav";
import Avatar from "@/components/Avatar";
import CovenInviteActions from "@/components/CovenInviteActions";
import LeaveCovenButton from "@/components/LeaveCovenButton";
import Link from "next/link";

export default async function CovenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?redirect=/coven");

  const [invites, members] = await Promise.all([
    getPendingInvites(supabase, user.id),
    getMyCovenMembers(supabase, user.id),
  ]);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100vh" }}>
      <TopNav current="coven" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "44px 0 32px" }} className="grain-light">
        <div className="container-wide">
          <div className="eyebrow" style={{ color: "var(--accent-deep)", marginBottom: 10 }}>Chapter V</div>
          <h1 className="h-display">The <em style={{ color: "var(--accent)" }}>Coven</em>.</h1>
        </div>
      </section>

      <section style={{ padding: "48px 0", borderBottom: "3px solid var(--void)" }}>
        <div className="container-wide">
          <h2 className="head" style={{ fontSize: 32, margin: "0 0 20px" }}>Pending Invitations</h2>
          {invites.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>No pending invites.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {invites.map(inv => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 20, padding: 18, border: "1px solid var(--muted)" }}>
                  <Avatar name={inv.from.display_name ?? inv.from.handle} color="var(--accent)" size={48} url={inv.from.avatar_url} />
                  <div style={{ flex: 1 }}>
                    <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>
                      <Link href={`/p/${encodeURIComponent(inv.from.handle)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                        {inv.from.display_name ?? inv.from.handle}
                      </Link>
                    </div>
                    <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{inv.from.handle}</div>
                  </div>
                  <CovenInviteActions requestId={inv.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "48px 0" }}>
        <div className="container-wide">
          <h2 className="head" style={{ fontSize: 32, margin: "0 0 20px" }}>Your Coven</h2>
          {members.length === 0 ? (
            <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.6 }}>
              Your coven is empty. Visit <Link href="/people" style={{ color: "var(--accent)" }}>/people</Link> to find souls to bind with.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--grid-gap)" }}>
              {members.map(m => (
                <div key={m.id} style={{ border: "1px solid var(--muted)", padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <Avatar name={m.display_name ?? m.handle} color="var(--accent)" size={48} url={m.avatar_url} />
                    <div style={{ flex: 1 }}>
                      <Link href={`/p/${encodeURIComponent(m.handle)}`} style={{ color: "var(--bone)", textDecoration: "none" }}>
                        <div className="head" style={{ fontSize: 18, lineHeight: 1 }}>{m.display_name ?? m.handle}</div>
                        <div className="caps" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>@{m.handle}</div>
                      </Link>
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <LeaveCovenButton otherUserId={m.id} otherHandle={m.handle} otherDisplayName={m.display_name ?? m.handle} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
