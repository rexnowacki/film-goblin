import type { Client } from "pg";
import type { Resend } from "resend";
import { findPendingDigests } from "./query.js";
import { renderDigestEmail } from "./render.js";
import { sendDigest } from "./resend.js";

export interface SendDailyDigestsOptions {
  from: string;
  baseUrl: string;
}

export interface DigestCounters {
  sent: number;
  failed: number;
  skipped: number;
  failed_user_ids: string[];
}

export async function sendDailyDigests(
  client: Client,
  resend: Resend,
  opts: SendDailyDigestsOptions,
): Promise<DigestCounters> {
  const counters: DigestCounters = { sent: 0, failed: 0, skipped: 0, failed_user_ids: [] };
  const digests = await findPendingDigests(client);

  for (const digest of digests) {
    if (digest.alerts.length === 0) {
      counters.skipped++;
      continue;
    }
    const rendered = renderDigestEmail(digest.user, digest.alerts, opts.baseUrl);
    try {
      await sendDigest(resend, digest.user, rendered, opts);
      await client.query("BEGIN");
      const ids = digest.alerts.map(a => a.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `UPDATE price_alerts SET notified_at = now() WHERE id IN (${placeholders})`,
        ids,
      );
      await client.query("COMMIT");
      counters.sent++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      counters.failed++;
      counters.failed_user_ids.push(digest.user.id);
      console.error(`notifier: failed to send digest to ${digest.user.id}:`, err);
    }
  }

  return counters;
}
