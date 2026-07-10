export type ReturnContractKind =
  | "gazing_upcoming"
  | "gazing_aftermath"
  | "coven_request"
  | "recommendation"
  | "gazing_invite"
  | "price_action"
  | "daily_omen"
  | "taste_twin";

export interface ReturnContractCandidate {
  kind: ReturnContractKind;
  key: string;
  href: string;
  title: string;
  detail: string;
  actionLabel: string;
  changedAt: string;
  deadline?: string | null;
  deferredUntil?: string | null;
}

export interface ReturnContract extends ReturnContractCandidate {
  deferUntil: string;
}
