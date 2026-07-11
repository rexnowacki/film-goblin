"use client";

import { useEffect, useId, useRef, useState, useTransition, type PointerEvent } from "react";
import Link from "next/link";
import { deferReturnContract } from "@/lib/actions/return-contract";
import { getReturnContractCopy } from "@/lib/return-contract/copy";
import {
  buildReturnContractHref,
  canDeferReturnContract,
  getSwipeDirection,
  moveReturnContractIndex,
  removeReturnContract,
  type ReturnContractBrowseDirection,
  type ReturnContractPoint,
} from "@/lib/return-contract/queue";
import {
  firstUnreviewedReturnContractIndex,
  isReturnContractQueueExhausted,
  markReturnContractReviewed,
  reconcileReturnContractProgress,
  type ReturnContractProgressScope,
  type ReturnContractProgressStorage,
} from "@/lib/return-contract/progress";
import type { ReturnContract } from "@/lib/return-contract/types";
import ReturnContractTracker from "./ReturnContractTracker";

interface Props {
  contracts: ReturnContract[];
  viewerId: string;
  utcDay: string;
}

function browserProgressStorage(): ReturnContractProgressStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function NextInThePit({ contracts, viewerId, utcDay }: Props) {
  const [items, setItems] = useState(contracts);
  const [index, setIndex] = useState(0);
  const [progressReady, setProgressReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const swipeStart = useRef<ReturnContractPoint | null>(null);
  const itemsRef = useRef(items);
  const indexRef = useRef(0);
  const reviewedKeysRef = useRef(new Set<string>());
  const progressScopeRef = useRef<ReturnContractProgressScope | null>(null);
  const titleId = useId();
  itemsRef.current = items;

  useEffect(() => {
    const scope = { userId: viewerId, utcDay };
    const reviewed = reconcileReturnContractProgress(
      browserProgressStorage(),
      scope,
      progressScopeRef.current,
      reviewedKeysRef.current,
    );
    const keys = contracts.map(contract => contract.key);
    const firstUnreviewed = firstUnreviewedReturnContractIndex(keys, reviewed);
    progressScopeRef.current = scope;
    reviewedKeysRef.current = reviewed;

    if (isReturnContractQueueExhausted(keys, reviewed)) {
      itemsRef.current = [];
      indexRef.current = 0;
      setItems([]);
      setIndex(0);
      setProgressReady(true);
      return;
    }

    const nextIndex = firstUnreviewed >= 0 ? firstUnreviewed : 0;
    itemsRef.current = contracts;
    indexRef.current = nextIndex;
    setItems(contracts);
    setIndex(nextIndex);
    setProgressReady(true);
  }, [contracts, utcDay, viewerId]);

  if (!progressReady || items.length === 0) return null;
  const activeIndex = Math.min(index, items.length - 1);
  indexRef.current = activeIndex;
  const contract = items[activeIndex];
  const copy = getReturnContractCopy(contract, new Date());
  const href = buildReturnContractHref(contract);
  const canDefer = canDeferReturnContract(contract, new Date());

  const reviewActiveContract = (): boolean => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) return false;
    const currentIndex = Math.min(Math.max(indexRef.current, 0), currentItems.length - 1);
    const activeKey = currentItems[currentIndex]?.key;
    if (!activeKey) return false;

    const reviewed = markReturnContractReviewed(
      browserProgressStorage(),
      viewerId,
      utcDay,
      activeKey,
      reviewedKeysRef.current,
    );
    reviewedKeysRef.current = reviewed;
    if (!isReturnContractQueueExhausted(currentItems.map(item => item.key), reviewed)) return false;

    itemsRef.current = [];
    indexRef.current = 0;
    setItems([]);
    setIndex(0);
    return true;
  };

  const browse = (direction: ReturnContractBrowseDirection) => {
    const currentItems = itemsRef.current;
    if (pending || currentItems.length < 2) return;
    setError(null);
    if (reviewActiveContract()) return;
    const nextIndex = moveReturnContractIndex(indexRef.current, currentItems.length, direction);
    indexRef.current = nextIndex;
    setIndex(nextIndex);
  };

  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || pending || items.length < 2) return;
    const direction = getSwipeDirection(start, { x: event.clientX, y: event.clientY });
    if (direction) browse(direction);
  };

  const setAside = () => {
    if (pending || !canDefer) return;
    const previousItems = items;
    const previousIndex = activeIndex;
    const next = removeReturnContract(items, contract.key, activeIndex);
    const remainingReviewed = isReturnContractQueueExhausted(
      next.contracts.map(item => item.key),
      reviewedKeysRef.current,
    );
    const optimisticItems = remainingReviewed ? [] : next.contracts;
    const optimisticIndex = remainingReviewed ? 0 : next.index;
    itemsRef.current = optimisticItems;
    indexRef.current = optimisticIndex;
    setItems(optimisticItems);
    setIndex(optimisticIndex);
    setError(null);
    startTransition(async () => {
      try {
        await deferReturnContract(contract.key, contract.deferUntil);
      } catch {
        itemsRef.current = previousItems;
        indexRef.current = previousIndex;
        setItems(previousItems);
        setIndex(previousIndex);
        setError("The pit would not let go. Try again.");
      }
    });
  };

  return (
    <section className="return-contract" aria-labelledby={titleId} aria-roledescription="carousel">
      <ReturnContractTracker contractKey={contract.key} kind={contract.kind} />
      <div className="return-contract__topline">
        <span className="eyebrow">{copy.eyebrow}</span>
        <div className="return-contract__controls">
          {items.length > 1 && (
            <div className="return-contract__browse" role="group" aria-label="Browse Next in the Pit">
              <button type="button" className="return-contract__arrow" aria-label="Previous item" disabled={pending} onClick={() => browse("previous")}>←</button>
              <span
                className="return-contract__counter"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`Showing ${activeIndex + 1} of ${items.length}: ${copy.title}`}
              >
                {activeIndex + 1} / {items.length}
              </span>
              <button type="button" className="return-contract__arrow" aria-label="Next item" disabled={pending} onClick={() => browse("next")}>→</button>
            </div>
          )}
          {canDefer && (
            <button type="button" className="return-contract__dismiss" aria-label="Set this aside" disabled={pending} onClick={setAside}>Set aside</button>
          )}
        </div>
      </div>
      <div
        className="return-contract__swipe-zone"
        onPointerDown={event => {
          if (event.pointerType === "mouse" || pending || items.length < 2) return;
          swipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={finishSwipe}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <h2 id={titleId}>{copy.title}</h2>
        <p>{copy.detail}</p>
        <p className="return-contract__change">{copy.nextChange}</p>
      </div>
      {error && <p className="return-contract__error" role="status">{error}</p>}
      <Link
        prefetch={false}
        className="btn"
        href={href}
        onClick={() => { reviewActiveContract(); }}
      >
        {copy.actionLabel} →
      </Link>
    </section>
  );
}
