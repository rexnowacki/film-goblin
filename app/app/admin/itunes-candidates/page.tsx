import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listPendingItunesCandidates } from "@/lib/queries/admin/itunes-candidates";
import CandidateRow from "./CandidateRow";

export default async function AdminItunesCandidatesPage() {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const rows = await listPendingItunesCandidates(supabase);

  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 12 }}>iTunes candidates</h1>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.7, marginBottom: 24 }}>
        Films matched fuzzily to iTunes by the weekly cron. Confirm to populate the iTunes ID and start tracking; reject to skip for 14 days.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)" }}>Nothing pending.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {rows.map(r => <CandidateRow key={r.id} row={r} />)}
        </div>
      )}
    </div>
  );
}
