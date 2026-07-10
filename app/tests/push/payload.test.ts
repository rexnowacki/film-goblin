import { describe, it, expect } from "vitest";
import { PUSH_KINDS, buildPushPayload } from "@/lib/push/payload";

const actor = { username: "moss.witch", display_name: "Moss Witch" };

describe("PUSH_KINDS", () => {
  it("contains social, price, and gazing-loop kinds", () => {
    expect([...PUSH_KINDS].sort()).toEqual([
      "comment_on_activity",
      "coven_invite_accepted",
      "coven_invite_pending",
      "gazing_aftermath",
      "gazing_reminder_24h",
      "gazing_reminder_2h",
      "gazing_rsvp",
      "price_drop",
      "recommendation_received",
      "reply_on_comment",
    ]);
  });
});

describe("buildPushPayload", () => {
  it("deep-links gazing reminders with source attribution",()=>{const p=buildPushPayload({kind:"gazing_reminder_2h",payload:{invite_id:"i",token:"tok"},actor:null,filmTitle:"Alien"});expect(p?.url).toBe("/gazing/tok?src=push&event=gazing_reminder_2h");expect(p?.tag).toBe("gazing_reminder_2h:i");});
  it("returns null for non-allowlisted kinds", () => {
    expect(buildPushPayload({ kind: "rate_reminder", payload: {}, actor: null, filmTitle: null })).toBeNull();
    expect(buildPushPayload({ kind: "like_on_comment", payload: {}, actor, filmTitle: null })).toBeNull();
  });

  it("coven invite pending", () => {
    const p = buildPushPayload({
      kind: "coven_invite_pending",
      payload: { coven_request_id: "cr-1" },
      actor,
      filmTitle: null,
    });
    expect(p).toEqual({
      title: "A summons to your coven",
      body: "Moss Witch wants to join your coven.",
      url: "/coven#requests",
      tag: "coven_invite_pending:cr-1",
    });
  });

  it("coven invite accepted deep-links to the relationship-gated shared summary", () => {
    const p = buildPushPayload({
      kind: "coven_invite_accepted",
      payload: { coven_request_id: "cr-2" },
      actor,
      filmTitle: null,
    });
    expect(p!.url).toBe("/coven/shared/moss.witch");
    expect(p!.body).toBe("Moss Witch accepted your summons.");
    expect(p!.tag).toBe("coven_invite_accepted:cr-2");
  });

  it("recommendation received", () => {
    const p = buildPushPayload({
      kind: "recommendation_received",
      payload: { recommendation_id: "r-1", film_id: "f-1" },
      actor,
      filmTitle: "Terrifier 2",
    });
    expect(p).toEqual({
      title: "A film is pressed into your hands",
      body: "Moss Witch recommends Terrifier 2.",
      url: "/film/f-1",
      tag: "recommendation_received:r-1",
    });
  });

  it("comment on activity truncates the body to 90 chars", () => {
    const long = "x".repeat(200);
    const p = buildPushPayload({
      kind: "comment_on_activity",
      payload: { activity_id: "a-1", comment_id: "c-1", body: long },
      actor,
      filmTitle: null,
    });
    expect(p!.title).toBe("Moss Witch commented");
    expect(p!.body.length).toBeLessThanOrEqual(91); // 90 + ellipsis char
    expect(p!.url).toBe("/home?activity=a-1");
    expect(p!.tag).toBe("comment_on_activity:c-1");
  });

  it("reply on comment", () => {
    const p = buildPushPayload({
      kind: "reply_on_comment",
      payload: { activity_id: "a-2", comment_id: "c-2", body: "agreed" },
      actor,
      filmTitle: null,
    });
    expect(p!.title).toBe("Moss Witch replied");
    expect(p!.body).toBe("agreed");
  });

  it("gazing rsvp deep-links to the gazing token page", () => {
    const p = buildPushPayload({
      kind: "gazing_rsvp",
      payload: { invite_id: "i-1", film_id: "f-2", token: "tok123" },
      actor,
      filmTitle: "Suspiria",
    });
    expect(p).toEqual({
      title: "Another gazer joins",
      body: "Moss Witch will be there for Suspiria.",
      url: "/gazing/tok123",
      tag: "gazing_rsvp:i-1",
    });
  });

  it("price drop says Apple TV and formats dollars", () => {
    const p = buildPushPayload({
      kind: "price_drop",
      payload: { price_alert_id: "pa-1", film_id: "f-3", old_price_usd: 14.99, new_price_usd: 4.99 },
      actor: null,
      filmTitle: "The Witch",
    });
    expect(p).toEqual({
      title: "The Witch — the price fell",
      body: "Now $4.99 on Apple TV (was $14.99).",
      url: "/film/f-3",
      tag: "price_drop:pa-1",
    });
  });

  it("falls back to username when display_name is null", () => {
    const p = buildPushPayload({
      kind: "coven_invite_pending",
      payload: { coven_request_id: "cr-3" },
      actor: { username: "ghoul", display_name: null },
      filmTitle: null,
    });
    expect(p!.body).toBe("ghoul wants to join your coven.");
  });
});
