import { describe, it, expect, vi } from "vitest";
import { getOwnedFilmIds, isInLibrary } from "@/lib/queries/library";

function makeIdsClient(rows: { film_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  } as any;
}

function makeMaybeSingleClient(row: { film_id: string } | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      }),
    }),
  } as any;
}

describe("getOwnedFilmIds", () => {
  it("returns the list of film IDs for the given user", async () => {
    const client = makeIdsClient([
      { film_id: "f1" },
      { film_id: "f2" },
      { film_id: "f3" },
    ]);
    const ids = await getOwnedFilmIds(client, "u1");
    expect(ids).toEqual(["f1", "f2", "f3"]);
  });

  it("returns [] without hitting the DB when userId is null", async () => {
    const fromSpy = vi.fn();
    const client = { from: fromSpy } as any;
    const ids = await getOwnedFilmIds(client, null);
    expect(ids).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("returns [] when the user owns nothing", async () => {
    const client = makeIdsClient([]);
    const ids = await getOwnedFilmIds(client, "u1");
    expect(ids).toEqual([]);
  });
});

describe("isInLibrary", () => {
  it("returns true when the row exists", async () => {
    const client = makeMaybeSingleClient({ film_id: "f1" });
    expect(await isInLibrary(client, "u1", "f1")).toBe(true);
  });

  it("returns false when the row does not exist", async () => {
    const client = makeMaybeSingleClient(null);
    expect(await isInLibrary(client, "u1", "f1")).toBe(false);
  });
});
