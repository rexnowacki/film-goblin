// Compact a non-negative count for tight UI surfaces. Anything past 99
// renders as "99+" so corner pills, heart counts, and inline captions
// don't blow out their layout when a film or post pops off.
export function compactCount(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n <= 99) return String(n);
  return "99+";
}
