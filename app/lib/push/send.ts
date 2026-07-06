import webpush, { WebPushError } from "web-push";
import type { PushPayload } from "./payload";

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendOutcome {
  sent: number;
  failed: number;
  /** subscription ids whose endpoints are gone (404/410) — delete these rows */
  dead: string[];
}

let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID env vars missing (VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendToSubscriptions(
  subs: SubscriptionRow[],
  payload: PushPayload,
): Promise<SendOutcome> {
  configureVapid();
  const outcome: SendOutcome = { sent: 0, failed: 0, dead: [] };
  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      outcome.sent += 1;
    } catch (err) {
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        outcome.dead.push(s.id);
      } else {
        outcome.failed += 1;
        console.warn("push send failed:", err instanceof Error ? err.message : err);
      }
    }
  }));

  return outcome;
}
