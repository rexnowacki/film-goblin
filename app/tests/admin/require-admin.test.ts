import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { requireAdmin, NotAdminError } from "../../lib/auth/require-admin";
import { createTestUser, deleteTestUser, adminClient, type TestUser } from "../helpers/users";
import { createClient as createSbClient } from "@supabase/supabase-js";

const hasEnv = !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY && !!process.env.TEST_SUPABASE_URL;

let nonStaff: TestUser;
let reviewer: TestUser;
let admin: TestUser;

beforeAll(async () => {
  if (!hasEnv) return;
  nonStaff = await createTestUser();
  reviewer = await createTestUser();
  admin = await createTestUser();
  const ac = adminClient();
  await ac.from("staff").insert({ user_id: reviewer.id, role: "reviewer" });
  await ac.from("staff").insert({ user_id: admin.id, role: "admin" });
});

afterAll(async () => {
  if (!hasEnv) return;
  const ac = adminClient();
  await ac.from("staff").delete().in("user_id", [reviewer.id, admin.id]);
  await deleteTestUser(nonStaff.id);
  await deleteTestUser(reviewer.id);
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

describe.skipIf(!hasEnv)("requireAdmin", () => {
  it("throws NotAdminError when signed out", async () => {
    const sb = anonSb();
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("throws NotAdminError for non-staff user", async () => {
    const sb = await asUser(nonStaff);
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("throws NotAdminError for staff with role=reviewer", async () => {
    const sb = await asUser(reviewer);
    await expect(requireAdmin(sb)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("resolves silently for staff with role=admin", async () => {
    const sb = await asUser(admin);
    await expect(requireAdmin(sb)).resolves.toBeUndefined();
  });
});
