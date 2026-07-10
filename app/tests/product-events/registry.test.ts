import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENT_NAMES,
  isMeaningfulReturn,
  scrubProductEventProperties,
  validateProductEvent,
} from "@/lib/product-events/registry";

const now = Date.parse("2026-07-10T12:00:00.000Z");
const base = {
  event_id: "22222222-2222-4222-8222-222222222222",
  event_name: "session_started",
  session_id: "11111111-1111-4111-8111-111111111111",
  occurred_at: new Date(now).toISOString(),
};

describe("product event registry", () => {
  it("contains the approved 13-event vocabulary", () => {
    expect(PRODUCT_EVENT_NAMES).toHaveLength(13);
  });

  it("normalizes a valid event", () => {
    expect(validateProductEvent({ ...base, path: "/home", properties: { entry_source: "direct" } }, now)).toMatchObject({
      event_name: "session_started",
      path: "/home",
      properties: { entry_source: "direct" },
    });
  });

  it.each([
    [{ ...base, event_name: "made_up" }, "unknown event name"],
    [{ ...base, event_id: "nope" }, "invalid event_id"],
    [{ ...base, session_id: "nope" }, "invalid session_id"],
    [{ ...base, occurred_at: new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString() }, "occurred_at"],
    [{ ...base, occurred_at: new Date(now + 5 * 60 * 1000 + 1).toISOString() }, "occurred_at"],
    [{ ...base, subject_id: "nope" }, "invalid subject_id"],
    [{ ...base, path: "/films?q=private" }, "invalid path"],
    [{ ...base, subject_type: "profile", subject_id: "33333333-3333-4333-8333-333333333333" }, "invalid subject_type"],
  ])("rejects invalid input", (input, message) => {
    expect(() => validateProductEvent(input, now)).toThrow(message);
  });

  it("requires the approved subject for taste and gazing events", () => {
    expect(() => validateProductEvent({ ...base, event_name: "taste_twin_viewed" }, now)).toThrow("subject required");
    expect(validateProductEvent({
      ...base,
      event_name: "taste_twin_viewed",
      subject_type: "profile",
      subject_id: "33333333-3333-4333-8333-333333333333",
    }, now).subject_type).toBe("profile");
  });

  it("rejects prohibited free-text properties", () => {
    expect(() => scrubProductEventProperties("session_started", { note: "private" })).toThrow("property not allowed");
  });

  it("rejects non-scalar and overlong property values", () => {
    expect(() => scrubProductEventProperties("session_started", { entry_source: { nested: true } })).toThrow();
    expect(() => scrubProductEventProperties("session_started", { entry_source: "x".repeat(129) })).toThrow();
  });

  it("classifies only loop-closing events as meaningful", () => {
    expect(isMeaningfulReturn([{ event_name: "session_started", occurred_at: base.occurred_at }])).toBe(false);
    expect(isMeaningfulReturn([{ event_name: "gazing_created", occurred_at: base.occurred_at }])).toBe(true);
  });
});
