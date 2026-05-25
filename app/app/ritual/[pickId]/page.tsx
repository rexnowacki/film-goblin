import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser, getActiveRitualPick } from "@/lib/supabase/cached";
import { getRitualPickById, getRitualMessages } from "@/lib/queries/ritual";
import TopNav from "@/components/nav/TopNav";
import BottomNav from "@/components/nav/BottomNav";
import RitualHeader from "@/components/ritual/RitualHeader";
import RitualPageBody from "@/components/ritual/RitualPageBody";

export const dynamic = "force-dynamic";

export default async function RitualByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ pickId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { pickId: pickIdRaw } = await params;
  const { message } = await searchParams;
  const pickId = Number(pickIdRaw);
  if (!Number.isInteger(pickId) || pickId <= 0) notFound();

  const user = await getServerUser();
  if (!user) redirect(`/auth/signin?redirect=/ritual/${pickId}`);

  const supabase = await createClient();
  const [active, pick] = await Promise.all([
    getActiveRitualPick(),
    getRitualPickById(supabase, pickId),
  ]);
  if (!pick) notFound();

  // If this IS the active pick, redirect to /ritual (canonical URL), preserving
  // a targeted message highlight from notification links.
  if (active && active.pick_id === pickId) {
    redirect(message ? `/ritual?message=${encodeURIComponent(message)}` : "/ritual");
  }
  if (new Date(pick.effective_at).getTime() > Date.now()) notFound();

  const messages = await getRitualMessages(supabase, pickId);
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
  const archived = true;

  return (
    <div className="ritual-shell">
      <TopNav current="ritual" />

      <RitualPageBody
        pickId={pickId}
        archived={archived}
        initialMessages={messages}
        currentUserId={user.id}
        viewerUsername={viewer?.username ?? null}
        viewerAvatarUrl={viewer?.avatar_url ?? null}
        viewerDisplayName={viewer?.display_name ?? null}
        viewerIsAdmin={staffRow?.role === "admin"}
        header={<RitualHeader pick={pick} archived={archived} />}
      />

      <BottomNav current="ritual" />
    </div>
  );
}
