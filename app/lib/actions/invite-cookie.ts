"use server";

import { cookies } from "next/headers";

const NAME = "fg_invite";
const MAX_AGE_SECONDS = 60 * 60; // 1 hour

const USERNAME_RE = /^[a-z0-9._]+$/;

export async function setInviteCookie(username: string): Promise<void> {
  if (!USERNAME_RE.test(username)) return;
  const c = await cookies();
  c.set(NAME, username, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function readInviteCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(NAME)?.value ?? null;
}

export async function clearInviteCookie(): Promise<void> {
  const c = await cookies();
  c.delete(NAME);
}

// --- invite code cookie (fg_invite_code) ---
// Stores the raw invite code string while the user navigates from
// /invite/[code] to /auth/signup. Separate from fg_invite (referrer username).

const CODE_NAME = "fg_invite_code";

export async function readInviteCodeCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(CODE_NAME)?.value ?? null;
}

export async function setInviteCodeCookie(code: string): Promise<void> {
  const c = await cookies();
  c.set(CODE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400, // 24 hours
    path: "/",
  });
}

export async function clearInviteCodeCookie(): Promise<void> {
  const c = await cookies();
  c.delete(CODE_NAME);
}
