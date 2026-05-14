import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getActiveRitualPick, getRitualPickById, getRitualMessages } from "@/lib/queries/ritual";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import RitualHeader from "@/components/ritual/RitualHeader";
import RitualPageBody from "@/components/ritual/RitualPageBody";

export const dynamic = "force-dynamic";

export default async function RitualByIdPage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}) {
  const { pickId: pickIdRaw } = await params;
  const pickId = Number(pickIdRaw);
  if (!Number.isInteger(pickId) || pickId <= 0) notFound();

  const user = await getServerUser();
  if (!user) redirect(`/auth/signin?redirect=/ritual/${pickId}`);

  const supabase = await createClient();
  const [active, pick] = await Promise.all([
    getActiveRitualPick(supabase),
    getRitualPickById(supabase, pickId),
  ]);
  if (!pick) notFound();

  // If this IS the active pick, redirect to /ritual (canonical URL).
  if (active && active.pick_id === pickId) redirect("/ritual");

  const messages = await getRitualMessages(supabase, pickId);
  const archived = true;

  return (
    <div className="ritual-shell">
      <TopNav current="ritual" />

      <RitualPageBody
        pickId={pickId}
        archived={archived}
        initialMessages={messages}
        currentUserId={user.id}
        header={<RitualHeader pick={pick} archived={archived} />}
      />

      <BottomNav current="ritual" />
    </div>
  );
}
