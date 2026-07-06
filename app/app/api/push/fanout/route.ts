import { NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/service-role";
import { buildPushPayload } from "@/lib/push/payload";
import { sendToSubscriptions, type SubscriptionRow } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the pg_net trigger on notifications INSERT (mig 0208). pg_net
// does not retry and there is no useful failure signal to return to it, so
// every handled outcome after auth/validation is a 200.
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.PUSH_FANOUT_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let notificationId: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.notification_id === "string") notificationId = body.notification_id;
  } catch {
    // fall through to 400
  }
  if (!notificationId) {
    return NextResponse.json({ error: "notification_id required" }, { status: 400 });
  }

  const svc = serviceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = svc as unknown as { from: (t: string) => any };

  const { data: n, error: nErr } = await c
    .from("notifications")
    .select("id, user_id, kind, actor_user_id, payload")
    .eq("id", notificationId)
    .maybeSingle();
  if (nErr) {
    console.error("push fanout: notification load failed:", nErr.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  if (!n) return NextResponse.json({ ok: true, dropped: "not_found" }, { status: 200 });

  const { data: subs, error: sErr } = await c
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", n.user_id);
  if (sErr) {
    console.error("push fanout: subscriptions load failed:", sErr.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, dropped: "no_subscriptions" }, { status: 200 });
  }

  const payload = (n.payload ?? {}) as Record<string, unknown>;
  const filmId = typeof payload.film_id === "string" ? payload.film_id : null;

  const [actorRes, filmRes] = await Promise.all([
    n.actor_user_id
      ? c.from("profiles").select("username, display_name").eq("id", n.actor_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    filmId
      ? c.from("films").select("title").eq("id", filmId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const push = buildPushPayload({
    kind: n.kind,
    payload,
    actor: actorRes.data ?? null,
    filmTitle: filmRes.data?.title ?? null,
  });
  if (!push) return NextResponse.json({ ok: true, dropped: "kind" }, { status: 200 });

  const outcome = await sendToSubscriptions(subs as SubscriptionRow[], push);

  if (outcome.dead.length > 0) {
    const { error: delErr } = await c
      .from("push_subscriptions")
      .delete()
      .in("id", outcome.dead);
    if (delErr) console.warn("push fanout: dead-subscription prune failed:", delErr.message);
  }

  return NextResponse.json({ ok: true, sent: outcome.sent, failed: outcome.failed, pruned: outcome.dead.length });
}
