import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/cached";

export default async function OnboardingPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/signin?next=/onboarding");
  // Wizard coming in a later task
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>Loading ritual…</p>
    </div>
  );
}
