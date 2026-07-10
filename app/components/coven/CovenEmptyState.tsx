import Link from "next/link";
import InviteFriendButton from "@/components/InviteFriendButton";

export default function CovenEmptyState({ inviteCode }: { inviteCode: string | null }) {
  return (
    <section className="coven-empty">
      <h2>Start with one real person.</h2>
      <p>Kindred discovery is being prepared from your film history. Until it has evidence, search for someone you know or send them your invite.</p>
      <div className="coven-empty__actions">
        <Link prefetch={false} href="#find-people" className="btn btn-outline">Find someone</Link>
        {inviteCode && <InviteFriendButton inviteCode={inviteCode} />}
      </div>
    </section>
  );
}
