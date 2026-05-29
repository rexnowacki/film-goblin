import { describe, it, expect } from "vitest";
import { Digest } from "../src/digest.js";

describe("Digest", () => {
  it("starts with zeroed counters", () => {
    const d = new Digest();
    expect(d.snapshot()).toMatchObject({
      films_refreshed: 0,
      price_changes: 0,
      price_drops: 0,
      alerts_fired: 0,
      parse_failures: 0,
      unavailable_marked: 0,
      stopped_reason: "complete",
    });
  });

  it("increments counters", () => {
    const d = new Digest();
    d.filmRefreshed();
    d.filmRefreshed();
    d.priceChanged();
    d.priceDropped();
    d.priceDropped();
    d.alertFired();
    d.parseFailure(123);
    d.markedUnavailable();
    d.stopped("time_budget");
    const s = d.snapshot();
    expect(s.films_refreshed).toBe(2);
    expect(s.price_changes).toBe(1);
    expect(s.price_drops).toBe(2);
    expect(s.alerts_fired).toBe(1);
    expect(s.parse_failures).toBe(1);
    expect(s.unavailable_marked).toBe(1);
    expect(s.parse_failure_ids).toEqual([123]);
    expect(s.stopped_reason).toBe("time_budget");
  });

  it("render() returns human-readable summary", () => {
    const d = new Digest();
    d.filmRefreshed();
    d.alertFired();
    d.priceDropped();
    const out = d.render();
    expect(out).toContain("films_refreshed=1");
    expect(out).toContain("price_drops=1");
    expect(out).toContain("alerts_fired=1");
    expect(out).toContain("stopped_reason=complete");
  });
});
