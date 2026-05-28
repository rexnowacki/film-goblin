import { getInviteGateSetting } from "@/lib/actions/admin/site-settings";
import SiteSettingsClient from "./SiteSettingsClient";

export default async function SiteSettingsPage() {
  const { enabled, updatedAt } = await getInviteGateSetting();
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 28 }}>Site Settings</h1>
      <SiteSettingsClient enabled={enabled} updatedAt={updatedAt} />
    </div>
  );
}
