"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/actions/push";

type State =
  | "loading"
  | "unsupported"   // no PushManager (e.g. iOS Safari outside Home-Screen install)
  | "denied"        // browser permission denied
  | "off"
  | "on"
  | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "on" : "off");
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("push is not configured");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("browser returned an incomplete subscription");
      }
      const res = await subscribeToPush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent,
      );
      if (!res.ok) throw new Error(res.error ?? "subscribe failed");
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not enable push");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await unsubscribeFromPush(endpoint);
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not disable push");
      setState("on");
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    return (
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
        Push isn&apos;t available in this browser. On iPhone, install Film Goblin
        to your Home Screen (Share → Add to Home Screen), then enable push here.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
        Notifications are blocked for Film Goblin in your browser settings.
        Allow them there, then return here.
      </p>
    );
  }

  const on = state === "on";
  return (
    <div>
      <button
        type="button"
        className="btn btn-outline"
        disabled={state === "busy"}
        onClick={on ? disable : enable}
        aria-pressed={on}
      >
        {state === "busy" ? "…" : on ? "Push: on — disable" : "Enable push notifications"}
      </button>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
        Coven news, recommendations, gazing RSVPs, and price drops — sent to
        this device.
      </p>
      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--danger, #c33)" }}>{error}</p>
      )}
    </div>
  );
}
