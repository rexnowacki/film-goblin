"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deferReturnContract } from "@/lib/actions/return-contract";
import { getReturnContractCopy } from "@/lib/return-contract/copy";
import type { ReturnContract } from "@/lib/return-contract/types";
import ReturnContractTracker from "./ReturnContractTracker";

export default function NextInThePit({ contract }: { contract: ReturnContract }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;
  const copy = getReturnContractCopy(contract, new Date());
  const separator = contract.href.includes("?") ? "&" : "?";
  const href = `${contract.href}${separator}src=return_contract&contract_kind=${contract.kind}&contract_key=${encodeURIComponent(contract.key)}`;
  return (
    <section className="return-contract" aria-labelledby="return-contract-title">
      <ReturnContractTracker contractKey={contract.key} kind={contract.kind} />
      <div className="return-contract__topline">
        <span className="eyebrow">{copy.eyebrow}</span>
        <button type="button" className="return-contract__dismiss" aria-label="Set this aside" disabled={pending} onClick={() => startTransition(async () => {
          await deferReturnContract(contract.key, contract.deferUntil);
          setHidden(true);
        })}>Set aside</button>
      </div>
      <h2 id="return-contract-title">{copy.title}</h2>
      <p>{copy.detail}</p>
      <p className="return-contract__change">{copy.nextChange}</p>
      <Link prefetch={false} className="btn" href={href}>{copy.actionLabel} →</Link>
    </section>
  );
}
