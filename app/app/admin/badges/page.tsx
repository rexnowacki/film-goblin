import { createClient } from "@/lib/supabase/server";
import { getAdminBadgeRows } from "@/lib/queries/admin/badges";
import BadgeManager from "./BadgeManager";

export default async function AdminBadgesPage() {
  const supabase = await createClient();
  const badges = await getAdminBadgeRows(supabase);

  return (
    <div className="admin-badge-page">
      <header className="admin-page-head">
        <div>
          <div className="eyebrow">Member achievements</div>
          <h1>Badge forge.</h1>
          <p>Create typed achievement rules, upload their artwork, and inspect how many awards exist.</p>
        </div>
      </header>
      <BadgeManager badges={badges} />
    </div>
  );
}
