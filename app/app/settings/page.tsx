import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getAllTagsGroupedByType } from "@/lib/queries/film-tags";
import { PROFILE_SELECT_COLUMNS } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import SettingsForm from "./SettingsForm";
import LanePicker from "@/components/settings/LanePicker";
import ThemePicker from "@/components/settings/ThemePicker";
import DeleteAccountSection from "./DeleteAccountSection";
import InviteLinkSection from "@/components/settings/InviteLinkSection";
import { THEME_COOKIE, readTheme } from "@/lib/theme";
import SignOutSection from "./components/SignOutSection";

const SETTINGS_NAV = [
  { href: "#profile-picture", label: "Picture" },
  { href: "#profile", label: "Profile" },
  { href: "#privacy", label: "Privacy" },
  { href: "#notifications", label: "Alerts" },
  { href: "#email-notifications", label: "Email" },
  { href: "#account", label: "Account" },
  { href: "#appearance", label: "Theme" },
  { href: "#lanes", label: "Lanes" },
  { href: "#invites", label: "Invites" },
  { href: "#danger", label: "Danger" },
];

export default async function SettingsPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/settings");
  const supabase = await createClient();

  const [profile, vocab] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT_COLUMNS).eq("id", user.id).maybeSingle(),
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
      <section className="grain-light" style={{ background: "var(--bone)", color: "var(--void)", borderBottom: "3px solid var(--void)", padding: "28px 0 24px" }}>
        <div className="container-wide">
          <div className="eyebrow" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent-deep)" }}>Account controls</div>
          <h1 className="h-display" style={{ fontSize: "clamp(36px, 7vw, 84px)", margin: 0 }}>Settings.</h1>
          <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 15, color: "var(--void)", opacity: 0.72, margin: "8px 0 0", maxWidth: 620 }}>
            Profile, account security, notifications, privacy, invites, and taste controls in one place.
          </p>
        </div>
      </section>

      <div className="container-wide" style={{ paddingTop: 30, paddingBottom: 76 }}>
        <nav className="settings-mobile-nav" aria-label="Settings sections">
          {SETTINGS_NAV.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="caps"
              data-danger={item.href === "#danger" ? "true" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div
          className="stackable"
          style={{
            "--stack-template": "220px minmax(0, 760px)",
            "--stack-gap": "36px",
            alignItems: "start",
          } as CSSProperties}
        >
          <aside
            className="settings-section-rail"
            style={{
              position: "sticky",
              top: 84,
              gap: 6,
              borderLeft: "2px solid #333",
              paddingLeft: 14,
            }}
            aria-label="Settings sections"
          >
            {SETTINGS_NAV.map(item => (
              <a
                key={item.href}
                href={item.href}
                className="caps"
                style={{
                  color: item.href === "#danger" ? "var(--danger)" : "var(--muted)",
                  fontSize: 11,
                  textDecoration: "none",
                  padding: "6px 0",
                }}
              >
                {item.label}
              </a>
            ))}
          </aside>
          <main style={{ display: "grid", gap: 34, minWidth: 0 }}>
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
            <SignOutSection />
          </main>
        </div>
      </div>
    </div>
  );
}
