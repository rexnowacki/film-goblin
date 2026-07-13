import { describe, expect, it } from "vitest";
import { getReturnContractCopy } from "@/lib/return-contract/copy";
import type { ReturnContract, ReturnContractKind } from "@/lib/return-contract/types";

const kinds: ReturnContractKind[] = ["coven_request", "profile_photo", "taste_twin"];
describe("getReturnContractCopy", () => {
  it.each(kinds)("keeps %s literal and includes a truthful next-change line", kind => {
    const contract: ReturnContract = { kind, key: `${kind}:1`, href: "/x", title: "Moss sent you Alien.", detail: "Their recommendation awaits your answer.", actionLabel: "See Alien", changedAt: "2026-07-10T00:00:00Z", deferUntil: "2026-07-11T00:00:00Z" };
    const copy = getReturnContractCopy(contract, new Date("2026-07-10T12:00:00Z"));
    expect(copy.title).toContain("Moss");
    expect(copy.actionLabel).toContain("Alien");
    expect(copy.nextChange).not.toMatch(/soon/i);
  });
});
