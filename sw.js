// Version bei jedem groesseren SW-Update erhoehen -> alte Asset-Caches werden
// beim activate aufgeraeumt. BADGE_CACHE wird bewusst NICHT geloescht.
// v2: Icon-Hintergrundfarbe korrigiert (#0f172a -> #050914, sichtbares Kaesten
// im Android-PWA-Splash behoben) -> neuer Cache-Namespace + versionierte
// Precache-URLs, damit kein Client alte Icon-Bytes aus dem SW-Cache behaelt.
const ASSET_CACHE = "helmut-assets-v2";
const ICON_VERSION = "20260712-iconfix1";
const PRECACHE_URLS = [
  `/assets/helmut_appicon_192.png?v=${ICON_VERSION}`,
  `/assets/helmut_appicon_512.png?v=${ICON_VERSION}`
];

// Elegante Offline-Ansicht im Helmut-Design. Inline im SW, damit sie ohne Netz
// und ohne zusaetzliche Datei/Route garantiert verfuegbar ist.
const OFFLINE_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#050914"><title>Ich hab gerade keine Verbindung · Helmut</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;place-items:center;min-height:100dvh;padding:32px;background:radial-gradient(circle at 50% 38%,rgba(140,92,255,.14),transparent 30%),linear-gradient(180deg,#070b15,#050914 70%,#03050b);color:#f5f1e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
.wrap{max-width:340px}.mark{width:76px;height:76px;margin:0 auto 26px;border-radius:20px;display:grid;place-items:center;background:#0f1729;box-shadow:0 24px 70px rgba(140,92,255,.28);font:800 40px/1 Inter,sans-serif;color:#fbf7ef;letter-spacing:-.04em}
h1{font-size:22px;margin:0 0 12px;letter-spacing:-.02em}p{margin:0 0 28px;font-size:15px;line-height:1.55;color:rgba(245,241,232,.62)}
button{appearance:none;border:0;cursor:pointer;width:100%;padding:15px 20px;border-radius:14px;font:600 16px Inter,sans-serif;color:#0b0f1a;background:#f5f1e8}button:active{transform:translateY(1px)}</style></head>
<body><div class="wrap"><div class="mark">H</div><h1>Ich hab gerade keine Verbindung</h1>
<p>Ohne Netz komme ich nicht an deine aktuelle Lage. Sobald du wieder online bist, bin ich sofort für dich da.</p>
<button type="button" onclick="location.reload()">Nochmal versuchen</button></div>
<script>addEventListener("online",function(){location.reload()});</script></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(ASSET_CACHE);
      await cache.addAll(PRECACHE_URLS);
    } catch { /* Precache best effort */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Alte Asset-Caches aufraeumen, Badge-Cache behalten.
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== ASSET_CACHE && k !== BADGE_CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

// Pruning alter ?v-Eintraege (Audit-Folgebranch 2026-07): stale-while-revalidate
// legt pro Deploy neue Eintraege fuer styles.css?v=NEU, client.js?v=NEU und alle
// per ?v= referenzierten Icons an — die alten ?v-Staende blieben bislang bis zum
// naechsten ASSET_CACHE-Namespace-Bump liegen (monoton wachsender Cache).
// Rein additiv: geloescht wird NUR derselbe Pfad mit ABWEICHENDEM ?v=-Parameter.
// Unversionierte Eintraege (ohne ?v=), andere Pfade und der BADGE_CACHE bleiben
// unberuehrt; Fehler sind best effort und aendern das Cache-Verhalten nicht.
async function pruneOldVersions(cache, req) {
  try {
    const reqUrl = new URL(req.url);
    const reqVersion = reqUrl.searchParams.get("v");
    if (!reqVersion) return;
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => {
      let keyUrl;
      try { keyUrl = new URL(key.url); } catch { return null; }
      if (keyUrl.pathname !== reqUrl.pathname) return null;
      const keyVersion = keyUrl.searchParams.get("v");
      if (!keyVersion || keyVersion === reqVersion) return null;
      return cache.delete(key);
    }));
  } catch { /* Pruning best effort — Cache-Hygiene, nie Funktionalitaet */ }
}

// Fetch-Strategie:
//  - Navigationen: erst Netz, bei Fehler elegante Offline-Seite (nie Browser-Fehler).
//  - Statische Assets (css/js/bilder/fonts): stale-while-revalidate -> schneller Start
//    auch bei schlechtem Netz, im Hintergrund aktualisiert.
//  - Alles andere (API, POST): unveraendert direkt ans Netz.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (["style", "script", "image", "font"].includes(req.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            cache.put(req, res.clone())
              // Nach erfolgreichem put: alte ?v-Staende desselben Pfads entsorgen.
              .then(() => pruneOldVersions(cache, req))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => null);
      return cached || (await network) || new Response("", { status: 504 });
    })());
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
    icon: `/assets/helmut_appicon_192.png?v=${ICON_VERSION}`,
    badge: `/assets/helmut_appicon_192.png?v=${ICON_VERSION}`,
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
