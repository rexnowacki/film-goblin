import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/auth/friendly-errors";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeRedirect(url.searchParams.get("next") ?? url.searchParams.get("redirect"));
  const origin = url.origin;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(
      new URL(`/auth/signin?error=${encodeURIComponent(friendlyError(error ?? "OAuth provider unreachable"))}`, url),
    );
  }

  return NextResponse.redirect(data.url);
}
