/* Film Goblin push service worker. Single-purpose: display push
   notifications and deep-link on tap. NO caching / fetch handling —
   offline behavior is out of scope by design (see spec 2026-07-03). */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || !payload.title) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || "",
      tag: payload.tag || undefined,
      icon: "/icons/icon-192.png",
      data: { url: payload.url || "/home" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname === url.split("?")[0] && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
