import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings page presentation", () => {
  const page = readFileSync("app/settings/page.tsx", "utf8");
  const form = readFileSync("app/settings/SettingsForm.tsx", "utf8");
  const tabs = readFileSync("components/settings/SettingsTabs.tsx", "utf8");

  it("organizes every control into five pill-navigated chapters", () => {
    for (const id of [
      "profile-settings",
      "signal-settings",
      "taste-settings",
      "account-settings",
      "danger",
    ]) {
      expect(page).toContain(`id="${id}"`);
    }

    expect(page.match(/<SettingsGroup/g)).toHaveLength(5);
    expect(page).toContain("<SettingsTabs>");
    for (const label of ["Your Face", "Whispers", "Appetite", "Keys", "Final Rites"]) {
      expect(tabs).toContain(`label: "${label}"`);
    }
  });

  it("exposes real tab semantics and keyboard navigation", () => {
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain('role="tabpanel"');
    expect(tabs).toContain("aria-selected={index === activeIndex}");
    expect(tabs).toContain("hidden={index !== activeIndex}");
    expect(tabs).toContain('event.key === "ArrowRight"');
    expect(tabs).toContain('event.key === "ArrowLeft"');
    expect(tabs).toContain('event.key === "Home"');
    expect(tabs).toContain('event.key === "End"');
  });

  it("uses the profile-inspired identity hero and keeps all existing settings surfaces", () => {
    expect(page).toContain('className="settings-avatar-ring"');
    expect(page).toContain('className="settings-hero__identity"');
    expect(page).toContain("<PreferenceSettingsForm");
    expect(page).toContain("<ThemePicker");
    expect(page).toContain("<LanePicker");
    expect(page).toContain("<AccountSettingsSection");
    expect(page).toContain("<InviteLinkSection");
    expect(page).toContain("<DeleteAccountSection");
    expect(page).toContain("<SignOutSection");
    expect(form).toContain("<ProfileAvatarSection");
    expect(form).toContain("<ProfileDetailsForm");
  });
});
