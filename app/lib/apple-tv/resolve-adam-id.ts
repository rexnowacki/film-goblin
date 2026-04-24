export function extractAdamIdFromHtml(html: string): number | null {
  const m = html.match(/"adamId":"(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apple TV URLs use the format https://tv.apple.com/us/movie/<slug>/umc.cmc.<hash>.
 * The `umc.cmc.*` token is NOT the iTunes trackId — iTunes Lookup can't resolve it.
 * But the rendered Apple TV page embeds the trackId as `"adamId":"<digits>"` in its
 * server-side JSON. Fetching the page and extracting adamId gives us the trackId.
 */
export async function resolveAdamIdFromAppleTvUrl(url: string): Promise<number | null> {
  if (!/tv\.apple\.com\/.*\/umc\.cmc\./i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    });
    if (!res.ok) return null;
    return extractAdamIdFromHtml(await res.text());
  } catch { return null; }
}
