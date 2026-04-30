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

function renderAlertBlockHtml(alert: AlertLite, baseUrl: string): string {
  const f = alert.film;
  const pct = pctOff(alert.old_price_usd, alert.new_price_usd);
  return `
  <tr>
    <td style="padding:24px 0;border-bottom:1px solid #0A0A0A;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="150" valign="top" style="padding-right:20px;">
            <img src="${escapeHtml(f.artwork_url)}" alt="${escapeHtml(f.title)}"
                 width="150" height="225"
                 style="display:block;width:150px;height:225px;object-fit:cover;border:2px solid #0A0A0A;" />
          </td>
          <td valign="top">
            <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#666;margin-bottom:6px;">Chapter I · The Pit</div>
            <h2 style="font-family:'DM Serif Display',Georgia,serif;font-size:32px;line-height:1;margin:0 0 10px;color:#0A0A0A;">${escapeHtml(f.title)}</h2>
            <div style="font-family:Georgia,serif;font-size:13px;color:#333;margin-bottom:16px;">
              ${escapeHtml(f.director)} · ${f.year} · ${f.runtime_min} min
            </div>
            <div style="font-family:Georgia,serif;font-size:16px;margin-bottom:18px;">
              <span style="text-decoration:line-through;color:#888;">$${alert.old_price_usd.toFixed(2)}</span>
              &nbsp;&rarr;&nbsp;
              <span style="color:#FF2D88;font-weight:bold;">$${alert.new_price_usd.toFixed(2)}</span>
              <span style="display:inline-block;margin-left:10px;padding:2px 8px;background:#0A0A0A;color:#F5D300;font-size:11px;letter-spacing:0.1em;">${pct}% OFF</span>
            </div>
            <a href="${escapeHtml(f.itunes_url)}"
               style="display:inline-block;padding:10px 18px;background:#0A0A0A;color:#F3ECD8;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;border:2px solid #0A0A0A;margin-right:8px;">Summon on Apple TV &rarr;</a>
            <a href="${baseUrl}/film/${encodeURIComponent(f.id)}"
               style="font-family:Arial,sans-serif;font-size:12px;color:#0A0A0A;letter-spacing:0.1em;text-transform:uppercase;">View on Film Goblin</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
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

export function renderDigestEmail(
  user: UserLite,
  alerts: AlertLite[],
  baseUrl: string,
): RenderedEmail {
  const unsubUrl = `${baseUrl}/api/unsubscribe/${user.unsubscribe_token}`;
  const settingsUrl = `${baseUrl}/settings`;

  const subject = alerts.length === 1
    ? `A film just dropped: ${alerts[0].film.title}`
    : `${alerts.length} films from your watchlist just dropped`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3ECD8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F3ECD8;">
  <tr><td align="center" style="padding:32px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#F3ECD8;border:3px solid #0A0A0A;">
      <tr><td style="padding:28px 24px 0;">
        <div style="font-family:'Rubik Wet Paint',Georgia,serif;font-size:44px;line-height:1;color:#0A0A0A;letter-spacing:-0.02em;">
          Film <span style="color:#FF2D88;">Goblin</span>
        </div>
        <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#666;margin-top:8px;">
          Watch Weirder · Issue nº1
        </div>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <div style="height:8px;background:#0A0A0A;margin:20px 0 0;"></div>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${alerts.map(a => renderAlertBlockHtml(a, baseUrl)).join("")}
        </table>
      </td></tr>
      <tr><td style="padding:24px;background:#0A0A0A;color:#F3ECD8;font-family:Georgia,serif;font-size:12px;line-height:1.6;">
        <div style="margin-bottom:8px;">Summoned by Film Goblin · hello, ${escapeHtml(user.username)}.</div>
        <div>
          <a href="${unsubUrl}" style="color:#F5D300;text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${settingsUrl}" style="color:#F5D300;text-decoration:underline;">Manage preferences</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    `FILM GOBLIN — ${alerts.length === 1 ? "A film just dropped" : `${alerts.length} films just dropped`}`,
    "",
    ...alerts.map(a => renderAlertBlockText(a, baseUrl) + "\n"),
    "---",
    `Unsubscribe: ${unsubUrl}`,
    `Manage preferences: ${settingsUrl}`,
  ].join("\n");

  return { subject, html, text };
}
