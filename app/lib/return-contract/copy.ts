import type { ReturnContract } from "./types";

export interface ReturnContractCopy {
  eyebrow: string;
  title: string;
  detail: string;
  actionLabel: string;
  nextChange: string;
}

export function getReturnContractCopy(contract: ReturnContract, now: Date): ReturnContractCopy {
  const deadline = contract.deadline ? new Date(contract.deadline) : null;
  const nextChange = deadline && deadline.getTime() > now.getTime()
    ? `This changes ${deadline.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
    : "This stays here until you handle it or set it aside.";
  return { eyebrow: "Next in the Pit", title: contract.title, detail: contract.detail, actionLabel: contract.actionLabel, nextChange };
}
