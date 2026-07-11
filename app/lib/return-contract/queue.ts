import type { ReturnContract } from "./types";

export type ReturnContractBrowseDirection = "previous" | "next";

export interface ReturnContractPoint {
  x: number;
  y: number;
}

export function moveReturnContractIndex(
  index: number,
  length: number,
  direction: ReturnContractBrowseDirection,
): number {
  if (length <= 0) return 0;
  const normalized = ((index % length) + length) % length;
  return direction === "next"
    ? (normalized + 1) % length
    : (normalized - 1 + length) % length;
}

export function removeReturnContract(
  contracts: ReturnContract[],
  contractKey: string,
  currentIndex: number,
): { contracts: ReturnContract[]; index: number } {
  const removedIndex = contracts.findIndex(contract => contract.key === contractKey);
  if (removedIndex < 0) {
    return {
      contracts,
      index: contracts.length ? Math.min(Math.max(currentIndex, 0), contracts.length - 1) : 0,
    };
  }

  const remaining = contracts.filter(contract => contract.key !== contractKey);
  if (remaining.length === 0) return { contracts: [], index: 0 };
  return {
    contracts: remaining,
    index: removedIndex < remaining.length ? removedIndex : 0,
  };
}

export function reconcileReturnContractIndex(
  currentContracts: ReturnContract[],
  currentIndex: number,
  incomingContracts: ReturnContract[],
): number {
  if (incomingContracts.length === 0) return 0;
  const normalizedCurrent = currentContracts.length
    ? Math.min(Math.max(currentIndex, 0), currentContracts.length - 1)
    : 0;
  const currentKey = currentContracts[normalizedCurrent]?.key;
  const preservedIndex = currentKey
    ? incomingContracts.findIndex(contract => contract.key === currentKey)
    : -1;
  return preservedIndex >= 0
    ? preservedIndex
    : Math.min(normalizedCurrent, incomingContracts.length - 1);
}

export function getSwipeDirection(
  start: ReturnContractPoint,
  end: ReturnContractPoint,
): ReturnContractBrowseDirection | null {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (horizontal < 48 || horizontal <= vertical * 1.25) return null;
  return deltaX < 0 ? "next" : "previous";
}

export function buildReturnContractHref(contract: ReturnContract): string {
  const url = new URL(contract.href, "https://freshfromthepit.invalid");
  url.searchParams.set("src", "return_contract");
  url.searchParams.set("contract_kind", contract.kind);
  url.searchParams.set("contract_key", contract.key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function canDeferReturnContract(contract: ReturnContract, now: Date): boolean {
  const deferUntil = Date.parse(contract.deferUntil);
  return Number.isFinite(deferUntil) && deferUntil > now.getTime();
}
