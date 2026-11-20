import { NextResponse, type NextRequest } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import {
  STUDY_BUCKET,
  STUDY_COOKIE,
  STUDY_MAX_AGE_SECONDS,
  checkStudyLogin,
  injectBaseHref,
  readStudyEnv,
  signStudySession,
  studyContentType,
  studyObjectPath,
  verifyStudySession,
} from "@/lib/study/session";

/**
 * Private study site (RAD 155 positioning cards) behind one shared login.
 * Files are streamed from the private STUDY_BUCKET; the service-role client is
 * used only after the study session cookie verifies (this gate stands in for
 * requireAdmin — the bucket is not readable by anon or authenticated roles).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

type Ctx = { params: Promise<{ path?: string[] }> };

function loginPage(error = "", status = 200): NextResponse {
  const msg = error ? `<p class="err">${error}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Study site sign in</title><style>
:root{--bg:#eef0f3;--panel:#fff;--ink:#111;--muted:#666;--line:#d6d9de;--accent:#8a1c1c}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--panel:#202329;--ink:#eceef1;--muted:#9aa0a8;--line:#33373e;--accent:#e07a7a}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;padding:16px}
form{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px;width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px}
h1{font-size:19px;margin:0}p{margin:0;color:var(--muted);font-size:13px}
label{font-size:13px;display:flex;flex-direction:column;gap:4px}
input{font:inherit;font-size:16px;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
button{font:inherit;font-size:15px;font-weight:600;padding:10px;border-radius:8px;border:0;background:var(--accent);color:#fff;cursor:pointer}
.err{color:#b3261e;font-weight:600}
</style></head><body><form method="post" action="/study/login">
<h1>Study site</h1><p>Program members only.</p>${msg}
<label>Username<input name="username" autocomplete="username" autocapitalize="none" required></label>
<label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Sign in</button></form></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...NOINDEX },
  });
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function notConfigured(): NextResponse {
  return new NextResponse("Study site is not configured.", { status: 503, headers: NOINDEX });
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const env = readStudyEnv();
  if (!env) return notConfigured();
  const { path } = await ctx.params;
  const authed = verifyStudySession(request.cookies.get(STUDY_COOKIE)?.value, env.secret);

  if (path?.length === 1 && path[0] === "login") {
    return authed ? redirectTo(request, "/study/") : loginPage();
  }
  if (path?.length === 1 && path[0] === "logout") {
    const res = redirectTo(request, "/study/login");
    res.cookies.set(STUDY_COOKIE, "", { path: "/study", maxAge: 0 });
    return res;
  }
  if (!authed) return redirectTo(request, "/study/login");

  const objectPath = studyObjectPath(path);
  if (!objectPath) return new NextResponse("Not found", { status: 404, headers: NOINDEX });

  const { data, error } = await serviceRoleClient().storage.from(STUDY_BUCKET).download(objectPath);
  if (error || !data) return new NextResponse("Not found", { status: 404, headers: NOINDEX });

  const type = studyContentType(objectPath);
  const isHtml = type.startsWith("text/html");
  const body = isHtml ? injectBaseHref(await data.text()) : await data.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      // Private: browsers may cache images, shared caches never store anything.
      "Cache-Control": isHtml ? "private, no-store" : "private, max-age=86400",
      ...NOINDEX,
    },
  });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const env = readStudyEnv();
  if (!env) return notConfigured();
  const { path } = await ctx.params;
  if (!(path?.length === 1 && path[0] === "login")) {
    return new NextResponse("Method not allowed", { status: 405, headers: NOINDEX });
  }
  let username = "";
  let password = "";
  try {
    const form = await request.formData();
    username = String(form.get("username") ?? "");
    password = String(form.get("password") ?? "");
  } catch {
    return loginPage("Enter a username and password.", 400);
  }
  if (!checkStudyLogin(username, password, env)) {
    // Small fixed delay slows down password guessing.
    await new Promise(resolve => setTimeout(resolve, 700));
    return loginPage("Wrong username or password.", 401);
  }
  const res = redirectTo(request, "/study/");
  res.cookies.set(STUDY_COOKIE, signStudySession(env.secret), {
    path: "/study",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STUDY_MAX_AGE_SECONDS,
  });
  return res;
}
