import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminAccess = vi.fn();
const acquireCronLock = vi.fn();
const recordCronRun = vi.fn();
const runJobByKey = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient: () => ({}) }));
vi.mock("@/lib/auth/require-admin", () => ({ checkAdminAccess }));
vi.mock("@/lib/theaters/lock", () => ({ acquireCronLock }));
vi.mock("@/lib/cron/record-run", () => ({ recordCronRun }));
vi.mock("@/lib/cron/jobs", () => ({ runJobByKey }));

const { POST } = await import("../../app/api/admin/jobs/[job]/run/route");

function call(job: string) {
  return POST(new Request("http://localhost/api/admin/jobs/x/run", { method: "POST" }), {
    params: Promise.resolve({ job }),
  });
}

describe("POST /api/admin/jobs/[job]/run", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://example";
    checkAdminAccess.mockReset().mockResolvedValue("ok");
    acquireCronLock.mockReset().mockResolvedValue(true);
    recordCronRun.mockReset().mockResolvedValue({ ok: true, status: "success", stats: { films_refreshed: 5 } });
    runJobByKey.mockReset().mockResolvedValue({ films_refreshed: 5 });
  });

  it("rejects non-admins with 401", async () => {
    checkAdminAccess.mockResolvedValue("not-admin");
    const response = await call("refresh-prices");
    expect(response.status).toBe(401);
  });

  it("rejects unknown jobs with 400", async () => {
    const response = await call("not-a-job");
    expect(response.status).toBe(400);
    expect(recordCronRun).not.toHaveBeenCalled();
  });

  it("rejects database-backed jobs before recording when DATABASE_URL is missing", async () => {
    const old = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const response = await call("refresh-prices");
    if (old === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old;

    expect(response.status).toBe(500);
    expect(recordCronRun).not.toHaveBeenCalled();
  });

  it("runs a valid job and returns its result", async () => {
    const response = await call("refresh-prices");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "success",
      stats: { films_refreshed: 5 },
    });
    expect(recordCronRun).toHaveBeenCalledWith(expect.anything(), "refresh-prices", "manual", expect.any(Function));
  });

  it("returns skipped when the lock is held", async () => {
    acquireCronLock.mockResolvedValue(false);
    const response = await call("refresh-prices");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "skipped" });
    expect(recordCronRun).not.toHaveBeenCalled();
  });
});
