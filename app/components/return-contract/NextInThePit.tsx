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
  reconcileReturnContractIndex,
  removeReturnContract,
  type ReturnContractBrowseDirection,
  type ReturnContractPoint,
} from "@/lib/return-contract/queue";
import type { ReturnContract } from "@/lib/return-contract/types";
import ReturnContractTracker from "./ReturnContractTracker";

export default function NextInThePit({ contracts }: { contracts: ReturnContract[] }) {
  const [items, setItems] = useState(contracts);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const swipeStart = useRef<ReturnContractPoint | null>(null);
  const itemsRef = useRef(items);
  const titleId = useId();
  itemsRef.current = items;

  useEffect(() => {
    setIndex(current => reconcileReturnContractIndex(itemsRef.current, current, contracts));
    setItems(contracts);
  }, [contracts]);

  if (items.length === 0) return null;
  const activeIndex = Math.min(index, items.length - 1);
  const contract = items[activeIndex];
  const copy = getReturnContractCopy(contract, new Date());
  const href = buildReturnContractHref(contract);
  const canDefer = canDeferReturnContract(contract, new Date());

  const browse = (direction: ReturnContractBrowseDirection) => {
    if (pending || items.length < 2) return;
    setError(null);
    setIndex(current => moveReturnContractIndex(current, items.length, direction));
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
    setItems(next.contracts);
    setIndex(next.index);
    setError(null);
    startTransition(async () => {
      try {
        await deferReturnContract(contract.key, contract.deferUntil);
      } catch {
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
      <Link prefetch={false} className="btn" href={href}>{copy.actionLabel} →</Link>
    </section>
  );
}
