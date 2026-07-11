import { describe, expect, it } from "vitest";
import { formatProfileJoinedDate, formatProfileStat } from "@/lib/profile-page";

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
});
