import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPitArchiveEvents } = vi.hoisted(() => ({ getPitArchiveEvents: vi.fn() }));
vi.mock("@/lib/feed-events/query", () => ({ getPitArchiveEvents }));

import { _loadMorePitArchive } from "@/lib/actions/pit-archive";

function stubClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
  } as never;
}

describe("_loadMorePitArchive", () => {
  beforeEach(() => {
    getPitArchiveEvents.mockReset();
  });

  it("requires auth, reads the cursor page, and returns the final event as the next cursor", async () => {
    getPitArchiveEvents.mockResolvedValueOnce([
      { id: "new", created_at: "2026-07-09T12:00:00Z" },
      { id: "old", created_at: "2026-07-09T11:00:00Z" },
    ]);

    await expect(_loadMorePitArchive(stubClient(), { before: "2026-07-09T13:00:00Z", limit: 2 })).resolves.toEqual({
      events: expect.any(Array),
      nextCursor: "2026-07-09T11:00:00Z",
      done: false,
    });
    expect(getPitArchiveEvents).toHaveBeenCalledWith(expect.anything(), { before: "2026-07-09T13:00:00Z", limit: 2 });
  });

  it("rejects a missing cursor before it can issue an archive query", async () => {
    await expect(_loadMorePitArchive(stubClient(), { before: "  " })).rejects.toThrow("archive cursor required");
    expect(getPitArchiveEvents).not.toHaveBeenCalled();
  });
});
