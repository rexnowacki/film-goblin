import { describe, expect, it } from "vitest";
import {
  formatProfileJoinedDate,
  formatProfileStat,
  getProfileCovenPreview,
  PROFILE_COVEN_INLINE_LIMIT,
} from "@/lib/profile-page";

describe("profile page formatting", () => {
  it("formats the joined month in UTC", () => {
    expect(formatProfileJoinedDate("2023-03-31T23:30:00-07:00")).toBe("Joined April 2023");
  });

  it("fails closed for a bad date", () => {
    expect(formatProfileJoinedDate("not-a-date")).toBe("Joined the pit");
  });

  it("formats counts while preserving private values", () => {
    expect(formatProfileStat(1248)).toBe("1,248");
    expect(formatProfileStat(null)).toBe("—");
  });

  it("caps the inline coven roster at eight without reordering", () => {
    const members = Array.from({ length: 11 }, (_, index) => `member-${index}`);
    expect(getProfileCovenPreview(members)).toEqual(members.slice(0, PROFILE_COVEN_INLINE_LIMIT));
    expect(getProfileCovenPreview(members)).toHaveLength(8);
  });
});
