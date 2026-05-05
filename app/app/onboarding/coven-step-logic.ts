import type { StarterProfile } from "./CovenStep";

export function initialSelection(starters: StarterProfile[]): string[] {
  return starters.map(s => s.id);
}

export function toggleFollower(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
}
