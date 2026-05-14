// Pure helper used by both the server action and any client previews.
// `@bob.42` matches; `email@example.com` does not (negative lookbehind).
export const MENTION_RE = /(?<![a-z0-9._])@([a-z0-9._]+)/gi;

export function parseMentionUsernames(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  while ((m = re.exec(body)) !== null) {
    let u = m[1].toLowerCase();
    while (u.endsWith(".")) u = u.slice(0, -1);
    if (u.length > 0 && u.length <= 32) out.add(u);
  }
  return Array.from(out);
}
