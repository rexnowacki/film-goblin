"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import { nextEligibleBuy, resolvePendingBuy, type PendingBuy } from "@/lib/purchase/pending";
import { confirmPurchase } from "@/lib/actions/library";

// The return-prompt for The Claiming (spec 2026-07-07-buy-claim-loop).
// Mounted once in the signed-in layout; checks the pending-buy queue on
// mount and whenever the tab regains visibility. One prompt per mount
// lifetime — subsequent pending entries surface on later page loads.
export default function PurchasePrompt() {
  const [buy, setBuy] = useState<PendingBuy | null>(null);
  const [reward, setReward] = useState<{ peak: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  const check = useCallback(() => {
    if (shown.current) return;
    const next = nextEligibleBuy(window.localStorage, new Date());
    if (next) {
      shown.current = true;
      setBuy(next);
    }
  }, []);

  useEffect(() => {
    check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  if (!buy) return null;

  const finish = () => {
    setBuy(null);
    setReward(null);
  };

  const dismiss = () => {
    if (!reward) resolvePendingBuy(window.localStorage, buy.filmId, "dismissed");
    finish();
  };

  const decline = () => {
    resolvePendingBuy(window.localStorage, buy.filmId, "declined");
    finish();
  };

  const claim = async () => {
    setBusy(true);
    try {
      const res = await confirmPurchase(buy.filmId, buy.price);
      resolvePendingBuy(window.localStorage, buy.filmId, "confirmed");
      if (res.alreadyOwnedWithPrice) {
        finish();
        return;
      }
      setReward({ peak: res.peak });
    } catch {
      // Action failed — leave the entry pending so a later visit can retry.
      finish();
    } finally {
      setBusy(false);
    }
  };

  const savings =
    reward && reward.peak != null && buy.price != null && reward.peak > buy.price
      ? reward.peak - buy.price
      : null;

  return (
    <BottomSheet open onClose={dismiss} title={reward ? "It is done." : "A question from the pit"}>
      {reward ? (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>{buy.title}</strong> joins your grimoire
            {buy.price != null ? <> — claimed at ${buy.price.toFixed(2)}</> : null}.
          </p>
          {savings != null && (
            <p style={{ margin: "0 0 16px", color: "var(--accent)", fontWeight: 700 }}>
              ${savings.toFixed(2)} below its peak. Well haggled.
            </p>
          )}
          <button type="button" className="btn" onClick={finish}>
            Close
          </button>
        </div>
      ) : (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 16px" }}>
            Did you claim <strong style={{ fontStyle: "italic" }}>{buy.title}</strong>
            {buy.price != null ? <> at ${buy.price.toFixed(2)}</> : null}?
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={claim} disabled={busy}>
              {busy ? "Binding…" : "Claimed it"}
            </button>
            <button type="button" className="btn-outline" onClick={decline} disabled={busy}>
              Not this time
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
