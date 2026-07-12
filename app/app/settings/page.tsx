import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/cached";
import { getAllTagsGroupedByType } from "@/lib/queries/film-tags";
import { PROFILE_SELECT_COLUMNS } from "@/lib/queries/profiles";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import Avatar from "@/components/Avatar";
import SettingsForm from "./SettingsForm";
import AccountSettingsSection from "./components/AccountSettingsSection";
import PreferenceSettingsForm from "./components/PreferenceSettingsForm";
import LanePicker from "@/components/settings/LanePicker";
import ThemePicker from "@/components/settings/ThemePicker";
import DeleteAccountSection from "./DeleteAccountSection";
import InviteLinkSection from "@/components/settings/InviteLinkSection";
import PushToggle from "@/components/settings/PushToggle";
import SettingsSection from "@/components/settings/SettingsSection";
import SettingsGroup from "@/components/settings/SettingsGroup";
import { THEME_COOKIE, readTheme } from "@/lib/theme";
import SignOutSection from "./components/SignOutSection";

const SETTINGS_NAV = [
  { href: "#profile-settings", label: "Profile", mark: "01" },
  { href: "#signal-settings", label: "Signals", mark: "02" },
  { href: "#taste-settings", label: "Taste", mark: "03" },
  { href: "#account-settings", label: "Account", mark: "04" },
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
  const displayName = profile.data?.display_name || username || "Goblin";
  const avatarUrl = profile.data?.avatar_url ?? null;
  const hasPasswordIdentity = (user.identities ?? []).some((identity) => identity.provider === "email");
  const currentTheme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="settings-page">
      <TopNav current="settings" />
      <BottomNav current="settings" />
      <section className="settings-hero">
        <div className="settings-shell settings-hero__inner">
          <div className="settings-avatar-ring">
            <Avatar name={displayName} color="var(--accent)" size={104} url={avatarUrl} />
          </div>
          <div className="settings-hero__identity">
            <div className="eyebrow">Your corner of the pit</div>
            <h1>Settings</h1>
            <div className="settings-hero__person">
              <strong>{displayName}</strong>
              {username ? <span>@{username}</span> : null}
            </div>
            <p>Tune what the coven sees, what the pit sends back, and how your corner of it feels.</p>
            {username ? (
              <Link className="btn btn-outline" href={`/p/${encodeURIComponent(username)}`} prefetch={false}>
                View profile
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="settings-shell settings-layout">
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
        <div className="settings-layout__grid">
          <aside className="settings-section-rail" aria-label="Settings sections">
            <div className="settings-section-rail__label">Settings ledger</div>
            {SETTINGS_NAV.map(item => (
              <a
                key={item.href}
                href={item.href}
                className="settings-rail-link"
                data-danger={item.href === "#danger" ? "true" : undefined}
              >
                <span>{item.mark ?? "×"}</span>
                {item.label}
              </a>
            ))}
          </aside>
          <main className="settings-groups">
            <SettingsGroup
              id="profile-settings"
              eyebrow="01 · Identity"
              title="Your face in the pit"
              description="Shape the name, portrait, and words the coven meets first."
            >
              <SettingsForm initialProfile={profile.data} />
            </SettingsGroup>

            <SettingsGroup
              id="signal-settings"
              eyebrow="02 · Signals & secrecy"
              title="What escapes the crypt"
              description="Decide which traces you leave behind and which omens find their way back to you."
            >
              <PreferenceSettingsForm profile={profile.data ?? {}} />
              <SettingsSection
                id="push"
                eyebrow="Push"
                title="Push notifications"
                description="Get coven news, recommendations, gazing RSVPs, and price drops on this device."
              >
                <PushToggle />
              </SettingsSection>
            </SettingsGroup>

            <SettingsGroup
              id="taste-settings"
              eyebrow="03 · Taste"
              title="Bend the pit toward you"
              description="Choose the atmosphere you inhabit and the strange roads your recommendations should travel."
            >
              <ThemePicker current={currentTheme} />
              <LanePicker
                initialLaneIds={initialLaneIds}
                vocab={{ subgenre: vocab.subgenre, tone: vocab.tone, theme: vocab.theme }}
              />
            </SettingsGroup>

            <SettingsGroup
              id="account-settings"
              eyebrow="04 · Access"
              title="Keys to the crypt"
              description="Keep your way back in secure, and pass a key to the right kind of creature."
            >
              <AccountSettingsSection
                authEmail={user.email ?? null}
                emailAddedAt={profile.data?.email_added_at ?? null}
                hasPasswordIdentity={hasPasswordIdentity}
              />
              <InviteLinkSection userId={user.id} />
              <SignOutSection />
            </SettingsGroup>

            <SettingsGroup
              id="danger"
              eyebrow="Final rites"
              title="Things that cannot be unburied"
              description="Permanent choices live here, away from everything you might tap by accident."
              danger
            >
              <DeleteAccountSection username={username} />
            </SettingsGroup>
          </main>
        </div>
      </div>
    </div>
  );
}
