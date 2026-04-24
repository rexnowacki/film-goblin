import { describe, it, expect } from "vitest";
import { decideRedirect } from "../middleware";

describe("middleware decideRedirect", () => {
  it("unauth visit to /home redirects to /auth/signin with preserved path", () => {
    const r = decideRedirect(null, "/home");
    expect(r).toEqual({ target: "/auth/signin", preserveRedirect: true });
  });

  it("unauth visit to /settings redirects to /auth/signin", () => {
    const r = decideRedirect(null, "/settings");
    expect(r?.target).toBe("/auth/signin");
  });

  it("authed visit to / redirects to /home", () => {
    const r = decideRedirect({ id: "u1" }, "/");
    expect(r).toEqual({ target: "/home", preserveRedirect: false });
  });

  it("authed visit to /auth/signin redirects to /home", () => {
    const r = decideRedirect({ id: "u1" }, "/auth/signin");
    expect(r?.target).toBe("/home");
  });

  it("unauth visit to /films is allowed (public route)", () => {
    expect(decideRedirect(null, "/films")).toBeNull();
  });

  it("authed visit to /home is allowed", () => {
    expect(decideRedirect({ id: "u1" }, "/home")).toBeNull();
  });

  it("unauth visit to /coven redirects to /auth/signin with preserved path", () => {
    const r = decideRedirect(null, "/coven");
    expect(r).toEqual({ target: "/auth/signin", preserveRedirect: true });
  });

  it("unauth visit to /people is allowed (public route)", () => {
    expect(decideRedirect(null, "/people")).toBeNull();
  });

  it("unauth visit to /p/moss.witch is allowed (public profile)", () => {
    expect(decideRedirect(null, "/p/moss.witch")).toBeNull();
  });

  it("unauth visit to /watchlist redirects to /auth/signin with preserved path", () => {
    const r = decideRedirect(null, "/watchlist");
    expect(r).toEqual({ target: "/auth/signin", preserveRedirect: true });
  });

  it("authed visit to /watchlist is allowed", () => {
    expect(decideRedirect({ id: "u1" }, "/watchlist")).toBeNull();
  });
});
