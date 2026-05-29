import { getInviteGateSetting } from "@/lib/actions/admin/site-settings";
import { TRIGGERABLE_JOBS } from "@/lib/cron/job-meta";
import { getAdminStats } from "@/lib/queries/admin-stats";
import { getLatestCronRuns } from "@/lib/queries/cron-runs";
import JobsSection from "./JobsSection";
import SiteSettingsClient from "./SiteSettingsClient";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: 18, border: "2px solid var(--bone)", background: "var(--void-2)" }}>
      <div className="head" style={{ fontSize: 30 }}>{value.toLocaleString()}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [{ enabled, updatedAt }, stats, runs] = await Promise.all([
    getInviteGateSetting(),
    getAdminStats(),
    getLatestCronRuns([...TRIGGERABLE_JOBS]),
  ]);

  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Admin Dashboard</h1>

      <section style={{ marginBottom: 36 }}>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>At a glance</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Films" value={stats.filmsTotal} />
          <StatCard label="Tracking prices" value={stats.filmsTracking} />
          <StatCard label="Watchlist entries" value={stats.watchlistEntries} />
          <StatCard label="Watched logs" value={stats.watchedLogs} />
          <StatCard label="Pending requests" value={stats.pendingRequests} />
        </div>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>Background jobs</div>
        <JobsSection runs={runs} />
      </section>

      <section>
        <div className="head" style={{ fontSize: 22, marginBottom: 12 }}>Site settings</div>
        <SiteSettingsClient enabled={enabled} updatedAt={updatedAt} />
      </section>
    </div>
  );
}
