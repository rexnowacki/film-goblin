import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
  type NotificationFeedItem,
} from "@/lib/queries/notifications";

const NOW = new Date("2026-07-11T12:00:00.000Z");

const rows = [
  { id: "reminder-live", kind: "gazing_reminder_2h", created_at: "2026-07-11T11:55:00.000Z", read_at: null, actor_user_id: null, payload: { invite_id: "invite-live" } },
  { id: "reminder-cancelled", kind: "gazing_reminder_2h", created_at: "2026-07-11T11:50:00.000Z", read_at: null, actor_user_id: null, payload: { invite_id: "invite-cancelled" } },
  { id: "reminder-missing", kind: "gazing_reminder_2h", created_at: "2026-07-11T11:45:00.000Z", read_at: null, actor_user_id: null, payload: { invite_id: "invite-missing" } },
  { id: "aftermath-cancelled", kind: "gazing_aftermath", created_at: "2026-07-11T11:40:00.000Z", read_at: null, actor_user_id: null, payload: { invite_id: "invite-cancelled" } },
  { id: "price-history", kind: "price_drop", created_at: "2026-07-11T11:35:00.000Z", read_at: null, actor_user_id: null, payload: {} },
  { id: "rsvp-history", kind: "gazing_rsvp", created_at: "2026-07-11T11:30:00.000Z", read_at: null, actor_user_id: null, payload: { invite_id: "invite-cancelled" } },
];

function resultQuery(data: unknown[], count = data.length) {
  const query: any = {};
  for (const method of ["select", "eq", "is", "gte", "order", "limit"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data, count, error: null }).then(resolve, reject);
  return query;
}

function fakeClient() {
  const inviteIds: string[][] = [];
  const inviteQuery: any = {
    select: () => inviteQuery,
    in: (_column: string, ids: string[]) => { inviteIds.push(ids); return inviteQuery; },
    neq: () => inviteQuery,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "invite-live" }], error: null }).then(resolve, reject),
  };
  return {
    inviteIds,
    client: {
      from: (table: string) => {
        if (table === "notifications") return resultQuery(rows);
        if (table === "gazing_invites") return inviteQuery;
        throw new Error(`unexpected table ${table}`);
      },
    } as never,
  };
}

function ids(items: NotificationFeedItem[]): string[] {
  return items.flatMap(item => item.type === "single"
    ? [item.notification.id]
    : item.group.items.map(notification => notification.id));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe("cancelled gazing notifications", () => {
  it("removes reminder and aftermath rows before grouping while retaining notification history", async () => {
    const { client, inviteIds } = fakeClient();

    const notifications = await getRecentNotifications(client, "viewer");

    expect(ids(notifications)).toEqual(["reminder-live", "price-history", "rsvp-history"]);
    expect(notifications.every(item => item.type === "single")).toBe(true);
    expect(inviteIds).toEqual([["invite-live", "invite-cancelled", "invite-missing"]]);
  });

  it("does not count cancelled or RLS-invisible reminders as unread", async () => {
    const { client } = fakeClient();

    await expect(getUnreadNotificationCount(client, "viewer")).resolves.toBe(3);
  });
});
