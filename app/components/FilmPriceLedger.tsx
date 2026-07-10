"use client";

import { useMemo, useState } from "react";
import { extractPriceChanges, type PriceLedgerCapture } from "@/lib/price-ledger";

interface Props {
  history: PriceLedgerCapture[];
}

const INITIAL_ENTRIES = 5;

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
}

export default function FilmPriceLedger({ history }: Props) {
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(() => extractPriceChanges(history).reverse(), [history]);
  if (entries.length < 2) return null;

  const visible = expanded ? entries : entries.slice(0, INITIAL_ENTRIES);
  const hiddenCount = Math.max(0, entries.length - INITIAL_ENTRIES);

  return (
    <div className="price-ledger">
      <div className="price-ledger-heading">The ledger remembers.</div>
      <ol className="price-ledger-list">
        {visible.map((entry) => (
          <li key={`${entry.at}-${entry.price}`} className={`price-ledger-entry price-ledger-${entry.direction}`}>
            <time dateTime={entry.at}>{formatDate(entry.at)}</time>
            <span aria-hidden="true">·</span>
            {entry.direction === "drop" ? (
              <span>dropped to <strong>{formatPrice(entry.price)}</strong> (was {formatPrice(entry.previousPrice!)})</span>
            ) : entry.direction === "rise" ? (
              <span>rose to <strong>{formatPrice(entry.price)}</strong> (was {formatPrice(entry.previousPrice!)})</span>
            ) : (
              <span>first sighted at {formatPrice(entry.price)}</span>
            )}
            {entry.isSale && <span className="chip price-ledger-sale">sale</span>}
          </li>
        ))}
      </ol>
      {hiddenCount > 0 && (
        <button type="button" className="price-ledger-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show full ledger (${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
