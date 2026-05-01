import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next");
  const next = safeRedirect(nextRaw, "/home");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=no_code", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, url));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at, email_added_at")
      .eq("id", user.id)
      .single();
    if (user.email && profile && !profile.email_added_at) {
      await supabase
        .from("profiles")
        .update({ email_added_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    if (!profile || !profile.onboarded_at) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
