export const BADGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BADGE_IMAGE_BUCKET = "badge-images";

export type BadgeImageMime = "image/svg+xml" | "image/png";
export type BadgeImageExtension = "svg" | "png";

export type BadgeImageValidation =
  | { ok: true; bytes: Uint8Array; extension: BadgeImageExtension; contentType: BadgeImageMime }
  | { ok: false; error: string };

interface BadgeImageFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const BLOCKED_SVG_TAG = /<(?:script|foreignObject|iframe|object|embed|image|audio|video|canvas|style|a|animate|animateMotion|animateTransform|set)\b/i;
const EVENT_HANDLER = /\s+on[a-z][a-z0-9:_-]*\s*=/i;
const SOURCE_ATTRIBUTE = /\s+src\s*=/i;
const HREF_ATTRIBUTE = /\s+(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const URL_REFERENCE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function extensionFor(name: string): BadgeImageExtension | null {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match?.[1] === "svg" || match?.[1] === "png") return match[1];
  return null;
}

function expectedMime(extension: BadgeImageExtension): BadgeImageMime {
  return extension === "svg" ? "image/svg+xml" : "image/png";
}

export function validateBadgeImageMetadata(
  file: Pick<BadgeImageFile, "name" | "type" | "size">,
): { ok: true; extension: BadgeImageExtension; contentType: BadgeImageMime } | { ok: false; error: string } {
  const extension = extensionFor(file.name);
  if (!extension) return { ok: false, error: "Artwork must be an SVG or PNG file." };
  const contentType = expectedMime(extension);
  if (file.type !== contentType) {
    return { ok: false, error: `The .${extension} extension does not match the file type.` };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: "Artwork cannot be empty." };
  }
  if (file.size > BADGE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Artwork must be 2 MB or smaller." };
  }
  return { ok: true, extension, contentType };
}

function validateSvg(bytes: Uint8Array): string | null {
  let svg: string;
  try {
    svg = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").trim();
  } catch {
    return "SVG artwork must be valid UTF-8.";
  }

  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(svg)) return "SVG document types and entities are not allowed.";
  const withoutDeclaration = svg.replace(/^<\?xml\s[^?]*\?>\s*/i, "");
  const root = withoutDeclaration.match(/^<svg\b([^>]*)>/i);
  if (!root || !/<\/svg>\s*$/i.test(withoutDeclaration)) {
    return "Artwork must contain one complete SVG document.";
  }
  if (/<\?/i.test(withoutDeclaration)) return "SVG processing instructions are not allowed.";
  if (
    /\s+xmlns\s*:/i.test(svg)
    || /<\/?\s*[A-Za-z_][A-Za-z0-9_.-]*:/i.test(svg)
    || /\s+[A-Za-z_][A-Za-z0-9_.-]*:[A-Za-z_][A-Za-z0-9_.-]*\s*=/i.test(svg)
  ) {
    return "SVG namespace prefixes are not allowed.";
  }
  if (/&#(?:x[0-9a-f]+|[0-9]+);/i.test(svg) || svg.includes("\\")) {
    return "SVG encoded active content is not allowed.";
  }
  if (BLOCKED_SVG_TAG.test(svg)) return "SVG artwork contains a blocked element.";
  if (EVENT_HANDLER.test(svg)) return "SVG event handlers are not allowed.";
  if (SOURCE_ATTRIBUTE.test(svg)) return "SVG external sources are not allowed.";
  if (/\s+style\s*=/i.test(svg)) return "SVG inline styles are not allowed.";
  if (/javascript\s*:|data\s*:\s*text\/html|@import|expression\s*\(/i.test(svg)) {
    return "SVG active content is not allowed.";
  }

  HREF_ATTRIBUTE.lastIndex = 0;
  for (let match = HREF_ATTRIBUTE.exec(svg); match; match = HREF_ATTRIBUTE.exec(svg)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      return "SVG links must reference an element inside the same document.";
    }
  }

  URL_REFERENCE.lastIndex = 0;
  for (let match = URL_REFERENCE.exec(svg); match; match = URL_REFERENCE.exec(svg)) {
    const value = (match[2] ?? "").trim();
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      return "SVG paint references must stay inside the same document.";
    }
  }

  const attributes = root[1] ?? "";
  const namespace = attributes.match(/\bxmlns\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if ((namespace?.[1] ?? namespace?.[2]) !== "http://www.w3.org/2000/svg") {
    return "SVG artwork must use the standard SVG namespace.";
  }
  const viewBox = attributes.match(/\bviewBox\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  let width: number;
  let height: number;
  if (viewBox) {
    const values = (viewBox[1] ?? viewBox[2]).trim().split(/[\s,]+/).map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      return "SVG artwork has an invalid viewBox.";
    }
    width = values[2];
    height = values[3];
  } else {
    const widthMatch = attributes.match(/\bwidth\s*=\s*(?:"([0-9]+(?:\.[0-9]+)?)(?:px)?"|'([0-9]+(?:\.[0-9]+)?)(?:px)?')/i);
    const heightMatch = attributes.match(/\bheight\s*=\s*(?:"([0-9]+(?:\.[0-9]+)?)(?:px)?"|'([0-9]+(?:\.[0-9]+)?)(?:px)?')/i);
    width = Number(widthMatch?.[1] ?? widthMatch?.[2]);
    height = Number(heightMatch?.[1] ?? heightMatch?.[2]);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "SVG artwork needs a square viewBox or pixel dimensions.";
  }
  if (Math.abs(width - height) > Math.max(width, height) * 0.000001) {
    return "Badge artwork must be square.";
  }
  return null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function validatePng(bytes: Uint8Array): string | null {
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return "PNG artwork has an invalid file signature.";
  }

  let offset: number = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const chunkEnd = offset + 12 + length;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) {
      return "PNG artwork contains a truncated chunk.";
    }
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) return "PNG artwork contains an invalid chunk.";

    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return "PNG artwork must begin with a valid IHDR chunk.";
      sawHeader = true;
      const width = readUint32(bytes, offset + 8);
      const height = readUint32(bytes, offset + 12);
      if (width === 0 || height === 0 || width > 4096 || height > 4096) {
        return "PNG artwork dimensions must be between 1 and 4096 pixels.";
      }
      if (width !== height) return "Badge artwork must be square.";
    } else if (type === "IHDR") {
      return "PNG artwork contains more than one IHDR chunk.";
    }

    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || chunkEnd !== bytes.length || !sawImageData) {
        return "PNG artwork has an invalid ending.";
      }
      return null;
    }
    offset = chunkEnd;
  }
  return "PNG artwork is incomplete.";
}

export function validateBadgeImageContent(
  bytes: Uint8Array,
  contentType: BadgeImageMime,
): string | null {
  if (contentType === "image/png") return validatePng(bytes);
  return validateSvg(bytes);
}

export async function validateBadgeImage(file: BadgeImageFile): Promise<BadgeImageValidation> {
  const metadata = validateBadgeImageMetadata(file);
  if (!metadata.ok) return metadata;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Artwork could not be read." };
  }
  if (bytes.byteLength !== file.size) return { ok: false, error: "Artwork size changed while reading." };
  const contentError = validateBadgeImageContent(bytes, metadata.contentType);
  if (contentError) return { ok: false, error: contentError };
  return { ok: true, bytes, extension: metadata.extension, contentType: metadata.contentType };
}
