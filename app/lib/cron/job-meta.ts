export const TRIGGERABLE_JOBS = [
  "refresh-prices",
  "check-itunes-availability",
  "theater-alerts",
  "send-rate-reminders",
] as const;

export type JobKey = (typeof TRIGGERABLE_JOBS)[number];

export function isJobKey(value: string): value is JobKey {
  return (TRIGGERABLE_JOBS as readonly string[]).includes(value);
}

export const JOB_META: Record<JobKey, { label: string; notifies: boolean }> = {
  "refresh-prices": { label: "Price checker", notifies: true },
  "check-itunes-availability": { label: "iTunes availability", notifies: false },
  "theater-alerts": { label: "Theater alerts", notifies: false },
  "send-rate-reminders": { label: "Rate reminders", notifies: true },
};
