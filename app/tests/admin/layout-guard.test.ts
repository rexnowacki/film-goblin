import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { checkAdminAccess } from "../../lib/auth/require-admin";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";

let nonStaff: TestUser;
let admin: TestUser;

beforeAll(async () => {
  nonStaff = await createTestUser();
  admin = await createTestUser();
  await adminClient().from("staff").insert({ user_id: admin.id, role: "admin" });
});

afterAll(async () => {
  await adminClient().from("staff").delete().eq("user_id", admin.id);
  await deleteTestUser(nonStaff.id);
  await deleteTestUser(admin.id);
});

function anonSb() {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function asUser(user: TestUser) {
  const sb = anonSb();
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw error ?? new Error("no session");
  return sb;
}

describe("checkAdminAccess (layout-guard decision logic)", () => {
  it("returns 'not-authed' when signed-out", async () => {
    expect(await checkAdminAccess(anonSb())).toBe("not-authed");
  });

  it("returns 'not-admin' when signed-in but not staff", async () => {
    const sb = await asUser(nonStaff);
    expect(await checkAdminAccess(sb)).toBe("not-admin");
  });

  it("returns 'ok' when signed-in admin", async () => {
    const sb = await asUser(admin);
    expect(await checkAdminAccess(sb)).toBe("ok");
  });
});
