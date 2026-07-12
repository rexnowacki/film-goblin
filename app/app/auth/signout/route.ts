import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthCookie } from "@/lib/auth/supabase-cookies";

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (isSupabaseAuthCookie(cookie.name)) store.delete(cookie.name);
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl), 303);
}
