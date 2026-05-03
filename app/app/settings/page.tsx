import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getAllTagsGroupedByType } from "@/lib/queries/film-tags";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "./SettingsForm";
import LanePicker from "@/components/settings/LanePicker";

export default async function SettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/settings");
  const supabase = await createClient();

  const [profile, vocab] = await Promise.all([
    supabase.from("profiles").select("lane_tag_ids").eq("id", user.id).maybeSingle(),
    getAllTagsGroupedByType(supabase),
  ]);

  const initialLaneIds = (profile.data?.lane_tag_ids ?? []) as string[];

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="settings" />
      <BottomNav current="settings" />
      <div className="container-wide" style={{ padding: 40 }}>
        <h1 className="h-display" style={{ marginBottom: 24 }}>Settings</h1>
        <SettingsForm />
        <LanePicker
          initialLaneIds={initialLaneIds}
          vocab={{ subgenre: vocab.subgenre, tone: vocab.tone, theme: vocab.theme }}
        />
      </div>
    </div>
  );
}
