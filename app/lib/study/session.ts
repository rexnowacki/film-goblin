import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shared-password gate for the private study site served at /study.
 *
 * The site's files (textbook figures, instructor slide content) live in the
 * private Supabase Storage bucket STUDY_BUCKET, never in this public repo.
 * One shared account; credentials and the cookie-signing secret come from env:
 * STUDY_USERNAME, STUDY_PASSWORD, STUDY_SESSION_SECRET.
 */
export const STUDY_BUCKET = "study-site";
export const STUDY_COOKIE = "fg_study";
export const STUDY_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type StudyEnv = { username: string; password: string; secret: string };

export function readStudyEnv(env: Record<string, string | undefined> = process.env): StudyEnv | null {
  const username = env.STUDY_USERNAME;
  const password = env.STUDY_PASSWORD;
  const secret = env.STUDY_SESSION_SECRET;
  if (!username || !password || !secret || secret.length < 32) return null;
  return { username, password, secret };
}

/** Constant-time string compare that doesn't leak length (both sides hashed first). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkStudyLogin(username: string, password: string, env: StudyEnv): boolean {
  // Evaluate both so a wrong username takes the same time as a wrong password.
  const userOk = safeEqual(username.trim(), env.username);
  const passOk = safeEqual(password, env.password);
  return userOk && passOk;
}

function mac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Token format: "<expiry unix seconds>.<HMAC of 'study:v1:<expiry>'>". */
export function signStudySession(secret: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + STUDY_MAX_AGE_SECONDS;
  return `${exp}.${mac(secret, `study:v1:${exp}`)}`;
}

export function verifyStudySession(token: string | undefined, secret: string, nowMs: number = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expText = token.slice(0, dot);
  if (!/^\d{1,12}$/.test(expText)) return false;
  const exp = Number(expText);
  if (exp * 1000 <= nowMs) return false;
  return safeEqual(token.slice(dot + 1), mac(secret, `study:v1:${exp}`));
}

/**
 * Map URL segments under /study to an object path in the bucket.
 * Returns null for anything that could escape the bucket prefix or isn't a
 * plain file path. No segments means the site's index.html.
 */
export function studyObjectPath(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return "index.html";
  for (const s of segments) {
    if (s === "" || s === "." || s === ".." || !/^[A-Za-z0-9._-]+$/.test(s)) return null;
  }
  return segments.join("/");
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
};

export function studyContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

/** Relative asset URLs in the study site need a base, since /study/ may be served as /study. */
export function injectBaseHref(html: string): string {
  if (html.includes("<base ")) return html;
  return html.replace(/<head>/i, '<head><base href="/study/">');
}
