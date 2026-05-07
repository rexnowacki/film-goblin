import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { serviceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json(null, { status: 400 });
  const svc = serviceRoleClient();
  const { data } = await (svc.from("film_requests") as any).select("*").eq("id", id).single();
  return NextResponse.json(data ?? null);
}
