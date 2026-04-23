import type { Resend } from "resend";
import type { UserLite } from "./query.js";
import type { RenderedEmail } from "./render.js";

export interface SendOptions {
  from: string;
  baseUrl: string;
}

export async function sendDigest(
  resend: Resend,
  user: UserLite,
  rendered: RenderedEmail,
  opts: SendOptions,
): Promise<void> {
  const unsubUrl = `${opts.baseUrl}/api/unsubscribe/${user.unsubscribe_token}`;
  const { error } = await resend.emails.send({
    from: opts.from,
    to: [user.email],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (error) throw new Error(`resend: ${error.message}`);
}
