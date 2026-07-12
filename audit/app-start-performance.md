# App-Start-Performance — Helmut (VORHER-Audit)

**Sprint:** SaaS-Readiness-Audit · **Phase 7** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend/messend, nicht-destruktiv. Keine Production-Writes, keine Fixes.
**Belegbasis:** `server.js` (`/api/app/start`), `client.js` (Boot), `index.html`, `sw.js`, `vercel.json`; lokal gemessene Asset-Größen; Prod-Header via Vercel-MCP.

> **Mess-Einschränkung (ehrlich):** Direkter `curl` gegen `helmut-pilot.vercel.app` ist durch die Org-Egress-Policy **blockiert** (verifiziert: `CONNECT tunnel failed, response 403`). Daher **keine `time_total`-Werte** aus dieser Umgebung. Ersatzweise: Code-Pfad-Analyse (deterministisch), lokal gemessene Asset-Größen, und Prod-Response-Header über die sanktionierte Vercel-MCP-Route. Live-Timing-Messungen sind **Betreiber-Aufgabe** (reproduzierbare Kommandos in §6).

> **Kernbefund:** Es gibt **kein progressives Rendering** — der Vollbild-Splash bleibt sichtbar, bis `/api/auth/session` **und** die komplette `/api/app/start`-Antwort da sind. Die Cache-First-Sofortrender-Optimierung ist **toter Code**. `/api/app/start` bündelt Profil + Briefing + **Lage (ggf. LLM ≤12s)** + Tasks + Notes **seriell** in einer Antwort, mit **doppeltem** KO-Load und **doppeltem** N+1-Quellen-Load.

---

## 1. Server-Pfad `/api/app/start` (server.js:285-308, verifiziert)

Handler-Ablauf, alle Top-Level-`await` **seriell**:
```
activeProfile(politicianId)                                  // 1) Profil-Read
→ latestBriefingPayload({compact:true})                      // 2) buildV3Briefing
→ briefing.lageBriefing = withTimeout(buildLageBriefing,12000)// 3) Lage (bis 12s, ggf. LLM)
→ tasks:  await getTasks(profile.id)                         // 4) seriell
→ notes:  await getUserNotes(profile.id)                     // 5) seriell
→ aiStatus
```

**A) Doppelte 200-KO-Ladung:** `buildV3Briefing` ruft `listKnowledgeObjects({limit:200})` (server.js:1330). `buildLageBriefing` ruft im **selben Request** erneut `listKnowledgeObjects({limit:200})` (lage.js:286). → **2× bis 200 KO-Zeilen** pro App-Start, ohne Memoization.

**B) N+1-Quellenabfrage — zweimal:** `loadSourcesByVorgang` (server.js:1422-1429) feuert **eine Supabase-REST-Query pro KO** (`getSourcesForVorgang` → `ko_document_links`, storage.js:1082-1097). `buildLageBriefing` macht dasselbe via `loadSourcesForVorgaenge` (lage.js:320-338). Beide mit `Promise.all` parallelisiert (positiv), bleiben aber je **N einzelne Round-Trips**; keine Batch-`IN(...)`-Query. Bei `decideForUser({limit:50})` potenziell ~50 + ~12 Einzel-Queries pro Start.

**C) Lage-Briefing kann einen Live-LLM-Call im App-Start auslösen:** `buildLageBriefing` liest zuerst den Cache `bf-<user>-lage-<berlinTag>` (lage.js:431). **Cache-Hit** (Tag + KO-Set-Hash unverändert) → nur 1 Read. **Cache-Miss** → PipelineLock + Budget-Gate + `ai.generateLageBriefing()` (lage.js:468) + Save. Hart auf 12s gedeckelt — aber der erste Start pro Berlin-Tag/KO-Änderung trägt die volle LLM-Latenz. **Bei Timeout verschwinden alle Lage-Karten** (siehe `lage.md` §4).

**D) Serialität:** `tasks`/`notes` (server.js:300-301) sind unabhängig, laufen aber **seriell nach** dem Briefing+Lage-Block. Könnten via `Promise.all` überlappen.

**E) Payload:** `compact:true` → `compactBriefingPayload` (server.js:1431) kappt Arrays (items/recs/situational→15, mentions/notifications→6), leert `evidence/sources/signals/rawItems`. Positiv. **Exakte Prod-JSON-Größe nicht messbar** (401-Gate). *VERMUTUNG:* ~60-180 KB unkomprimiert / ~15-40 KB brotli.

---

## 2. Client-Boot (client.js) — wartet auf ALLE Daten (verifiziert)

Boot-Reihenfolge (`loadBriefing`, aufgerufen am Modul-Ende):
1. `authState = await fetchAuthState()` → `GET /api/auth/session`, **erster blockierender await** (client.js:376).
2. `loadCachedStartPayload()` → **gibt bedingungslos `null` zurück** (client.js:660-663); `saveCachedStartPayload` ist **No-op** (665-667). ⇒ **Die gesamte Cache-First-Sofortrender-Optimierung ist toter Code.** `renderedFromCache` ist nie `true`.
3. `await fetchWithTimeout('/api/app/start', {}, 25000)` → **zweiter blockierender await, bis 25s** (client.js:402).
4. Erst danach: `applyStartPayload` → `render()` → `hideStartupSplash()`.

**App-Shell = globales Warten:** `render()` baut die komplette UI in einem Rutsch und ruft **erst dort** `hideStartupSplash()` (client.js:2984). ⇒ **Der Vollbild-Splash („H") bleibt sichtbar, bis `/api/auth/session` UND die komplette `/api/app/start` fertig sind.** Navigation erscheint **nicht** unabhängig; nichts progressiv.

**Zeit-bis-sichtbar (Abhängigkeiten):**
| UI-Bereich | wartet auf |
|---|---|
| Splash „H" (inline CSS) | sofort (index.html:22-35) |
| App-Shell / Navigation | `/api/auth/session` + **komplettes** `/api/app/start` |
| Lage / Radar / Helmut | dieselbe **eine** `/api/app/start`-Antwort (Radar liest `briefing.currentRadarState` — **kein** Extra-Call, positiv) |
| Büro (Office) | Hintergrund nach Render (`generateOfficeDraftsInBackground`) |
| Parlament | Hintergrund nach Render (`loadParliament`) |

**Render-Blocking / Assets:**
- `styles.css` render-blockend im `<head>` (index.html:25).
- `<script src="client.js">` **ohne `defer`/`async`** (index.html:38) — blockiert bis vollständig geladen+geparst.
- Font **lokal** vorgeladen (index.html:21), kein CDN (positiv; CSP `connect-src 'self'`).
- Splash-Watchdog: Stufe 1 bei **8s** (client.js nie geladen), Stufe 2 bei **30s** (`is-loading` hängt) → „Neu laden".

**Service Worker (sw.js):** Navigationen **network-first**, bei Fehler Inline-Offline-HTML (sw.js:59-71) — **kein** HTML-Precache/Offline-Shell. Statische Assets **stale-while-revalidate** (sw.js:73-85) → warmer Wiederbesuch rendert Shell aus SW-Cache. Precache nur die 2 App-Icons — **nicht** client.js/styles.css.

---

## 3. Echte Messwerte (Größen + Header; Timing egress-blockiert)

**Asset-Größen (lokal gemessen, raw / gzip-9; Prod-Brotli real ~10-15% kleiner):**
| Ressource | raw | gzip-9 |
|---|---|---|
| `client.js` | 534.397 B (522 KB) | 140.821 B (138 KB) |
| `styles.css` | 307.557 B (300 KB) | 59.319 B (58 KB) |
| `sw.js` | 7.619 B | 3.239 B |
| `index.html` | 6.007 B | 2.416 B |

**Prod-Header (Vercel-MCP, verifiziert durch den Untersuchungs-Agenten):**
| Ressource | HTTP | Cache-Control | x-vercel-cache |
|---|---|---|---|
| `GET /` | 200 | **`no-store`** | MISS |
| `GET /client.js` | 200 | `public, max-age=86400, stale-while-revalidate=604800` (vercel.json:36) | — |
| `GET /styles.css` | 200 | `public, max-age=86400, stale-while-revalidate=604800` (vercel.json:29) | — |
| `GET /sw.js` | 200 | `public, max-age=0, must-revalidate` | HIT |
| `GET /assets/*` | 200 | `public, max-age=31536000, immutable` (vercel.json:22) | — |
| `GET /api/app/start` | **401** | `no-store` | MISS |

**Belegte Prod-Fakten:** CSP aktiv (`connect-src 'self'`), Region **fra1** (Origin) via IAD-Edge, **keine `Server-Timing`-Header**. `/api/app/start` ohne Session → **401** → Payload-/Server-Timing der echten Antwort **nur mit Credentials** messbar (Betreiber).

---

## 4. Request-Timeline (Kaltstart)

```
t0   GET /                 → 200, no-store, brotli ~2 KB   [MUSS jedes Mal ans Netz]
t0   GET /styles.css       → render-blocking, brotli ~50 KB (warm: SW-Cache)
t0   GET /client.js        → NICHT defer/async, brotli ~120 KB → blockiert JS-Start
     ── client.js parst/läuft ──
t1   GET /api/auth/session → BLOCKIEREND (≤6s). Splash bleibt.
t2   GET /api/app/start    → BLOCKIEREND (≤25s Client / 300s Server).
        seriell: activeProfile
                 buildV3Briefing:  listKnowledgeObjects(200) + N× ko_document_links
                 buildLageBriefing: listKnowledgeObjects(200) + M× ko_document_links
                                    + [Cache-Miss → LLM generateLageBriefing ≤12s]
                 getTasks ; getUserNotes  (seriell)
t3   applyStartPayload → render() → hideStartupSplash()   ← ERSTE echte UI
t3+  Hintergrund: loadParliament, generateOfficeDraftsInBackground
```
**Kritischer Pfad bis App-Shell** = HTML + client.js-Download + `auth/session`-RTT + **komplette** `app/start`-Serverzeit (inkl. Doppel-200-Read, doppeltem N+1, ggf. LLM ≤12s). **Kein Zwischenrendering.**

---

## 5. Bewertung: Kann die Shell unabhängig sofort erscheinen?

**Heute: Nein — hartes globales Warten.** Ursachen:
1. `hideStartupSplash()` nur im finalen `render()` nach *allen* Daten.
2. Cache-First-Sofortrender ist **toter Code** (`loadCachedStartPayload`→`null`).
3. Zwei serielle Boot-Awaits (`auth/session` → `app/start`) vor jeglichem UI.
4. `/api/app/start` bündelt Profil + Briefing + **Lage (ggf. LLM)** + Tasks + Notes in **einer** Antwort; kein Teil-Streaming.

**Positiv (bereits vorhanden):** Splash sofort via Inline-CSS; Radar ohne Extra-Call aus dem Aggregat; Font lokal; SWR-Caching für Assets; Office/Parlament im Hintergrund; harte Timeouts + Watchdog gegen Dauer-Hänger.

**Zielbild-Lücken (Shell sofort; Lage/Radar/Helmut/Büro progressiv):**
- Shell + Navigation aus **Profil** (klein) rendern, bevor Briefing/Lage da sind.
- `activeProfile`/`getTasks`/`getUserNotes` via `Promise.all` überlappen.
- Doppelte `listKnowledgeObjects(200)` + doppelte N+1-Quellenladung zu **einer** gemeinsamen Ladung + Batch-`IN(...)`-Query zusammenfassen.
- **Lage-LLM aus dem Start-Kritikpfad nehmen** (nur Cache liefern; Generierung asynchron).
- `client.js` `defer`; da URLs bereits `?v=<sha>`-versioniert sind, `client.js`/`styles.css` auf `immutable` (wie `/assets/*`) → spart tägliche Revalidierung.

**Klasse:** Der App-Start blockiert die unmittelbare Nutzung (P1-Kandidat: „App-Start blockiert die unmittelbare Nutzung"). Kein Datenverlust, aber Zeit-bis-nutzbar hängt an der langsamsten Backend-Kette inkl. potenziellem LLM.

---

## 6. Reproduzierbare Kommandos (Betreiber, aus erlaubtem Netz)

```bash
# Timing kalt/warm (mehrfach für CDN-Hit/Miss):
for u in / /client.js /styles.css /sw.js; do
  for i in 1 2 3; do
    curl -sS -w "$u run$i time=%{time_total}s ttfb=%{time_starttransfer}s size=%{size_download} http=%{http_code}\n" \
      -o /dev/null "https://helmut-pilot.vercel.app$u"
  done
done
# Cache-/Encoding-Header:
curl -sSI https://helmut-pilot.vercel.app/
curl -sSI -H 'Accept-Encoding: br' https://helmut-pilot.vercel.app/client.js
# App-Start (braucht Session-Cookie; ohne → 401):
curl -sS -w "\ntime=%{time_total}s size=%{size_download} http=%{http_code}\n" \
  -H 'Cookie: <session>' -o /tmp/start.json "https://helmut-pilot.vercel.app/api/app/start"
wc -c /tmp/start.json
```

---

## 7. Priorisierte Ursachen (App-Start)

1. **P1 — Globales Warten statt progressiv:** Splash bis alle Daten; toter Cache-First-Render; zwei serielle Boot-Awaits.
2. **P1 — Lage-LLM im Start-Kritikpfad** (12s-Timeout kann Lage nullen; koppelt an `lage.md`).
3. **P2 — Doppelter KO-Load + doppelter N+1-Quellen-Load** pro Start (Serverzeit).
4. **P3 — Asset-Caching** (`client.js`/`styles.css` `max-age=86400` statt `immutable` trotz `?v=<sha>`); `client.js` ohne `defer`.

**Grenzen / VERMUTUNG:** Ohne Live-Timing (egress-blockiert) sind absolute Zeit-bis-sichtbar-Werte nicht gemessen; die Rangfolge der Verlustpunkte ist aus dem deterministischen Code-Pfad abgeleitet. Payload-Größe geschätzt (401-Gate).
