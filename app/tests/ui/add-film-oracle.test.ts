import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Add Film oracle artwork", () => {
  const component = readFileSync("components/AddFilmModal.tsx", "utf8");
  const css = readFileSync("app/styles/240-add-film.css", "utf8");

  it("uses the transparent PNG artwork instead of the opaque JPEG", () => {
    expect(component).toContain('src="/add-film-oracle.png"');
    expect(component).not.toContain("add-film-oracle.jpg");
    expect(existsSync("public/add-film-oracle.png")).toBe(true);
    expect(existsSync("public/add-film-oracle.jpg")).toBe(false);
  });

  it("does not use the old screen blend workaround", () => {
    const oracleRule = css.slice(
      css.indexOf(".add-film-modal__oracle {"),
      css.indexOf(".add-film-modal__close {"),
    );
    expect(oracleRule).not.toContain("mix-blend-mode");
  });
});
