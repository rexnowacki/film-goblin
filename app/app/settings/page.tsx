import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getAllTagsGroupedByType } from "@/lib/queries/film-tags";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "./SettingsForm";
import LanePicker from "@/components/settings/LanePicker";
import ThemePicker from "@/components/settings/ThemePicker";
import DeleteAccountSection from "./DeleteAccountSection";
import InviteLinkSection from "@/components/settings/InviteLinkSection";
import { THEME_COOKIE, readTheme } from "@/lib/theme";

export default async function SettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/settings");
  const supabase = await createClient();

  const [profile, vocab] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    getAllTagsGroupedByType(supabase),
  ]);

  const initialLaneIds = (profile.data?.lane_tag_ids ?? []) as string[];
  const username = profile.data?.username ?? "";
  const hasPasswordIdentity = (user.identities ?? []).some((identity) => identity.provider === "email");
  const currentTheme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="settings" />
      <BottomNav current="settings" />
      <div className="container-wide" style={{ padding: 40 }}>
        <h1 className="h-display" style={{ marginBottom: 24 }}>Settings</h1>
        <SettingsForm
          initialProfile={profile.data}
          initialAuthEmail={user.email ?? null}
          initialHasPasswordIdentity={hasPasswordIdentity}
        />
        <ThemePicker current={currentTheme} />
        <LanePicker
          initialLaneIds={initialLaneIds}
          vocab={{ subgenre: vocab.subgenre, tone: vocab.tone, theme: vocab.theme }}
        />
        <InviteLinkSection userId={user.id} />
        <DeleteAccountSection username={username} />
      </div>
    </div>
  );
}
