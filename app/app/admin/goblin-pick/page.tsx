import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { redirect } from "next/navigation";
import { getGoblinPickQueue } from "@/lib/queries/goblin-pick";
import GoblinPickQueueManager from "@/components/GoblinPickQueueManager";
import Link from "next/link";

export default async function AdminGoblinPickPage() {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access !== "ok") redirect("/auth/signin");

  const rows = await getGoblinPickQueue(supabase, 30);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
        <Link href="/admin" style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
          ← Admin
        </Link>
        <h1 className="h-display" style={{ margin: 0 }}>Goblin Pick</h1>
      </div>

      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.55 }}>
        The film featured in "The Goblin Recommends" on the home feed. Queue picks ahead of time —
        each one goes live automatically at its scheduled moment (defaults to Monday 4:00 AM Tucson).
      </p>

      <GoblinPickQueueManager rows={rows} />
    </div>
  );
}
