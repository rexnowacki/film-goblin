import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings page presentation", () => {
  const page = readFileSync("app/settings/page.tsx", "utf8");
  const form = readFileSync("app/settings/SettingsForm.tsx", "utf8");

  it("organizes every control into five readable chapters", () => {
    for (const id of [
      "profile-settings",
      "signal-settings",
      "taste-settings",
      "account-settings",
      "danger",
    ]) {
      expect(page).toContain(`id="${id}"`);
      expect(page).toContain(`href: "#${id}"`);
    }

    expect(page.match(/<SettingsGroup/g)).toHaveLength(5);
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
