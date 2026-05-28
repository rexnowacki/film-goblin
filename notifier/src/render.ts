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
              <div style="font-family:${FONT_MONO};font-size:9px;letter-spacing:0.28em;text-transform:uppercase;color:#6b6558;">Watch Weirder</div>
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
