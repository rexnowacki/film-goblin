export function safeRedirect(path: string | null | undefined, fallback = "/home"): string {
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  return path;
}
