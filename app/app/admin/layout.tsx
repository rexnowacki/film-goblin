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
    <div className="admin-shell">
      <TopNav current="admin" />
      <BottomNav current="admin" />
      <div className="admin-frame container-wide">
        <div className="admin-classification"><span>Staff sanctum</span><span aria-hidden="true">⛧</span><span>Internal rites</span></div>
        {children}
      </div>
    </div>
  );
}
