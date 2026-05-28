# Email Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dated cream "Issue nº1" digest email with the approved refined-light layout (modernized zine), driven by the existing data and helpers.

**Architecture:** Pure rendering change confined to `notifier/src/render.ts`. The function `renderDigestEmail(user, alerts, baseUrl)` and its helpers `renderAlertBlockHtml` / `renderAlertBlockText` keep their signatures; only the HTML/text strings and intro copy change. No schema, query, or send-path changes. Tests in `notifier/tests/render.test.ts` are strengthened to lock the new markup and singular/plural copy.

**Tech Stack:** TypeScript, Vitest. Run from `notifier/`. Node 20 (prefix `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` if `nvm use 20` not active).

**Branch:** `feature/email-redesign` (already created and checked out).

**Spec:** `docs/superpowers/specs/2026-05-28-email-redesign-design.md`
**Visual source of truth:** `notifier/prototypes/email-light.html`

---

### Task 1: Strengthen render tests for the new layout (RED)

**Files:**
- Test: `notifier/tests/render.test.ts`

The existing fixtures (`USER`, `FILM_A`, `FILM_B`, `BASE_URL`) and existing `it(...)` blocks stay as-is — they assert escaping, prices, URLs, artwork, token, and text, all of which the new template still satisfies. We only ADD new assertions for the redesign's structural markers and copy.

- [ ] **Step 1: Add new test cases**

Append these `it` blocks inside the existing `describe("renderDigestEmail", ...)` block in `notifier/tests/render.test.ts`, before its closing `});`:

```ts
  it("renders the Film Goblin wordmark and footer controls", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    // Wordmark split so "GOBLIN" can be accented separately.
    expect(out.html).toContain("FILM");
    expect(out.html).toContain("GOBLIN");
    expect(out.html).toContain("Watch Weirder");
    expect(out.html).toContain("Manage preferences");
    expect(out.html).toContain("https://film-goblin.vercel.app/settings");
  });

  it("renders a black-on-yellow percent-off stamp", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    // 9.99 -> 4.99 == 50% off (rounded).
    expect(out.html).toContain("50% OFF");
    expect(out.html).toContain("Summon on Apple TV");
  });

  it("uses singular intro copy for one deal", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.html).toContain("coughed up a drop");
    expect(out.html).not.toContain("coughed up 1 drops");
    expect(out.text).toContain("coughed up a drop");
  });

  it("uses pluralized intro copy for multiple deals", () => {
    const alerts: AlertLite[] = [
      { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A },
      { id: "a2", old_price_usd: 14.99, new_price_usd: 6.99, film: FILM_B },
    ];
    const out = renderDigestEmail(USER, alerts, BASE_URL);
    expect(out.html).toContain("coughed up 2 drops");
    expect(out.text).toContain("coughed up 2 drops");
  });

  it("greets the user by username in the body", () => {
    const alert: AlertLite = { id: "a1", old_price_usd: 9.99, new_price_usd: 4.99, film: FILM_A };
    const out = renderDigestEmail(USER, [alert], BASE_URL);
    expect(out.html).toContain("moss.witch");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd notifier && npm test -- render`
Expected: The 5 new tests FAIL (current template has "Issue nº1", no "coughed up", no "Summon on Apple TV" string variant `Summon on Apple TV` without `&rarr;` — actually current uses `Summon on Apple TV &rarr;` so that substring passes; the failing ones are wordmark "Watch Weirder", "coughed up …", "Manage preferences" passes today, "50% OFF" — current emits `${pct}% OFF` so that passes too). At minimum the "Watch Weirder" and "coughed up …" assertions FAIL. Existing tests still PASS.

Note: do not "fix" the test to match the old template — the implementation in Task 2 makes all assertions pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add notifier/tests/render.test.ts
git commit -m "test: lock new digest email layout + singular/plural copy"
```

---

### Task 2: Rewrite the email template (GREEN)

**Files:**
- Modify: `notifier/src/render.ts` (full replacement of the file body below)

- [ ] **Step 1: Replace `notifier/src/render.ts` with this exact content**

```ts
import type { UserLite, AlertLite } from "./query.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pctOff(oldP: number, newP: number): number {
  if (oldP <= 0) return 0;
  return Math.round(((oldP - newP) / oldP) * 100);
}

// Shared inline style fragments so blocks stay consistent. Email clients do not
// read CSS variables, so token values from app/app/styles/00-core.css are
// hardcoded here. Deep pink (#d01666) is used for accents because the bright
// pink (#ff2d88) fails AA contrast on the cream paper.
const FONT_DISPLAY = "'DM Serif Display',Georgia,serif";
const FONT_SANS = "'IBM Plex Sans',system-ui,sans-serif";
const FONT_MONO = "'IBM Plex Mono',ui-monospace,monospace";

function renderAlertBlockHtml(alert: AlertLite, baseUrl: string): string {
  const f = alert.film;
  const pct = pctOff(alert.old_price_usd, alert.new_price_usd);
  return `
  <tr><td style="padding:24px 30px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="118" valign="top" style="padding-right:20px;">
          <img src="${escapeHtml(f.artwork_url)}" alt="${escapeHtml(f.title)}"
               width="118" height="177"
               style="display:block;width:118px;height:177px;object-fit:cover;border:2px solid #0a0a0a;background:#e8dfc4;" />
        </td>
        <td valign="top">
          <h2 style="font-family:${FONT_DISPLAY};font-size:27px;line-height:1.04;margin:0 0 6px;color:#0a0a0a;">${escapeHtml(f.title)}</h2>
          <div style="font-family:${FONT_SANS};font-size:12px;letter-spacing:0.04em;color:#6b6558;margin-bottom:16px;">${escapeHtml(f.director)} · ${f.year} · ${f.runtime_min} min</div>
          <div style="margin-bottom:18px;font-family:${FONT_MONO};">
            <span style="font-size:14px;text-decoration:line-through;color:#8a8578;">$${alert.old_price_usd.toFixed(2)}</span>
            <span style="font-size:22px;color:#d01666;font-weight:600;margin:0 6px;">$${alert.new_price_usd.toFixed(2)}</span>
            <span style="display:inline-block;vertical-align:2px;padding:3px 8px;background:#0a0a0a;color:#f5d300;font-size:10px;font-weight:600;letter-spacing:0.1em;">${pct}% OFF</span>
          </div>
          <a href="${escapeHtml(f.itunes_url)}" style="display:inline-block;padding:11px 18px;background:#0a0a0a;color:#f3ecd8;text-decoration:none;font-family:${FONT_SANS};font-weight:600;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Summon on Apple TV →</a>
          <a href="${baseUrl}/film/${encodeURIComponent(f.id)}" style="display:inline-block;padding:11px 4px;margin-left:10px;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.06em;color:#6b6558;text-decoration:none;text-transform:uppercase;">Details</a>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

function renderAlertBlockText(alert: AlertLite, baseUrl: string): string {
  const f = alert.film;
  const pct = pctOff(alert.old_price_usd, alert.new_price_usd);
  return [
    `${f.title} (${f.year}) — dir. ${f.director}`,
    `$${alert.old_price_usd.toFixed(2)} → $${alert.new_price_usd.toFixed(2)} (${pct}% off)`,
    `Apple TV: ${f.itunes_url}`,
    `Film Goblin: ${baseUrl}/film/${f.id}`,
  ].join("\n");
}

// Singular/plural intro copy. `count` is the number of deals in the digest.
function introEyebrow(count: number): string {
  return count === 1
    ? "⛧ The pit coughed up a drop"
    : `⛧ The pit coughed up ${count} drops`;
}

function introBody(count: number, username: string): string {
  const noun = count === 1 ? "A film you've" : `${count} films you've`;
  return `Hello, <span style="color:#0a0a0a;font-weight:600;">${escapeHtml(username)}</span>. ${noun} been stalking just got cheaper on Apple TV. Move before the price crawls back up.`;
}

export function renderDigestEmail(
  user: UserLite,
  alerts: AlertLite[],
  baseUrl: string,
): RenderedEmail {
  const unsubUrl = `${baseUrl}/api/unsubscribe/${user.unsubscribe_token}`;
  const settingsUrl = `${baseUrl}/settings`;
  const count = alerts.length;

  const subject = count === 1
    ? `A film just dropped: ${alerts[0].film.title}`
    : `${count} films from your watchlist just dropped`;

  const filmBlocks = alerts
    .map((a) => renderAlertBlockHtml(a, baseUrl))
    .join('\n<tr><td style="padding:0 30px;"><div style="border-top:1px solid #d8cfb4;"></div></td></tr>\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#e8dfc4;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#e8dfc4;">
  <tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#f3ecd8;border:2px solid #0a0a0a;">
      <tr><td style="padding:30px 30px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td valign="middle">
              <div style="font-family:${FONT_DISPLAY};font-size:30px;line-height:1;color:#0a0a0a;letter-spacing:-0.01em;">FILM <span style="color:#d01666;">GOBLIN</span></div>
            </td>
            <td valign="middle" align="right">
              <div style="font-family:${FONT_MONO};font-size:9px;letter-spacing:0.28em;text-transform:uppercase;color:#6b6558;">Watch&nbsp;Weirder</div>
            </td>
          </tr>
        </table>
        <div style="height:3px;background:#0a0a0a;margin-top:18px;"></div>
      </td></tr>
      <tr><td style="padding:6px 30px 4px;">
        <div style="font-family:${FONT_MONO};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#d01666;margin-bottom:12px;">${introEyebrow(count)}</div>
        <div style="font-family:${FONT_SANS};font-size:15px;line-height:1.55;color:#3a382f;">${introBody(count, user.username)}</div>
      </td></tr>
      ${filmBlocks}
      <tr><td style="padding:22px 30px 26px;background:#0a0a0a;">
        <div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#f5d300;margin-bottom:10px;">Film Goblin</div>
        <div style="font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:#a8a290;">
          You get these because a film on your watchlist dropped in price.<br>
          <a href="${unsubUrl}" style="color:#f3ecd8;text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${settingsUrl}" style="color:#f3ecd8;text-decoration:underline;">Manage preferences</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    introEyebrow(count).replace(/^⛧ /, "FILM GOBLIN — "),
    "",
    ...alerts.map((a) => renderAlertBlockText(a, baseUrl) + "\n"),
    "---",
    `Unsubscribe: ${unsubUrl}`,
    `Manage preferences: ${settingsUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

- [ ] **Step 2: Run the render tests**

Run: `cd notifier && npm test -- render`
Expected: PASS — all original assertions plus the 5 new ones.

- [ ] **Step 3: Run the full notifier suite + typecheck**

Run: `cd notifier && npm test && npm run typecheck`
Expected: All tests PASS, typecheck clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add notifier/src/render.ts
git commit -m "feat: redesign price-drop digest email (refined-light)"
```

---

### Task 3: Visual verification + finish

**Files:** none (verification only)

- [ ] **Step 1: Eyeball the rendered HTML against the prototype**

Generate a sample render and open it, to confirm the live template matches `notifier/prototypes/email-light.html`:

```bash
cd notifier && PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsx -e "
import { renderDigestEmail } from './src/render.ts';
import { writeFileSync } from 'node:fs';
const film = (id,t,d,y,r,a,u)=>({id,title:t,director:d,year:y,runtime_min:r,artwork_url:a,itunes_url:u});
const out = renderDigestEmail(
  { id:'u1', username:'rex', email:'x@y.z', unsubscribe_token:'tok' },
  [
    { id:'a1', old_price_usd:19.99, new_price_usd:9.99, film: film('f1','Send Help','Sam Raimi',2026,114,'https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/30/ca/78/30ca78b6-86fc-d1b3-1521-011336589897/SendHelp_Apple_CoverArt_2000x3000_ENG.png/600x600bb.jpg','https://itunes.apple.com/us/movie/send-help/id1877120652') },
    { id:'a2', old_price_usd:14.99, new_price_usd:5.99, film: film('f2','The Dreadful','Natasha Kermani',2026,94,'https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/bf/9b/de/bf9bde1a-9dc3-30f3-e464-8f2b732810e7/TheDreadful_iTunesStore_Movies_Cvr.png/600x600bb.jpg','https://itunes.apple.com/us/movie/the-dreadful/id1876424617') }
  ],
  'https://film-goblin.vercel.app',
);
writeFileSync('/tmp/digest-live.html', out.html);
console.log('wrote /tmp/digest-live.html');
"
open /tmp/digest-live.html
```

Expected: the live render matches `notifier/prototypes/email-light.html` — cream card, FILM GOBLIN wordmark with deep-pink "GOBLIN", eyebrow "The pit coughed up 2 drops", two film blocks with real posters, black-on-yellow stamps, black "Summon on Apple TV →" CTAs, black footer with Unsubscribe / Manage preferences. If anything diverges, fix `render.ts` and re-run Task 2 Step 2.

- [ ] **Step 2: Final verification before handoff**

Run: `cd notifier && npm test && npm run typecheck`
Expected: all PASS, typecheck clean.

This confirms the redesign is complete. The notifier public API (`sendDailyDigests`) is unchanged, so no consumer in `app/` needs updating, and `notifier/CLAUDE.md` needs no edits (file map and contract are the same).

---

## Self-review

- **Spec coverage:** Layout (Task 2 markup) ✓; singular/plural copy (Task 1 tests + Task 2 `introEyebrow`/`introBody`) ✓; token-derived colors with deep pink for AA (Task 2 inline hex) ✓; web-font link + fallback stacks (Task 2 `<head>` + font constants) ✓; helper reuse `escapeHtml`/`pctOff` + unchanged signatures (Task 2) ✓; plaintext header refresh (Task 2 `text` builder) ✓; test plan (Task 1) ✓; out-of-scope items untouched (no other files modified) ✓.
- **Placeholders:** none — full file content and exact commands provided.
- **Type consistency:** `introEyebrow(count)`, `introBody(count, username)`, `renderAlertBlockHtml(alert, baseUrl)`, `renderAlertBlockText(alert, baseUrl)` names used consistently between definition and call sites; `AlertLite`/`UserLite`/`RenderedEmail` match `query.ts`.