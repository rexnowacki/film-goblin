import { describe, expect, it } from "vitest";
import { notificationTarget, notificationToastText } from "@/lib/notifications/display";
import type { EnrichedNotification } from "@/lib/queries/notifications";

const actor = { id: "actor", username: "jellybones", display_name: null, avatar_url: null };

function notification(partial: Partial<EnrichedNotification>): EnrichedNotification {
  return {
    id: "n1",
    kind: "goblin_summon",
    created_at: "2026-05-14T00:00:00Z",
    read_at: null,
    actor,
    payload: { pick_id: 7, message_id: "m1", body: "@cthulhu.lemon hello" },
    film: null,
    ...partial,
  };
}

describe("notification display helpers", () => {
  it("routes ritual mention notifications to the pick thread", () => {
    expect(notificationTarget(notification({}))).toBe("/ritual/7?message=m1");
  });

  it("formats ritual mention toast text with actor and body", () => {
    expect(notificationToastText(notification({}))).toBe('jellybones mentioned you in ritual chat: "@cthulhu.lemon hello"');
  });

  it("falls back to ritual index when pick id is missing", () => {
    expect(notificationTarget(notification({ payload: { message_id: "m1" } }))).toBe("/ritual");
  });
});
