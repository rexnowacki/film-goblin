import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(async () => ({ marker: "user-client" }));
const requireAdminUser = vi.fn();
const serviceRoleClient = vi.fn(() => ({ marker: "service-client" }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminUser }));
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { adminCreateBadge, adminReevaluateBadges } = await import("@/lib/actions/admin/badges");

describe("public admin badge actions", () => {
  beforeEach(() => {
    createClient.mockClear();
    requireAdminUser.mockReset().mockRejectedValue(new Error("admin role required"));
    serviceRoleClient.mockClear();
  });

  it("never constructs a service-role client when badge creation is denied", async () => {
    await expect(adminCreateBadge({
      name: "Night Fiend",
      slug: "night-fiend",
      description: "Logged the midnight shift.",
      imageUrl: "https://example.supabase.co/storage/v1/object/public/badge-images/id.svg",
      conditionKind: "watch_log_count",
      threshold: 25,
    })).rejects.toThrow("admin role required");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(requireAdminUser).toHaveBeenCalledTimes(1);
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });

  it("never constructs a service-role client when re-evaluation is denied", async () => {
    await expect(adminReevaluateBadges()).rejects.toThrow("admin role required");

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(requireAdminUser).toHaveBeenCalledTimes(1);
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });
});
