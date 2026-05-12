"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { changePassword, updateEmail } from "@/lib/actions/profile";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsInlineMessage, SettingsTextField } from "./SettingsControls";

interface AccountSettingsSectionProps {
  authEmail: string | null;
  emailAddedAt: string | null;
  hasPasswordIdentity: boolean;
}

export default function AccountSettingsSection({
  authEmail,
  emailAddedAt,
  hasPasswordIdentity,
}: AccountSettingsSectionProps) {
  const { toast } = useToast();
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwPending, setPwPending] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);

  async function handleUpdateEmail(formData: FormData) {
    setEmailPending(true);
    setEmailError(null);
    setEmailInfo(null);
    const res = await updateEmail(formData);
    setEmailPending(false);
    if (res?.error) setEmailError(res.error);
    if (res?.info) {
      setEmailInfo(res.info);
      toast("Confirmation sent");
    }
  }

  async function handleChangePassword(formData: FormData) {
    setPwPending(true);
    setPwError(null);
    setPwSuccess(false);
    const res = await changePassword(formData);
    setPwPending(false);
    if (res?.error) setPwError(res.error);
    if (res?.ok) {
      setPwSuccess(true);
      toast("Password changed");
    }
  }

  return (
    <SettingsSection id="account" eyebrow="Account" title="Email and password">
      <div style={{ display: "grid", gap: 28 }}>
        <div>
          {emailAddedAt ? (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, margin: "0 0 16px", opacity: 0.8 }}>
              Current: <strong>{authEmail}</strong>. Update below to send a confirmation link to the new address.
            </p>
          ) : (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, margin: "0 0 16px", opacity: 0.8 }}>
              You signed up without an email. Add one below to receive price-drop alerts and recover access if you forget your password.
            </p>
          )}
          <form action={handleUpdateEmail} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <SettingsTextField
              name="email"
              type="email"
              label={emailAddedAt ? "New email" : "Email"}
              required
              autoComplete="email"
            />
            {emailError ? <SettingsInlineMessage tone="danger">{emailError}</SettingsInlineMessage> : null}
            {emailInfo ? <SettingsInlineMessage tone="accent">{emailInfo}</SettingsInlineMessage> : null}
            <button type="submit" disabled={emailPending} className="btn" style={{ justifySelf: "start" }}>
              {emailPending ? "Sending..." : (emailAddedAt ? "Update email" : "Add email")}
            </button>
          </form>
        </div>

        <div style={{ borderTop: "1px solid #333", paddingTop: 24 }}>
          {!hasPasswordIdentity ? (
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, margin: "0 0 16px", opacity: 0.8 }}>
              You signed up with Google. Set a password to also sign in with email.
            </p>
          ) : null}
          <form action={handleChangePassword} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            {hasPasswordIdentity ? (
              <SettingsTextField
                name="current_password"
                type="password"
                label="Current password"
                required
                minLength={6}
                autoComplete="current-password"
              />
            ) : null}
            <SettingsTextField
              name="new_password"
              type="password"
              label="New password"
              required
              minLength={6}
              autoComplete="new-password"
            />
            <SettingsTextField
              name="confirm"
              type="password"
              label="Confirm new password"
              required
              minLength={6}
              autoComplete="new-password"
            />
            {pwError ? <SettingsInlineMessage tone="danger">{pwError}</SettingsInlineMessage> : null}
            {pwSuccess ? <SettingsInlineMessage tone="accent">Password updated.</SettingsInlineMessage> : null}
            <button type="submit" disabled={pwPending} className="btn" style={{ justifySelf: "start" }}>
              {pwPending ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </SettingsSection>
  );
}
