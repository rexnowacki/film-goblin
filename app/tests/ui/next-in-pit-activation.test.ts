import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("NEXT IN THE PIT activation contract", () => {
  it("admits only invitations, profile completion, and compatibility suggestions", () => {
    const types = read("lib/return-contract/types.ts");
    const query = read("lib/queries/return-contract.ts");

    expect(types).toContain('"coven_request"');
    expect(types).toContain('"profile_photo"');
    expect(types).toContain('"taste_twin"');
    for (const retired of ["price_action", "daily_omen", "recommendation", "gazing_upcoming", "gazing_aftermath", "gazing_invite"]) {
      expect(types).not.toContain(`"${retired}"`);
      expect(query).not.toContain(`kind: "${retired}"`);
    }
  });

  it("keeps the activation actions inside the box", () => {
    const component = read("components/return-contract/NextInThePit.tsx");
    const query = read("lib/queries/return-contract.ts");

    expect(component).toContain("acceptCovenRequest");
    expect(component).toContain("declineCovenRequest");
    expect(component).toContain("requestTasteTwin");
    expect(component).toContain(">Accept</button>");
    expect(component).toContain(">Decline</button>");
    expect(query).toContain('href: "/settings#your-face"');
    expect(query).toContain("getTasteTwinSuggestions(client, userId, 3)");
  });
});
