import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getForYou } from "@/lib/queries/fyp/forYou";
import TopNav from "@/components/nav/TopNav";
import BottomNav from "@/components/nav/BottomNav";
import ForYouFeed from "@/components/ForYouFeed";

const PAGE_SIZE = 20;

export default async function ForYouPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/for-you");
  const supabase = await createClient();
  const initial = await getForYou(supabase, user.id, { limit: PAGE_SIZE });

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="for-you" />
      <BottomNav current="for-you" />

      <section style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "22px 0 18px" }} className="grain-light">
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)" }}>
            For <em style={{ color: "var(--accent)" }}>You</em>.
          </h1>
        </div>
      </section>

      <section style={{ padding: "24px 0 60px" }}>
        <div className="container-wide">
          <ForYouFeed
            initialItems={initial.items}
            initialFilmsById={Array.from(initial.filmsById.entries())}
            initialCursor={initial.nextCursor}
            initialDone={initial.done}
          />
        </div>
      </section>
    </div>
  );
}
