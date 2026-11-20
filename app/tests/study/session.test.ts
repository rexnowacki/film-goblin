import { describe, it, expect } from "vitest";
import {
  STUDY_MAX_AGE_SECONDS,
  checkStudyLogin,
  injectBaseHref,
  readStudyEnv,
  signStudySession,
  studyContentType,
  studyObjectPath,
  verifyStudySession,
} from "@/lib/study/session";
import { isStudyPath } from "../../middleware";

const SECRET = "x".repeat(40);
const ENV = { username: "user", password: "pass word", secret: SECRET };

describe("readStudyEnv", () => {
  it("returns null unless all three vars are set and the secret is long enough", () => {
    expect(readStudyEnv({})).toBeNull();
    expect(readStudyEnv({ STUDY_USERNAME: "u", STUDY_PASSWORD: "p", STUDY_SESSION_SECRET: "short" })).toBeNull();
    expect(readStudyEnv({ STUDY_USERNAME: "u", STUDY_PASSWORD: "p", STUDY_SESSION_SECRET: SECRET }))
      .toEqual({ username: "u", password: "p", secret: SECRET });
  });
});

describe("checkStudyLogin", () => {
  it("accepts the exact credentials (username trimmed)", () => {
    expect(checkStudyLogin("user", "pass word", ENV)).toBe(true);
    expect(checkStudyLogin("  user ", "pass word", ENV)).toBe(true);
  });
  it("rejects a wrong username, wrong password, or a password differing only in case/whitespace", () => {
    expect(checkStudyLogin("users", "pass word", ENV)).toBe(false);
    expect(checkStudyLogin("user", "pass", ENV)).toBe(false);
    expect(checkStudyLogin("user", "Pass word", ENV)).toBe(false);
    expect(checkStudyLogin("user", "pass word ", ENV)).toBe(false);
    expect(checkStudyLogin("", "", ENV)).toBe(false);
  });
});

describe("study session tokens", () => {
  const now = Date.UTC(2026, 10, 20);
  it("verifies a fresh token", () => {
    expect(verifyStudySession(signStudySession(SECRET, now), SECRET, now)).toBe(true);
  });
  it("rejects expired tokens", () => {
    const t = signStudySession(SECRET, now);
    expect(verifyStudySession(t, SECRET, now + STUDY_MAX_AGE_SECONDS * 1000 + 1000)).toBe(false);
  });
  it("rejects a token signed with another secret", () => {
    expect(verifyStudySession(signStudySession("y".repeat(40), now), SECRET, now)).toBe(false);
  });
  it("rejects a tampered expiry", () => {
    const [exp, sig] = signStudySession(SECRET, now).split(".");
    expect(verifyStudySession(`${Number(exp) + 99999}.${sig}`, SECRET, now)).toBe(false);
  });
  it("rejects missing or malformed tokens", () => {
    for (const t of [undefined, "", "abc", ".sig", "123", "12a.sig", "9999999999999.sig"]) {
      expect(verifyStudySession(t, SECRET, now)).toBe(false);
    }
  });
});

describe("studyObjectPath", () => {
  it("maps no segments to index.html and joins plain segments", () => {
    expect(studyObjectPath(undefined)).toBe("index.html");
    expect(studyObjectPath([])).toBe("index.html");
    expect(studyObjectPath(["img", "anat", "hw-bones.jpg"])).toBe("img/anat/hw-bones.jpg");
  });
  it("rejects traversal and odd characters", () => {
    expect(studyObjectPath([".."])).toBeNull();
    expect(studyObjectPath(["img", "..", "x"])).toBeNull();
    expect(studyObjectPath(["img", ""])).toBeNull();
    expect(studyObjectPath(["a b.png"])).toBeNull();
    expect(studyObjectPath(["%2e%2e"])).toBeNull();
  });
});

describe("helpers", () => {
  it("content types", () => {
    expect(studyContentType("index.html")).toMatch(/^text\/html/);
    expect(studyContentType("img/a.JPEG")).toBe("image/jpeg");
    expect(studyContentType("img/a.png")).toBe("image/png");
    expect(studyContentType("weird.bin")).toBe("application/octet-stream");
  });
  it("injects a base href once", () => {
    const out = injectBaseHref("<html><head><title>x</title></head></html>");
    expect(out).toContain('<head><base href="/study/">');
    expect(injectBaseHref(out)).toBe(out);
  });
  it("isStudyPath matches only /study and below", () => {
    expect(isStudyPath("/study")).toBe(true);
    expect(isStudyPath("/study/img/a.png")).toBe(true);
    expect(isStudyPath("/studying")).toBe(false);
    expect(isStudyPath("/home")).toBe(false);
  });
});
