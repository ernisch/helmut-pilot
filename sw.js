self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "Helmut",
      body: event.data ? event.data.text() : "Neue Lage verfügbar."
    };
  }

  const title = payload.title || "Helmut";
  const options = {
    body: payload.body || "Neue Lage verfügbar.",
    icon: "/assets/helmut_appicon_192.png",
    badge: "/assets/helmut_appicon_192.png",
    tag: payload.tag || payload.type || "helmut-update",
    renotify: false,
    data: {
      url: payload.url || "/",
      type: payload.type || "update"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).toString();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
