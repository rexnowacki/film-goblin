import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = ["/auth/signin", "/auth/signup"];
const AUTH_REQUIRED = ["/home", "/onboarding", "/settings", "/coven"];

/**
 * Pure redirect decision — exported for testing.
 */
export function decideRedirect(
  user: { id: string } | null,
  path: string
): { target: string; preserveRedirect: boolean } | null {
  if (!user && AUTH_REQUIRED.some(p => path.startsWith(p))) {
    return { target: "/auth/signin", preserveRedirect: true };
  }
  if (user && path === "/") {
    return { target: "/home", preserveRedirect: false };
  }
  if (user && AUTH_PAGES.includes(path)) {
    return { target: "/home", preserveRedirect: false };
  }
  return null;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const decision = decideRedirect(user, request.nextUrl.pathname);

  if (decision) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = decision.target;
    if (decision.preserveRedirect) {
      redirect.searchParams.set("redirect", request.nextUrl.pathname);
    }
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
