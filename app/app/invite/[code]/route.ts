import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serviceRoleClient } from "@/lib/supabase/service-role";

const CODE_NAME = "fg_invite_code";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const sr = serviceRoleClient();
  const { data, error } = await (sr as any)
    .from("invite_codes")
    .select("use_count, max_uses, revoked")
    .eq("code", code)
    .maybeSingle();

  if (!error && data && !data.revoked && data.use_count < data.max_uses) {
    const cookieStore = await cookies();
    cookieStore.set(CODE_NAME, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });
    return NextResponse.redirect(new URL("/auth/signup", request.url));
  }

  return NextResponse.redirect(new URL("/invite/expired", request.url));
}
