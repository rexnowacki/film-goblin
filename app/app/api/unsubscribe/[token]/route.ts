import pg from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pageHtml(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F3ECD8;font-family:Georgia,serif;color:#0A0A0A;">
<main style="max-width:480px;margin:80px auto;padding:48px 32px;border:3px solid #0A0A0A;background:#F3ECD8;box-shadow:12px 12px 0 #FF2D88;">
<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;margin-bottom:12px;">✦ Film Goblin</div>
<h1 style="font-size:42px;line-height:1;margin:0 0 20px;">${heading}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px;font-style:italic;">${body}</p>
<a href="/settings" style="display:inline-block;padding:10px 18px;background:#0A0A0A;color:#F3ECD8;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Go to Settings</a>
</main>
</body>
</html>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response(
      pageHtml("Error", "Something went wrong", "The service is misconfigured. Please try again later."),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const result = await client.query(
      `UPDATE profiles SET email_notifications_enabled = FALSE WHERE unsubscribe_token = $1 RETURNING handle`,
      [token],
    );
    if (result.rowCount === 0) {
      return new Response(
        pageHtml(
          "Link expired",
          "Link no longer valid",
          "This unsubscribe link is no longer valid. It may have been rotated after you re-enabled email notifications.",
        ),
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new Response(
      pageHtml(
        "Unsubscribed",
        "You're off the list",
        "We'll stop sending price-drop emails. You can turn them back on any time from your Settings page.",
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("unsubscribe route failed:", message);
    return new Response(
      pageHtml("Error", "Something went wrong", "We couldn't process your unsubscribe request. Please try again."),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } finally {
    await client.end().catch(() => {});
  }
}
