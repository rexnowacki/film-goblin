import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { redirect } from "next/navigation";
import { getGoblinPick } from "@/lib/queries/goblin-pick";
import GoblinPickSearch from "@/components/GoblinPickSearch";
import Link from "next/link";

export default async function AdminGoblinPickPage() {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access !== "ok") redirect("/auth/signin");

  const current = await getGoblinPick(supabase);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 28 }}>
        <Link href="/admin" style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
          ← Admin
        </Link>
        <h1 className="h-display" style={{ margin: 0 }}>Goblin Pick</h1>
      </div>

      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
        The film shown in the "The Goblin Recommends" panel on the home feed. Search below to change it.
      </p>

      <GoblinPickSearch current={current} />
    </div>
  );
}
