import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/film-requests/page.tsx", "utf8");
const actions = readFileSync("app/admin/film-requests/FilmRequestActions.tsx", "utf8");
const dashboard = readFileSync("app/admin/page.tsx", "utf8");
const addFilm = readFileSync("app/admin/films/new/AddFilmClient.tsx", "utf8");

describe("release scout admin surfaces", () => {
  it("queue renders a Scouted section and hides dismissed rows", () => {
    expect(page).toContain('.eq("source", "scout")');
    expect(page).toContain('.neq("source", "scout")');
    expect(page).toContain('.neq("status", "dismissed")');
    expect(page).toContain("Scouted");
  });

  it("every pending row offers Dismiss", () => {
    expect(actions).toContain("dismissFilmRequest(request.id)");
    expect(actions).toContain(">\n        Dismiss");
  });

  it("dashboard gates itself and shows the waiting scout count", () => {
    expect(dashboard).toContain("checkAdminAccess");
    expect(dashboard).toContain('.eq("source", "scout")');
    expect(dashboard).toContain("scouted");
  });

  it("Review & Add prefills the release date from the shared approval rule", () => {
    expect(addFilm).toContain("requestCreateOverrides(req).theatrical_release_date");
  });
});
