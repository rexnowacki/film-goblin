import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sign-in presentation", () => {
  const page = readFileSync("app/auth/signin/page.tsx", "utf8");
  const css = readFileSync("app/styles/290-auth.css", "utf8");

  it("keeps authentication behavior while adding the palantir welcome panel", () => {
    expect(page).toContain('src="/add-film-oracle.png"');
    expect(page).toContain("const redirectTo = params.get(\"redirect\") || \"/home\"");
    expect(page).toContain("await signIn(formData)");
    expect(page).toContain("<GoogleSignInButton />");
    expect(page).toContain('name="identifier"');
    expect(page).toContain('name="password"');
  });

  it("uses a split plum entrance that collapses at the zine breakpoint", () => {
    expect(css).toContain(".signin-shell");
    expect(css).toContain("grid-template-columns: minmax(0, 1.08fr) minmax(360px, .92fr)");
    expect(css).toContain("var(--pit-plum-bg)");
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(mobile).toContain("grid-template-columns: 1fr");
    expect(mobile).toContain(".signin-oracle > img");
  });

  it("reserves an upper-right image footprint so copy can wrap without overlap", () => {
    expect(page.indexOf('src="/add-film-oracle.png"')).toBeLessThan(page.indexOf('className="signin-oracle__copy"'));
    const imageRule = css.slice(
      css.indexOf(".signin-oracle > img {"),
      css.indexOf(".signin-oracle__seal"),
    );
    expect(imageRule).toContain("float: right");
    expect(imageRule).toContain("shape-outside");
    expect(imageRule).not.toContain("position: absolute");
  });
});
