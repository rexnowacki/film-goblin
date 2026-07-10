import type { GazingStatus } from "./types";
export function canTransitionGazing(input: { current: GazingStatus; next: GazingStatus; startsAt: string; now: Date; isHost: boolean }): boolean {
  if (!input.isHost || input.current !== "scheduled" || input.next === "scheduled") return false;
  if (input.next === "cancelled") return true;
  return input.next === "happened" && input.now.getTime() >= Date.parse(input.startsAt);
}
export function canConfirmAttendance(input: { status: GazingStatus; startsAt: string; now: Date; isHost: boolean; hasRsvp: boolean }): boolean {
  return input.status !== "cancelled" && input.now.getTime() >= Date.parse(input.startsAt) && (input.isHost || input.hasRsvp);
}
