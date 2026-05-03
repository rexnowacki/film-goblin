import { describe, it, expect } from "vitest";
import {
  validateAnnouncement,
  isInternalPath,
  TITLE_MAX,
  BODY_MAX,
  CTA_LABEL_MAX,
} from "../../../lib/actions/admin/announcement-validation";

describe("isInternalPath", () => {
  it("accepts a leading-slash path", () => {
    expect(isInternalPath("/films")).toBe(true);
    expect(isInternalPath("/film/abc-123")).toBe(true);
    expect(isInternalPath("/admin/films?untagged=1")).toBe(true);
  });

  it("rejects an external URL", () => {
    expect(isInternalPath("https://example.com")).toBe(false);
    expect(isInternalPath("//evil.com/path")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects a relative path with no leading slash", () => {
    expect(isInternalPath("films")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });

  it("rejects paths containing .. traversal", () => {
    expect(isInternalPath("/..")).toBe(false);
    expect(isInternalPath("/foo/../bar")).toBe(false);
  });

  it("accepts paths with fragment anchors", () => {
    expect(isInternalPath("/films#new")).toBe(true);
    expect(isInternalPath("/film/abc#section-2")).toBe(true);
  });
});

describe("validateAnnouncement", () => {
  const validBase = {
    title: "Hello",
    body: "Body text",
    cta_label: null,
    cta_href: null,
    audience: "everyone" as const,
    recipient_ids: [],
    panel_color: "plum" as const,
    title_color: "bone" as const,
    body_color: "bone" as const,
    cta_color: "pink" as const,
  };

  it("passes a minimal valid announcement", () => {
    expect(validateAnnouncement(validBase)).toBeNull();
  });

  it("rejects empty title", () => {
    expect(validateAnnouncement({ ...validBase, title: "   " })).toMatch(/title/i);
  });

  it("rejects empty body", () => {
    expect(validateAnnouncement({ ...validBase, body: "" })).toMatch(/body/i);
  });

  it(`rejects title longer than ${TITLE_MAX}`, () => {
    expect(validateAnnouncement({ ...validBase, title: "x".repeat(TITLE_MAX + 1) })).toMatch(/title/i);
  });

  it(`rejects body longer than ${BODY_MAX}`, () => {
    expect(validateAnnouncement({ ...validBase, body: "x".repeat(BODY_MAX + 1) })).toMatch(/body/i);
  });

  it("requires both CTA fields when one is set", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: null })).toMatch(/cta/i);
    expect(validateAnnouncement({ ...validBase, cta_label: null, cta_href: "/x" })).toMatch(/cta/i);
  });

  it("accepts a complete CTA pair", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: "/films" })).toBeNull();
  });

  it("rejects a CTA href that is not internal", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: "https://evil.com" })).toMatch(/cta/i);
  });

  it(`rejects CTA label longer than ${CTA_LABEL_MAX}`, () => {
    expect(validateAnnouncement({
      ...validBase,
      cta_label: "x".repeat(CTA_LABEL_MAX + 1),
      cta_href: "/x",
    })).toMatch(/cta/i);
  });

  it("rejects audience='specific' with empty recipients", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: [],
    })).toMatch(/recipient/i);
  });

  it("accepts audience='specific' with at least one recipient", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: ["00000000-0000-0000-0000-000000000001"],
    })).toBeNull();
  });

  it("rejects empty-string CTA label when href is set", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "", cta_href: "/x" })).toMatch(/cta/i);
  });

  it("rejects whitespace-only CTA label", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "   ", cta_href: "/x" })).toMatch(/cta/i);
  });

  it("rejects a CTA href containing .. traversal", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Go", cta_href: "/films/../etc" })).toMatch(/cta/i);
  });

  it("accepts a CTA href with a fragment anchor", () => {
    expect(validateAnnouncement({ ...validBase, cta_label: "Jump", cta_href: "/films#new" })).toBeNull();
  });

  it("dedupes duplicate recipient ids without raising an error", () => {
    expect(validateAnnouncement({
      ...validBase,
      audience: "specific",
      recipient_ids: ["a", "a", "b"],
    })).toBeNull();
  });
});
