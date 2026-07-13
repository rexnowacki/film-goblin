import { describe, expect, it } from "vitest";
import { resolveReturnContract, resolveReturnContracts } from "@/lib/return-contract/resolve";
import type { ReturnContractCandidate, ReturnContractKind } from "@/lib/return-contract/types";

const NOW = new Date("2026-07-10T12:00:00.000Z");
function candidate(kind: ReturnContractKind, overrides: Partial<ReturnContractCandidate> = {}): ReturnContractCandidate {
  return {
    kind, key: `${kind}:1`, href: "/home", title: kind, detail: "detail",
    actionLabel: "Act", changedAt: "2026-07-10T10:00:00.000Z", ...overrides,
  };
}

describe("resolveReturnContract", () => {
  it("returns an ordered stack capped at five candidates", () => {
    const result = resolveReturnContracts([
      candidate("taste_twin", { key: "taste_twin:3" }),
      candidate("profile_photo"),
      candidate("taste_twin", { key: "taste_twin:2" }),
      candidate("coven_request"),
      candidate("taste_twin", { key: "taste_twin:1" }),
      candidate("taste_twin", { key: "taste_twin:4" }),
    ].reverse(), NOW);

    expect(result.map(contract => contract.kind)).toEqual([
      "coven_request",
      "profile_photo",
      "taste_twin",
      "taste_twin",
      "taste_twin",
    ]);
  });

  it("deduplicates contract keys before applying the stack limit", () => {
    const duplicate = candidate("coven_request", { key: "coven_request:same" });
    const result = resolveReturnContracts([
      duplicate,
      { ...duplicate, changedAt: "2026-07-10T11:00:00.000Z" },
      candidate("profile_photo"),
      candidate("taste_twin", { key: "taste_twin:1" }),
      candidate("taste_twin", { key: "taste_twin:2" }),
      candidate("taste_twin", { key: "taste_twin:3" }),
      candidate("taste_twin", { key: "taste_twin:4" }),
    ], NOW);

    expect(result).toHaveLength(5);
    expect(result.filter(contract => contract.key === duplicate.key)).toHaveLength(1);
    expect(result.at(-1)?.key).toBe("taste_twin:3");
  });

  it("computes a truthful deferral ceiling for every returned candidate", () => {
    const result = resolveReturnContracts([
      candidate("coven_request"),
      candidate("profile_photo"),
    ], NOW);

    expect(result.map(contract => contract.deferUntil)).toEqual([
      "2026-07-11T12:00:00.000Z",
      "2026-07-11T12:00:00.000Z",
    ]);
  });

  it("uses the declared priority order regardless of input order", () => {
    const result = resolveReturnContract([
      candidate("taste_twin"), candidate("profile_photo"), candidate("coven_request"),
    ].reverse(), NOW);
    expect(result?.kind).toBe("coven_request");
  });

  it("excludes active deferrals and expired deadlines", () => {
    expect(resolveReturnContract([
      candidate("coven_request", { deferredUntil: "2026-07-10T12:00:01.000Z" }),
      candidate("profile_photo", { deadline: NOW.toISOString() }),
      candidate("taste_twin"),
    ], NOW)?.kind).toBe("taste_twin");
  });

  it("includes a deferral that expires exactly now", () => {
    expect(resolveReturnContract([candidate("coven_request", { deferredUntil: NOW.toISOString() })], NOW)?.kind)
      .toBe("coven_request");
  });

  it("breaks same-kind ties by deadline, change time, then key", () => {
    const result = resolveReturnContract([
      candidate("taste_twin", { key: "z", changedAt: "2026-07-10T11:00:00Z", deadline: "2026-07-12T00:00:00Z" }),
      candidate("taste_twin", { key: "b", changedAt: "2026-07-10T09:00:00Z", deadline: "2026-07-11T00:00:00Z" }),
      candidate("taste_twin", { key: "a", changedAt: "2026-07-10T09:00:00Z", deadline: "2026-07-11T00:00:00Z" }),
    ], NOW);
    expect(result?.key).toBe("a");
  });

  it("returns null when no truthful candidate remains", () => {
    expect(resolveReturnContract([], NOW)).toBeNull();
    expect(resolveReturnContract([candidate("profile_photo", { title: "" })], NOW)).toBeNull();
  });
});
