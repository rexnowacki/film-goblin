export type ReturnContractKind =
  | "coven_request"
  | "profile_photo"
  | "taste_twin";

export interface ReturnContractCandidate {
  kind: ReturnContractKind;
  key: string;
  href: string;
  title: string;
  detail: string;
  actionLabel: string;
  changedAt: string;
  subjectId?: string | null;
  subjectUsername?: string | null;
  deadline?: string | null;
  deferredUntil?: string | null;
}

export interface ReturnContract extends ReturnContractCandidate {
  deferUntil: string;
}
