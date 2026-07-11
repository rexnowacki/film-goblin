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
export const RETURN_CONTRACT_QUEUE_LIMIT = 5;

export function resolveReturnContracts(
  candidates: ReturnContractCandidate[],
  now: Date,
  limit = RETURN_CONTRACT_QUEUE_LIMIT,
): ReturnContract[] {
  const nowMs = now.getTime();
  const eligible = candidates.filter((candidate) => {
    if (!candidate.key || !candidate.href || !candidate.title || !candidate.actionLabel) return false;
    const deferred = candidate.deferredUntil ? Date.parse(candidate.deferredUntil) : 0;
    if (Number.isFinite(deferred) && deferred > nowMs) return false;
    const deadline = candidate.deadline ? Date.parse(candidate.deadline) : Number.POSITIVE_INFINITY;
    return !Number.isNaN(deadline) && deadline > nowMs;
  });
  eligible.sort((a, b) =>
    PRIORITY[a.kind] - PRIORITY[b.kind]
    || (Date.parse(a.deadline ?? "9999-12-31") - Date.parse(b.deadline ?? "9999-12-31"))
    || (Date.parse(b.changedAt) - Date.parse(a.changedAt))
    || a.key.localeCompare(b.key));

  const seen = new Set<string>();
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(RETURN_CONTRACT_QUEUE_LIMIT, Math.floor(limit)))
    : RETURN_CONTRACT_QUEUE_LIMIT;

  return eligible
    .filter(candidate => {
      if (seen.has(candidate.key)) return false;
      seen.add(candidate.key);
      return true;
    })
    .slice(0, boundedLimit)
    .map(candidate => {
      const normalCeiling = nowMs + DEFAULT_SNOOZE_MS;
      const deadline = candidate.deadline ? Date.parse(candidate.deadline) : null;
      const eventCeiling = deadline == null
        ? normalCeiling
        : deadline - EVENT_SNOOZE_MS > nowMs ? deadline - EVENT_SNOOZE_MS : deadline;
      return {
        ...candidate,
        deferUntil: new Date(Math.min(normalCeiling, eventCeiling)).toISOString(),
      };
    });
}

export function resolveReturnContract(
  candidates: ReturnContractCandidate[],
  now: Date,
): ReturnContract | null {
  return resolveReturnContracts(candidates, now, 1)[0] ?? null;
}
