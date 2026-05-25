import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser, getActiveRitualPick } from "@/lib/supabase/cached";
import { getRitualMessages } from "@/lib/queries/ritual";
import TopNav from "@/components/nav/TopNav";
import BottomNav from "@/components/nav/BottomNav";
import RitualHeader from "@/components/ritual/RitualHeader";
import RitualPageBody from "@/components/ritual/RitualPageBody";

export const dynamic = "force-dynamic";

export default async function RitualPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?redirect=/ritual");

  const supabase = await createClient();
  const pick = await getActiveRitualPick();
  const messages = pick ? await getRitualMessages(supabase, pick.pick_id) : [];
  const [{ data: viewer }, { data: staffRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="ritual-shell">
      <TopNav current="ritual" />

      {pick ? (
        <RitualPageBody
          pickId={pick.pick_id}
          archived={false}
          initialMessages={messages}
          currentUserId={user.id}
          viewerUsername={viewer?.username ?? null}
          viewerAvatarUrl={viewer?.avatar_url ?? null}
          viewerDisplayName={viewer?.display_name ?? null}
          viewerIsAdmin={staffRow?.role === "admin"}
          header={<RitualHeader pick={pick} archived={false} />}
        />
      ) : (
        <div className="container-wide" style={{ padding: "16px var(--container-pad)" }}>
          <NoPickState />
        </div>
      )}

      <BottomNav current="ritual" />
    </div>
  );
}

function NoPickState() {
  return (
    <div style={{
      maxWidth: 540, margin: "60px auto", textAlign: "center",
      padding: 32, border: "1px solid #2a2a2a", background: "var(--void-2, #141414)",
    }}>
      <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12, letterSpacing: "0.14em" }}>
        The circle is empty
      </div>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "var(--muted)", lineHeight: 1.55 }}>
        No goblin pick is active. Return when the next ritual begins.
      </p>
      <Link href="/ritual/archive" className="btn btn-sm" style={{ marginTop: 18, display: "inline-block" }}>
        Browse past rituals
      </Link>
    </div>
  );
}
