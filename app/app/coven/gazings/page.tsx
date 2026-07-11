import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import GazingList from "@/components/gazings/GazingList";
import { getServerUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getGazings } from "@/lib/queries/gazings";

export const dynamic = "force-dynamic";

export default async function GazingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?redirect=/coven/gazings");

  const supabase = await createClient();
  const gazings = await getGazings(supabase, user.id, new Date());
  const empty = gazings.open.length === 0 && gazings.aftermath.length === 0;

  return (
    <div className="gazings-page">
      <TopNav current="coven" />
      <BottomNav current="coven" />

      <header className="gazings-hero grain-light">
        <div className="container-wide">
          <div className="eyebrow">The coven gathers</div>
          <h1 className="h-display">Your <em>Gazings</em>.</h1>
          <p>Every watch night you host, join, or still need to answer.</p>
        </div>
      </header>

      <main className="container-wide gazings-main">
        {empty ? (
          <section className="gazings-empty">
            <span aria-hidden="true">◉</span>
            <div>
              <h2>No gazings are gathering yet.</h2>
              <p>Pick a film, set a time, and summon someone into the dark.</p>
              <Link className="btn" href="/films" prefetch={false}>Find a film to plan one →</Link>
            </div>
          </section>
        ) : (
          <>
            <GazingList
              id="open-gazings"
              title="Open gazings"
              description="Future sessions, with the nearest first."
              items={gazings.open}
              section="open"
            />
            <GazingList
              id="gazing-aftermath"
              title="Aftermath"
              description="Happened and overdue gazings, with the newest first."
              items={gazings.aftermath}
              section="aftermath"
            />
          </>
        )}
      </main>
    </div>
  );
}
