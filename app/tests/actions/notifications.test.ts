import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { _markAllRead } from "@/lib/actions/notifications";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

describe.skipIf(!hasEnv)("markAllRead", () => {
  let svc: ReturnType<typeof createClient<Database>>;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    if (!hasEnv) return;
    svc = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
    const a = await svc.auth.admin.createUser({ email: `mra-${Date.now()}@test.example`, email_confirm: true });
    const b = await svc.auth.admin.createUser({ email: `mrb-${Date.now()}@test.example`, email_confirm: true });
    userA = a.data.user!.id;
    userB = b.data.user!.id;
  });

  afterAll(async () => {
    if (!hasEnv) return;
    await svc.auth.admin.deleteUser(userA).catch(() => {});
    await svc.auth.admin.deleteUser(userB).catch(() => {});
  });

  beforeEach(async () => {
    if (!hasEnv) return;
    await svc.from("notifications").delete().in("user_id", [userA, userB]);
    await svc.from("notifications").insert([
      { user_id: userA, kind: "price_drop", payload: {} },
      { user_id: userA, kind: "price_drop", payload: {} },
      { user_id: userB, kind: "price_drop", payload: {} },
    ]);
  });

  it("marks only the caller's unread rows as read", async () => {
    await _markAllRead(svc, userA);

    const aRows = await svc.from("notifications").select("read_at").eq("user_id", userA);
    expect(aRows.data!.every(r => r.read_at !== null)).toBe(true);

    const bRows = await svc.from("notifications").select("read_at").eq("user_id", userB);
    expect(bRows.data!.every(r => r.read_at === null)).toBe(true);
  });

  it("is idempotent", async () => {
    await _markAllRead(svc, userA);
    await _markAllRead(svc, userA);
    const aRows = await svc.from("notifications").select("read_at").eq("user_id", userA);
    expect(aRows.data!.every(r => r.read_at !== null)).toBe(true);
  });
});
