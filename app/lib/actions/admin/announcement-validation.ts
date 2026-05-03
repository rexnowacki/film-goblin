export const TITLE_MAX = 80;
export const BODY_MAX = 500;
export const CTA_LABEL_MAX = 24;

// Internal app path: must start with `/`, must not be protocol-relative
// (`//evil.com`), must not contain `..` (traversal), may contain fragment
// anchors (`/films#section`). Bare `/` is allowed.
const INTERNAL_PATH_RE = /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9/_\-.#?=&%]*$/;

export function isInternalPath(s: string): boolean {
  return INTERNAL_PATH_RE.test(s);
}

export interface AnnouncementInput {
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  audience: "everyone" | "specific";
  recipient_ids: string[];
}

/**
 * Returns null when valid, or a human-readable error string. The string is
 * surfaced verbatim to the admin UI.
 *
 * Note: title and body are validated against their TRIMMED forms, but this
 * function returns null/string only — callers must re-trim before persisting
 * (see app/lib/actions/admin/announcements.ts).
 */
export function validateAnnouncement(input: AnnouncementInput): string | null {
  const title = input.title.trim();
  if (!title) return "Title is required.";
  if (title.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer.`;

  const body = input.body.trim();
  if (!body) return "Body is required.";
  if (body.length > BODY_MAX) return `Body must be ${BODY_MAX} characters or fewer.`;

  const labelSet = input.cta_label !== null;
  const hrefSet = input.cta_href !== null;
  if (labelSet !== hrefSet) {
    return "CTA label and URL must both be set, or both empty.";
  }
  if (labelSet && hrefSet) {
    if (input.cta_label!.trim().length === 0) return "CTA label is required.";
    if (input.cta_label!.length > CTA_LABEL_MAX) return `CTA label must be ${CTA_LABEL_MAX} characters or fewer.`;
    if (!isInternalPath(input.cta_href!)) return "CTA URL must be an internal path starting with /.";
  }

  if (input.audience === "specific") {
    const unique = new Set(input.recipient_ids);
    if (unique.size === 0) return "Pick at least one recipient.";
  }

  return null;
}
