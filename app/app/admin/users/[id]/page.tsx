import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserForAdmin } from "@/lib/queries/admin/users";
import DeleteUserModal from "../DeleteUserModal";
import RoleControl from "./RoleControl";
import ResetPasswordButton from "./ResetPasswordButton";

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserForAdmin(id);
  if (!user) notFound();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 className="h-display" style={{ margin: 0 }}>@{user.username}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/users" className="btn btn-sm btn-outline">← Back</Link>
          <Link href={`/p/${user.username}`} className="btn btn-sm btn-outline">Public profile →</Link>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Section title="Role">
          <RoleControl userId={user.id} currentRole={user.role} />
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 28 }}>
        <Section title="Profile">
          <Field label="Username" value={`@${user.username}`} />
          <Field label="Display name" value={user.display_name ?? "—"} />
          <Field label="Bio" value={user.bio ?? "—"} />
          <Field label="Staff row" value={user.staff_role ?? "—"} />
        </Section>
        <Section title="Auth">
          <Field label="Email" value={user.email ?? "—"} />
          <Field label="Created" value={fmtDate(user.created_at)} />
          <Field label="Last sign-in" value={fmtDate(user.last_sign_in_at)} />
          <Field label="Last activity" value={fmtDate(user.last_activity_at)} />
          <Field label="Identity providers" value={user.identities.length ? user.identities.join(", ") : "—"} />
          <ResetPasswordButton userId={user.id} />
        </Section>
      </div>

      <div style={{ borderTop: "1px solid var(--blood)", paddingTop: 20 }}>
        <div className="caps" style={{ color: "var(--blood)", fontSize: 12, marginBottom: 10 }}>Danger zone</div>
        <DeleteUserModal
          userId={user.id}
          username={user.username}
          email={user.email}
          createdAt={user.created_at}
          lastSignInAt={user.last_sign_in_at}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--void-2)", border: "1px solid #333", padding: 16 }}>
      <div className="caps" style={{ fontSize: 11, marginBottom: 10, color: "var(--accent)" }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
