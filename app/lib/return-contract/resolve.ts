import type { ReturnContract, ReturnContractCandidate, ReturnContractKind } from "./types";

const PRIORITY: Record<ReturnContractKind, number> = {
  gazing_upcoming: 0,
  gazing_aftermath: 1,
  coven_request: 2,
  recommendation: 3,
  gazing_invite: 4,
  price_action: 5,
  daily_omen: 6,
  taste_twin: 7,
};

const DEFAULT_SNOOZE_MS = 24 * 60 * 60 * 1000;
const EVENT_SNOOZE_MS = 2 * 60 * 60 * 1000;

export function resolveReturnContract(
  candidates: ReturnContractCandidate[],
  now: Date,
): ReturnContract | null {
  const nowMs = now.getTime();
  const eligible = candidates.filter((candidate) => {
    if (!candidate.key || !candidate.href || !candidate.title || !candidate.actionLabel) return false;
    const deferred = candidate.deferredUntil ? Date.parse(candidate.deferredUntil) : 0;
    if (Number.isFinite(deferred) && deferred > nowMs) return false;
    const deadline = candidate.deadline ? Date.parse(candidate.deadline) : Number.POSITIVE_INFINITY;
    return !Number.isNaN(deadline) && deadline > nowMs;
  });
  if (eligible.length === 0) return null;

  eligible.sort((a, b) =>
    PRIORITY[a.kind] - PRIORITY[b.kind]
    || (Date.parse(a.deadline ?? "9999-12-31") - Date.parse(b.deadline ?? "9999-12-31"))
    || (Date.parse(b.changedAt) - Date.parse(a.changedAt))
    || a.key.localeCompare(b.key));

  const winner = eligible[0];
  const normalCeiling = nowMs + DEFAULT_SNOOZE_MS;
  const eventCeiling = winner.deadline
    ? Math.max(nowMs, Date.parse(winner.deadline) - EVENT_SNOOZE_MS)
    : normalCeiling;
  return {
    ...winner,
    deferUntil: new Date(Math.min(normalCeiling, eventCeiling)).toISOString(),
  };
}
