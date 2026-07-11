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
      candidate("taste_twin"), candidate("daily_omen"), candidate("price_action"),
      candidate("gazing_invite"), candidate("recommendation"), candidate("coven_request"),
      candidate("gazing_aftermath"), candidate("gazing_upcoming"),
    ].reverse(), NOW);

    expect(result.map(contract => contract.kind)).toEqual([
      "gazing_upcoming",
      "gazing_aftermath",
      "coven_request",
      "recommendation",
      "gazing_invite",
    ]);
  });

  it("deduplicates contract keys before applying the stack limit", () => {
    const duplicate = candidate("gazing_upcoming", { key: "gazing_upcoming:same" });
    const result = resolveReturnContracts([
      duplicate,
      { ...duplicate, changedAt: "2026-07-10T11:00:00.000Z" },
      candidate("gazing_aftermath"),
      candidate("coven_request"),
      candidate("recommendation"),
      candidate("price_action"),
      candidate("daily_omen"),
    ], NOW);

    expect(result).toHaveLength(5);
    expect(result.filter(contract => contract.key === duplicate.key)).toHaveLength(1);
    expect(result.at(-1)?.kind).toBe("price_action");
  });

  it("computes a truthful deferral ceiling for every returned candidate", () => {
    const result = resolveReturnContracts([
      candidate("gazing_upcoming", { deadline: "2026-07-10T18:00:00Z" }),
      candidate("daily_omen"),
    ], NOW);

    expect(result.map(contract => contract.deferUntil)).toEqual([
      "2026-07-10T16:00:00.000Z",
      "2026-07-11T12:00:00.000Z",
    ]);
  });

  it("uses the declared priority order regardless of input order", () => {
    const result = resolveReturnContract([
      candidate("taste_twin"), candidate("daily_omen"), candidate("price_action"),
      candidate("gazing_invite"), candidate("recommendation"), candidate("coven_request"),
      candidate("gazing_aftermath"), candidate("gazing_upcoming"),
    ].reverse(), NOW);
    expect(result?.kind).toBe("gazing_upcoming");
  });

  it("excludes active deferrals and expired deadlines", () => {
    expect(resolveReturnContract([
      candidate("coven_request", { deferredUntil: "2026-07-10T12:00:01.000Z" }),
      candidate("recommendation", { deadline: NOW.toISOString() }),
      candidate("daily_omen"),
    ], NOW)?.kind).toBe("daily_omen");
  });

  it("includes a deferral that expires exactly now", () => {
    expect(resolveReturnContract([candidate("coven_request", { deferredUntil: NOW.toISOString() })], NOW)?.kind)
      .toBe("coven_request");
  });

  it("breaks same-kind ties by deadline, change time, then key", () => {
    const result = resolveReturnContract([
      candidate("recommendation", { key: "z", changedAt: "2026-07-10T11:00:00Z", deadline: "2026-07-12T00:00:00Z" }),
      candidate("recommendation", { key: "b", changedAt: "2026-07-10T09:00:00Z", deadline: "2026-07-11T00:00:00Z" }),
      candidate("recommendation", { key: "a", changedAt: "2026-07-10T09:00:00Z", deadline: "2026-07-11T00:00:00Z" }),
    ], NOW);
    expect(result?.key).toBe("a");
  });

  it("caps event deferral two hours before its deadline", () => {
    const result = resolveReturnContract([candidate("gazing_upcoming", { deadline: "2026-07-10T18:00:00Z" })], NOW);
    expect(result?.deferUntil).toBe("2026-07-10T16:00:00.000Z");
  });

  it("allows an urgent event to be set aside until, but never past, its deadline", () => {
    const result = resolveReturnContract([candidate("gazing_upcoming", { deadline: "2026-07-10T13:00:00Z" })], NOW);
    expect(result?.deferUntil).toBe("2026-07-10T13:00:00.000Z");
  });

  it("returns null when no truthful candidate remains", () => {
    expect(resolveReturnContract([], NOW)).toBeNull();
    expect(resolveReturnContract([candidate("daily_omen", { title: "" })], NOW)).toBeNull();
  });
});
