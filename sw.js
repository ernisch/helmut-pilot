self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch-Handler: reiner Netzwerk-Passthrough fuer Navigationen (kein Caching,
// kein Offline-Verhalten geaendert). Notwendig, damit Chrome/Brave die Seite als
// installierbare PWA erkennen und den "App installieren"-Dialog anbieten.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});

// --- App-Icon-Badge (Zahl auf dem Startbildschirm-Icon) ---------------------
// Der Zaehler muss persistent sein, weil der Service Worker zwischen zwei Pushes
// beendet wird. Wir legen ihn im Cache Storage ab (kein IndexedDB-Boilerplate).
const BADGE_CACHE = "helmut-badge";

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match("badge-count");
    if (!res) return 0;
    const n = Number(await res.text());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function writeBadgeCount(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put("badge-count", new Response(String(Math.max(0, n))));
  } catch {
    /* Cache nicht verfuegbar -> Badge bleibt best effort */
  }
}

async function applyBadge(n) {
  if (!self.navigator || !("setAppBadge" in self.navigator)) return;
  try {
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    /* Plattform unterstuetzt kein Badge -> still ignorieren */
  }
}

async function bumpBadge() {
  const next = (await readBadgeCount()) + 1;
  await writeBadgeCount(next);
  await applyBadge(next);
}

async function resetBadge() {
  await writeBadgeCount(0);
  await applyBadge(0);
}

// Client meldet "geoeffnet/gelesen" -> Badge zuruecksetzen.
self.addEventListener("message", (event) => {
  if (event.data === "clear-badge" || event.data?.type === "clear-badge") {
    event.waitUntil(resetBadge());
  }
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
    renotify: true,
    data: {
      url: payload.url || "/",
      type: payload.type || "update"
    }
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Zahl aufs App-Icon (setAppBadge). Vom Server geliefertes badgeCount hat
    // Vorrang; sonst einfach hochzaehlen (WhatsApp-artig).
    if (Number.isFinite(Number(payload.badgeCount))) {
      const n = Math.max(0, Number(payload.badgeCount));
      await writeBadgeCount(n);
      await applyBadge(n);
    } else {
      await bumpBadge();
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).toString();
  event.waitUntil((async () => {
    await resetBadge();
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
