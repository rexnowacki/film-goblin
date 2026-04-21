export function upscaleArtworkUrl(url: string): string {
  if (!url) return url;
  return url.replace("/100x100bb.jpg", "/600x600bb.jpg");
}
