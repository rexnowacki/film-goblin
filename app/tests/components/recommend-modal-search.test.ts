import { describe, it, expect } from "vitest";
import { filterCovenMembers, type Searchable } from "@/components/recommend-modal-search";

const A: Searchable = { id: "a", username: "alice", display_name: "Alice" };
const B: Searchable = { id: "b", username: "bob",   display_name: "Bobby Bones" };
const C: Searchable = { id: "c", username: "cici",  display_name: null };
const ALL = [A, B, C];

describe("filterCovenMembers", () => {
  it("empty query returns empty array", () => {
    expect(filterCovenMembers(ALL, "")).toEqual([]);
    expect(filterCovenMembers(ALL, "   ")).toEqual([]);
  });

  it("matches a substring of username", () => {
    expect(filterCovenMembers(ALL, "lic").map(m => m.id)).toEqual(["a"]);
  });

  it("matches a substring of display_name", () => {
    expect(filterCovenMembers(ALL, "bone").map(m => m.id)).toEqual(["b"]);
  });

  it("is case-insensitive", () => {
    expect(filterCovenMembers(ALL, "ALICE").map(m => m.id)).toEqual(["a"]);
    expect(filterCovenMembers(ALL, "BoBbY").map(m => m.id)).toEqual(["b"]);
  });

  it("returns multiple matches preserving input order", () => {
    expect(filterCovenMembers(ALL, "i").map(m => m.id)).toEqual(["a", "c"]);
  });

  it("members with null display_name match by username only", () => {
    expect(filterCovenMembers(ALL, "cici").map(m => m.id)).toEqual(["c"]);
    expect(filterCovenMembers(ALL, "nope").map(m => m.id)).toEqual([]);
  });

  it("trims whitespace before matching", () => {
    expect(filterCovenMembers(ALL, "  bob  ").map(m => m.id)).toEqual(["b"]);
  });
});
