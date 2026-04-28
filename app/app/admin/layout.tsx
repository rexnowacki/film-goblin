import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const result = await checkAdminAccess(supabase);
  if (result === "not-authed") redirect("/auth/signin");
  if (result === "not-admin") redirect("/home");

  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNav current="admin" />
      <BottomNav current="admin" />
      <div className="container-wide" style={{ padding: "32px var(--container-pad)" }}>
        <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 6 }}>✦ Internal ✦</div>
        {children}
      </div>
    </div>
  );
}
