import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import AnnouncementForm from "../AnnouncementForm";

export default async function NewAnnouncementPage() {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") redirect("/auth/signin");
  if (access === "not-admin") redirect("/");

  // Pull every profile for the recipient picker. Fine at the current scale
  // (~25 users); flagged as a follow-up in the spec for 1k+ users.
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .order("username", { ascending: true });

  if (error) throw error;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <h1 className="h-display" style={{ fontSize: 36, marginBottom: 24 }}>
        New announcement
      </h1>
      <AnnouncementForm profiles={profiles ?? []} />
    </div>
  );
}
