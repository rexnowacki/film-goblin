import { describe, expect, it } from "vitest";
import {
  buildReturnContractHref,
  canDeferReturnContract,
  getSwipeDirection,
  moveReturnContractIndex,
  reconcileReturnContractIndex,
  removeReturnContract,
} from "@/lib/return-contract/queue";
import type { ReturnContract } from "@/lib/return-contract/types";

function contract(key: string, href = "/home"): ReturnContract {
  return {
    kind: "profile_photo",
    key,
    href,
    title: key,
    detail: "detail",
    actionLabel: "Act",
    changedAt: "2026-07-10T12:00:00.000Z",
    deferUntil: "2026-07-11T12:00:00.000Z",
  };
}

describe("return-contract queue", () => {
  it("wraps previous and next browsing without changing the queue", () => {
    expect(moveReturnContractIndex(0, 3, "previous")).toBe(2);
    expect(moveReturnContractIndex(2, 3, "next")).toBe(0);
    expect(moveReturnContractIndex(1, 3, "next")).toBe(2);
  });

  it("removes the active contract and advances to the following candidate", () => {
    const contracts = [contract("a"), contract("b"), contract("c")];
    const middle = removeReturnContract(contracts, "b", 1);
    expect(middle.contracts.map(item => item.key)).toEqual(["a", "c"]);
    expect(middle.index).toBe(1);
    expect(middle.contracts[middle.index]?.key).toBe("c");

    const last = removeReturnContract(contracts, "c", 2);
    expect(last.contracts.map(item => item.key)).toEqual(["a", "b"]);
    expect(last.index).toBe(0);
    expect(last.contracts[last.index]?.key).toBe("a");
  });

  it("leaves an empty queue in a stable state", () => {
    expect(removeReturnContract([contract("a")], "a", 0)).toEqual({ contracts: [], index: 0 });
  });

  it("preserves the browsed contract by key when fresh server props reorder the queue", () => {
    const current = [contract("a"), contract("b"), contract("c")];
    const incoming = [contract("new"), ...current];
    expect(reconcileReturnContractIndex(current, 1, incoming)).toBe(2);
  });

  it("clamps the index when the browsed contract disappears from fresh server props", () => {
    const current = [contract("a"), contract("b"), contract("c")];
    expect(reconcileReturnContractIndex(current, 2, [contract("a"), contract("b")])).toBe(1);
    expect(reconcileReturnContractIndex(current, 2, [])).toBe(0);
  });

  it("recognizes deliberate horizontal swipes but ignores short or vertical gestures", () => {
    expect(getSwipeDirection({ x: 180, y: 20 }, { x: 80, y: 26 })).toBe("next");
    expect(getSwipeDirection({ x: 80, y: 20 }, { x: 180, y: 26 })).toBe("previous");
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 70, y: 20 })).toBeNull();
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 40, y: 110 })).toBeNull();
  });

  it("sets one canonical attribution value instead of duplicating query parameters", () => {
    const item = contract("profile_photo:user-1", "/settings?src=old&contract_key=old#your-face");
    const href = buildReturnContractHref(item);
    const query = new URL(href, "https://freshfromthepit.com").searchParams;

    expect(query.getAll("src")).toEqual(["return_contract"]);
    expect(query.getAll("contract_kind")).toEqual(["profile_photo"]);
    expect(query.getAll("contract_key")).toEqual([item.key]);
    expect(new URL(href, "https://freshfromthepit.com").hash).toBe("#your-face");
  });

  it("does not offer a deferral whose deadline-aware ceiling has already arrived", () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    expect(canDeferReturnContract(contract("a"), now)).toBe(true);
    expect(canDeferReturnContract({ ...contract("a"), deferUntil: now.toISOString() }, now)).toBe(false);
  });
});
