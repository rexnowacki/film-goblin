import { describe, expect, it } from "vitest";
import { generateGazingToken } from "@/lib/gazing/token";

describe("generateGazingToken", () => {
  it("produces url-safe tokens of stable length", () => {
    const a = generateGazingToken();
    const b = generateGazingToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(a).not.toBe(b);
  });
});
