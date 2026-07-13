import { beforeEach, describe, expect, it, vi } from "vitest";

const checkAdminAccess = vi.fn();
const createClient = vi.fn(async () => ({}));
const upload = vi.fn();
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/badge-images/${path}` },
}));
const from = vi.fn(() => ({ upload, getPublicUrl }));
const serviceRoleClient = vi.fn(() => ({ storage: { from } }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-admin", () => ({ checkAdminAccess }));
vi.mock("@/lib/supabase/service-role", () => ({ serviceRoleClient }));

const { POST } = await import("../../app/api/admin/badges/image/route");

function uploadRequest(source: string, name = "relic.svg", type = "image/svg+xml") {
  const form = new FormData();
  form.set("file", new File([source], name, { type }));
  return new Request("http://localhost/api/admin/badges/image", { method: "POST", body: form });
}

describe("/api/admin/badges/image", () => {
  beforeEach(() => {
    checkAdminAccess.mockReset().mockResolvedValue("ok");
    createClient.mockClear();
    serviceRoleClient.mockClear();
    from.mockClear();
    upload.mockReset().mockResolvedValue({ data: { path: "unused" }, error: null });
    getPublicUrl.mockClear();
  });

  it.each([
    ["not-authed", 401],
    ["not-admin", 403],
  ] as const)("rejects %s before constructing a service-role client", async (access, status) => {
    checkAdminAccess.mockResolvedValue(access);
    const response = await POST(uploadRequest('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    expect(response.status).toBe(status);
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });

  it("uploads validated artwork under an immutable UUID path", async () => {
    const response = await POST(uploadRequest('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true });
    expect(body.path).toMatch(/^[0-9a-f-]{36}\.svg$/);
    expect(body.url).toContain(`/badge-images/${body.path}`);
    expect(from).toHaveBeenCalledWith("badge-images");
    expect(upload).toHaveBeenCalledWith(
      body.path,
      expect.any(Uint8Array),
      { cacheControl: "31536000", contentType: "image/svg+xml", upsert: false },
    );
  });

  it("rejects active SVG content before storage access", async () => {
    const response = await POST(uploadRequest('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(response.status).toBe(400);
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });

});
