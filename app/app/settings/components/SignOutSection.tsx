import { signOut } from "@/lib/actions/auth";
import SettingsSection from "@/components/settings/SettingsSection";

export default function SignOutSection() {
  return (
    <SettingsSection
      id="sign-out"
      eyebrow="Session"
      title="Leave the pit"
      description="End this session on the current device. Your hoard and coven stay exactly where you left them."
    >
      <form action={signOut}>
        <button type="submit" className="btn btn-outline">Sign out</button>
      </form>
    </SettingsSection>
  );
}
