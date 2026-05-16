import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAdminAccess } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const access = await checkAdminAccess(supabase);
  if (access === "not-authed") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (access === "not-admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const svc = serviceRoleClient();
  const { data, error } = await (svc.from("film_requests") as any).select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "failed to load request" }, { status: 500 });

  return NextResponse.json(data ?? null);
}
