import { getMyInviteCode } from "@/lib/queries/invite-codes";
import CopyInviteButton from "@/components/settings/CopyInviteButton";
import SettingsSection from "@/components/settings/SettingsSection";

const BASE_URL = "https://film-goblin.vercel.app";

export default async function InviteLinkSection({ userId }: { userId: string }) {
  const code = await getMyInviteCode(userId);
  if (!code) return null;

  const url = `${BASE_URL}/invite/${code.code}`;
  const exhausted = code.use_count >= code.max_uses;

  return (
    <SettingsSection id="invites" eyebrow="Invites" title="Your invite link">
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 13,
          margin: "0 0 4px",
          opacity: 0.75,
          lineHeight: 1.5,
        }}
      >
        Share this link to invite someone to Film Goblin.
      </p>
      <CopyInviteButton url={url} />
      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: exhausted ? "var(--danger)" : "var(--muted)",
        }}
      >
        {exhausted
          ? "All invites used — contact an admin for more slots."
          : `${code.use_count} of ${code.max_uses} used`}
      </div>
    </SettingsSection>
  );
}
