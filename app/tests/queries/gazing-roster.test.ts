import { describe, expect, it } from "vitest";
import { buildRosterMap, type AttendeeLite } from "@/lib/queries/gazing-roster";

const profiles = new Map<string, AttendeeLite>([
  ["u-b", { id: "u-b", username: "bex", display_name: null, avatar_url: null }],
  ["u-c", { id: "u-c", username: "cyn", display_name: null, avatar_url: null }],
]);

describe("buildRosterMap", () => {
  const invites = [{ id: "inv-1", token: "tok-1", created_by: "u-host" }];

  it("counts attendees and resolves their avatars", () => {
    const m = buildRosterMap(invites, [
      { invite_id: "inv-1", user_id: "u-b" },
      { invite_id: "inv-1", user_id: "u-c" },
    ], profiles, "u-x", 5);
    const r = m.get("tok-1")!;
    expect(r.count).toBe(2);
    expect(r.avatars.map(a => a.username)).toEqual(["bex", "cyn"]);
    expect(r.viewerIsIn).toBe(false);
    expect(r.viewerIsHost).toBe(false);
  });

  it("flags the viewer as in when they are an attendee", () => {
    const m = buildRosterMap(invites, [{ invite_id: "inv-1", user_id: "u-b" }], profiles, "u-b", 5);
    expect(m.get("tok-1")!.viewerIsIn).toBe(true);
  });

  it("flags the viewer as host when they own the invite", () => {
    const m = buildRosterMap(invites, [], profiles, "u-host", 5);
    const r = m.get("tok-1")!;
    expect(r.viewerIsHost).toBe(true);
    expect(r.count).toBe(0);
  });

  it("caps avatars at maxAvatars but keeps the full count", () => {
    const many = [
      { invite_id: "inv-1", user_id: "u-b" },
      { invite_id: "inv-1", user_id: "u-c" },
    ];
    const m = buildRosterMap(invites, many, profiles, null, 1);
    const r = m.get("tok-1")!;
    expect(r.count).toBe(2);
    expect(r.avatars).toHaveLength(1);
  });
});
