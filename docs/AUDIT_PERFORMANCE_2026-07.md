# Helmut – Performance-, Kosten- und Skalierungs-Audit

**Rolle:** Performance Engineer / SRE / Infrastructure Engineer
**Datum:** 2026-07-04
**Scope:** Response Time, Bundle Size, Datenbank/Supabase, GPT-Kosten, Caching, Cron Jobs,
Duplicate Requests, Memory/CPU, API-Kosten, Multitenancy, Vercel Functions, Cold Starts,
Lazy Loading, Rendering, Source Engine, Knowledge Engine, Briefing-Pipeline.
**Ziel-Metrik:** 100 Abgeordnete gleichzeitig bedienen, ohne dass Kosten explodieren oder
die App spürbar langsamer wird.
**Ausgangspunkt:** `docs/AUDIT_DATENMOTOR_2026-07.md` (2026-07-01, CTO/Architektur-Perspektive)
und `docs/cutover-strategy.md` (2026-07-02, geplanter V3-Cutover). Dieses Dokument prüft,
was seither tatsächlich im Code gelandet ist, und ergänzt es um die Performance-/Kosten-Achse.
**Modus:** Analyse + gezielte, sicherheitsarme Fixes. Größere Architekturarbeiten (Blob→Relational,
Queue/Worker, RLS-Policies) sind **nicht** Teil dieses Sprints, sondern unten priorisiert für den
nächsten.

---

## 1. Wichtigste Erkenntnis zuerst

Die kritischste Einschränkung für "100 Abgeordnete gleichzeitig" ist **keine Performance-Frage,
sondern eine funktionale**: Alle Cron-Jobs (`crawl`, `morning-briefing`, `pipeline`, `lage-check`,
`health-report`) lösen aktuell fest **einen einzigen `politicianId`** auf (`cemInceProfile.id`,
`server.js:229-245`). Bei 100 angelegten Mandaten würden 99 davon **nie** ein automatisches
Briefing bekommen – nicht langsamer, sondern gar keins. Die einzige Ausnahme ist
`/api/cron/lage-briefing`, die bereits über alle Profile loopt, dabei aber seriell in einer
`maxDuration:300s`-Funktion läuft (≈20s pro Mandat) und bei ca. 15 Mandaten am Zeitbudget zerschellen
würde, mit stillem Ausfall für alle danach in der Iteration.

**Das heißt:** Bevor Performance-Feintuning überhaupt relevant wird, braucht es einen echten
Multi-Tenant-Cron-Fanout (Abschnitt 6, P1). Alles andere in diesem Dokument optimiert Kosten/Latenz
für ein System, das strukturell noch für genau einen Mandanten läuft.

---

## 2. Was seit dem 1. Juli echt behoben wurde

Der Juli-Audit hat mehrere P1-Risiken benannt. Stand heute:

| Juli-Befund | Status heute | Beleg |
|---|---|---|
| "KI-Kosten komplett unüberwacht" | **Behoben** | `usage`-Block wird gelesen und geloggt (`ai.js`, `logLlmUsage`), aggregiert pro Mandat/Tag (`storage.js: getLlmUsageToday`), Admin-Dashboards zeigen Kosten in USD/EUR |
| "Kein Pipeline-Locking" | **Großteils behoben** | `acquirePipelineLock`/`releasePipelineLock` pro Mandat (`storage.js:498-525`), genutzt von Crawl, Briefing, Lage-Briefing |
| Personalisierung "auf Cem Ince hartverdrahtet" | **Teilweise behoben** | committee-Score-92 ist jetzt profilbasiert (`personalization.js:461-462`), neue Mandate bekommen neutrale Defaults (`scheduler.js: neutralProfileDefaults`) |
| "8 relationale Tabellen komplett ungenutzt" | **Teilweise behoben** | Für den neuen Lage-Tab und Office-Feature nutzt ein echter V3-Pfad (`knowledge_objects`, `matching_results`, `office_outputs`, …) echte Tabellen mit sinnvollen Indizes und einer pgvector-Ähnlichkeitssuche |
| "Kein Request-/Kosten-Dashboard" | **Behoben** | `/api/admin/stats/costs`, `/api/admin/stats/crawl`, Admin-Dashboard mit Kosten pro Nutzer |

Das ist echter Fortschritt und sollte nicht kleingeredet werden. Gleichzeitig gilt: Der
**Haupt-Lesepfad** (`/api/app/start`, Helmut-Tab, Briefing, Radar) läuft weiterhin zu 100 % über
den einen JSON-Blob (`helmut_store`), und die neue V3-„Understanding Engine" – die genau das
Kostenproblem bei mehreren Mandanten strukturell lösen würde (einmal verstehen, viele Male günstig
matchen) – ist vollständig hinter Flags deaktiviert (`HELMUT_V3_STORE`, `HELMUT_V3_MATCHING`,
`HELMUT_V3_LAZY_UNDERSTANDING` – alle in `.env.example` leer/aus).

---

## 3. In diesem Sprint behoben (Code-Änderungen, dieser Branch)

Ausgewählt nach Kriterium: sicher, isoliert, hoher Wert, ohne Produktionsdaten oder laufenden
Pilotbetrieb zu gefährden. Alle Änderungen sind lokal getestet (Syntax-Check, laufender lokaler
Server, isolierter Node-Test für die neue Budget-Logik, Playwright-Check für die Typewriter-Änderung,
sowie die bestehende Testsuite: `test:p1` 177/177, `test:goldset`, `test:lage` alle grün — siehe
Abschnitt 8).

1. **GitHub-Watchdog verdoppelte täglich Crawl+KI-Kosten** (`.github/workflows/briefing-watchdog.yml`).
   Er rief `/api/cron/pipeline` bedingungslos um 05:30 UTC auf, unabhängig davon, ob Vercels eigener
   05:00-Cron schon erfolgreich lief – von zwei unabhängigen Analysen bestätigt. **Fix:** Vorab-Check
   via `/api/ops/status`; ist das Briefing bereits < 6h alt, wird der teure Lauf übersprungen. Jeder
   Fehler beim Vorab-Check fällt sicher auf das alte Verhalten zurück (Backstop-Eigenschaft bleibt
   erhalten).
2. **Hartkodierter "cem ince"-Vergleich** in `temperSingleSourceMediaDecisions`
   (`lib/helmut/scheduler.js`) prüfte Personennennung per Literal-String statt profilbasiert – jeder
   andere Mandant hätte diese Einzelquellen-Ausnahme nie bekommen. Jetzt profilbasiert
   (`mentionsProfileName`), analog zum bereits korrekten Pendant `speaksAboutUser`.
3. **Crawl-Lock-TTL (15 min) lag über der Funktions-`maxDuration` (300s/5 min)**
   (`lib/helmut/scheduler.js: runSourceCrawl`). Ein von Vercel gekillter Lauf blockierte dadurch jeden
   Retry bis zu 10 Minuten länger als nötig. Jetzt auf 4 Minuten gesenkt, analog zum bereits korrekt
   bemessenen Briefing-Lock.
4. **Kein Connection-Reuse für OpenAI/Azure-Calls** (`lib/helmut/ai.js`): jeder LLM-Call zahlte einen
   vollen TCP/TLS-Handshake. Ein wiederverwendbarer `https.Agent({keepAlive:true})` reduziert Latenz
   spürbar bei den ohnehin schon sequenziellen Calls pro Briefing.
5. **Zwei LLM-Endpunkte ohne Tagesbudget** (`generateCommunicationDraft`, `assessParliamentaryItem`
   in `lib/helmut/ai.js`): Sie hatten nur einen In-Memory-Rate-Limiter (übersteht keinen Cold-Start,
   kein Tages-Deckel). Jetzt dasselbe `canSpendLlm`-Gate wie der Briefing-Pfad – fail-closed auf
   Regel-Fallback statt unbegrenzter KI-Kosten pro Mandat.
6. **Service-Worker-Cache-Busting war faktisch inaktiv** (`server.js`): Die statische `index.html`
   im Repo trug ein hartkodiertes `?v=20260701-pwa2`, das seit 3 Deploys nicht mehr erhöht wurde –
   obwohl der Code bereits einen `ASSET_VERSION`-Mechanismus (aus `VERCEL_GIT_COMMIT_SHA` abgeleitet)
   dafür vorsah. Der wurde aber nie erreicht, weil `fs.readFile` die statische Datei erfolgreich las,
   bevor die dynamische, versionsbewusste `indexHtml()` als Fallback zum Zug kam. **Fix:** Die
   App-Entry-Route erzeugt `index.html` jetzt immer dynamisch mit aktuellem `ASSET_VERSION` – jeder
   Deploy erhält automatisch eine neue Asset-Version, installierte PWA-Clients bleiben nicht mehr auf
   altem `client.js`/`styles.css` hängen.
7. **Typewriter-Animation rief 29×/Sekunde ein komplettes App-Rerendering auf**
   (`client.js: startHelmutTyping`): jeder Tick (34ms) löste den globalen `render()` aus – kompletter
   `innerHTML`-Rebuild + Listener-Rebind der gesamten App nur für einen Tippeffekt. Realer
   Jank-/Akku-Kostenfaktor auf Mobilgeräten, betraf jeden Nutzer schon heute, nicht erst bei
   Skalierung. **Fix:** Jeder Tick patcht nur noch `textContent` eines dedizierten `<span
   id="helmutTypingText">`; `render()` läuft nur noch einmal beim Start und einmal beim Abschluss der
   Animation. Mit Playwright verifiziert: Text baut sich weiter korrekt auf, der Cursor-Sibling bleibt
   erhalten, keine neuen Konsolenfehler.

### Bewusst NICHT verändert (untersucht, aber zurückgestellt)

- **`loadCachedStartPayload`/`saveCachedStartPayload` (`client.js`)** sind aktive No-Ops (löschen nur
  `localStorage`, geben `null`/nichts zurück), `appStartCacheMaxAgeMs = 0`. Das sieht nach einer
  bewussten Entscheidung aus (kein Instant-Render aus potenziell veraltetem Cache in einem
  politischen Tool, in dem veraltete "Sofort reagieren"-Entscheidungen ein Vertrauensproblem wären –
  vgl. den Juli-Audit-Punkt zu fabrizierten/veralteten Inhalten). Dieser Code kam bereits so mit dem
  initialen V3-Merge (`7ec017e`, 2. Juli). **Empfehlung:** nicht ungeprüft reaktivieren – das ist eine
  Produktentscheidung (Ladezeit vs. Frische-Garantie), keine reine Performance-Frage.
- **Lage-Tab lädt Quellen pro Vorgang parallel** (`lib/helmut/lage.js: loadSourcesForVorgaenge`, bis
  zu ~12 Supabase-Calls pro App-Open). Das ist **bereits bewusst parallelisiert** (nicht sequenziell,
  wie ein erster Rechercheeindruck nahelegte), mit explizitem Kommentar zur Begründung (ein
  langsamer Call soll nicht alle anderen blockieren). Eine Bündelung in einen einzigen
  `vorgang_id=in.(...)`-Query wäre trotzdem ein sauberer Zusatzgewinn (weniger HTTP-Overhead), aber
  kein akuter Bug – daher hier nur als P2-Empfehlung (Abschnitt 6), nicht umgesetzt.

---

## 4. Cron-Jobs, Crawler, Pipeline-Concurrency

- **Verbessert seit Juli:** Pipeline-Locking existiert jetzt (`acquirePipelineLock`), korrekt
  per-Mandat benannt. Ein globaler Lock für die künftige Understanding-Engine ist verdrahtet, aber
  standardmäßig ein No-Op (`HELMUT_UNDERSTANDING_LOCK` nicht gesetzt).
- **Bestätigt unverändert:** Crawler-Concurrency weiterhin 20, 7s Timeout, praktisch keine Retries
  (nur ein enger 2-Versuch-Retry für die Google-News-`batchexecute`-Auflösung). Skaliert nicht mit
  mehr Quellenvielfalt/-frequenz.
- **Neu entdeckt:** Der GitHub-Actions-Watchdog verdoppelte täglich bedingungslos den kompletten
  Pipeline-Lauf (behoben, siehe Abschnitt 3.1).
- **Serielle Pipeline-Iteration:** `/api/cron/lage-briefing` loopt `for (const p of profiles)` mit
  einem KI-Call pro Mandat (~20s Timeout) in einer 300s-Funktion → reißt bei ~15 Mandaten, ohne
  Chunking/Resume. Die anderen Cron-Jobs (crawl/briefing/pipeline/lage-check) haben aktuell **gar
  keine** Mandats-Schleife (siehe Abschnitt 1) – das ist strukturell vorrangiger als dieses
  Timeout-Problem.

---

## 5. Datenbank/Supabase

- **Hot-Path unverändert kritisch:** `/api/app/start`, `saveProfile`, `saveRawItems` und die meiste
  Personalisierung lesen/schreiben weiterhin das **komplette** `main`-JSON-Dokument (alle Profile,
  bis zu 600 `rawItems`, ~500 Quellen, `crawlRuns`) als eine Supabase-Zeile – Read-Modify-Write ohne
  Transaktion/optimistisches Locking. Bei 100 gleichzeitig aktiven Mandanten ist das der
  wahrscheinlichste Ort für Lost-Updates und Latenz-Explosion (unverändert gegenüber der
  Juli-Einschätzung).
- **Ironischer Nebeneffekt zweier Juli-Fixes:** Sowohl das neue Pipeline-Locking als auch das neue
  LLM-Kosten-Logging schreiben beide auf **dieselbe** geteilte Auth-Store-Zeile (Read-Modify-Write,
  kein Lock). Bei 100 gleichzeitigen Mandanten können sich Lock-Acquisition und Cost-Logging
  gegenseitig durch Lost-Updates aushebeln – potenziell sowohl Kosten unterzählen als auch den Lock
  wirkungslos machen. Die dafür bereits im Schema vorgesehenen echten Tabellen (`llm_usage`,
  `pipeline_locks`) existieren, werden aber von keinem Code-Pfad genutzt.
- **Echter Fortschritt:** Lage-Tab und Office-Feature nutzen einen genuinen relationalen V3-Pfad mit
  sinnvollen Indizes (`vorgang_id`, `user_id,created_at`, ivfflat-Vektorindex) – kein Aspirations-Code
  mehr, sondern lastgetragen für diese zwei Features.

---

## 6. Priorisierte Empfehlungen für "100 Abgeordnete gleichzeitig"

### P1 — Muss vor echtem Mandats-Wachstum gelöst sein

1. **Multi-Tenant-Cron-Fanout bauen.** Crawl/Briefing/Pipeline/Lage-Check müssen über alle aktiven
   Mandate iterieren (oder besser: als Queue/Worker statt Schleife in einer 300s-Web-Funktion). Ohne
   das bekommt Mandant #2 nie ein automatisches Briefing – unabhängig von jeder Performance-Frage.
2. **JSON-Blob-Contention auflösen**, mindestens für den `main`-Store (Profile, Quellen, `rawItems`).
   Der V3-Pfad hat bereits gezeigt, dass echte relationale Tabellen + Indizes funktionieren (Lage,
   Office) – dasselbe Muster auf den Hot-Path von `/api/app/start` übertragen.
3. **Lock- und Kosten-Logging von der geteilten Blob-Zeile lösen**, auf die bereits im Schema
   vorhandenen `pipeline_locks`/`llm_usage`-Tabellen umstellen (echte atomare Inserts/Upserts statt
   Read-Modify-Write).
4. **RLS scharf schalten oder ehrlich als "nicht vorhanden" behandeln.** Aktuell ist RLS auf allen
   Tabellen aktiviert, aber es existiert keine einzige `CREATE POLICY` – der Server nutzt ausschließlich
   den Service-Role-Key und umgeht RLS vollständig. Mandanten-Trennung ist weiterhin rein applikativ.
5. **V3-„Understanding Engine" aktivieren** (`HELMUT_V3_STORE`, `HELMUT_V3_MATCHING`,
   `HELMUT_V3_LAZY_UNDERSTANDING`). Sie ist bereits so gebaut, dass geteilte Artikel nur **einmal**
   global per KI verstanden und pro Mandant günstig (ohne KI-Call) gematcht werden – exakt der
   Mechanismus, der KI-Kosten bei 100 Mandanten von linear auf nahezu konstant bringt. Aktuell
   inaktiv, obwohl die Implementierung laut Testsuite (`test:p1`, 177/177) bereits solide ist.

### P2 — Wichtig, aber nicht blockierend

6. Budget-Enforcement vereinheitlichen: aktuell teilt sich ein einziger
   `HELMUT_MAX_LLM_CALLS_PER_DAY`-Wert die Rolle als Pro-Mandat-Deckel UND als globaler Deckel für die
   (noch inaktiven) geteilten Understanding-Calls – getrennte Knobs vorsehen, bevor V3 live geht.
7. Crawler-Retries mit Backoff ergänzen (aktuell keine, außer der schmale Google-News-Sonderfall).
8. Lage-Tab-Quellenladen auf einen gebündelten `IN`-Query umstellen (aktuell N parallele Calls,
   funktional korrekt, aber mehr Overhead als nötig).
9. `client.js`/`styles.css` vor Auslieferung minifizieren (aktuell 375 KB/237 KB unminifizierter
   Rohquelltext ohne Build-Schritt) – mechanischer Gewinn ohne Architekturänderung.
10. `withTimeout` (Promise.race) bricht hängende Calls nicht wirklich ab – ein getimeoutetes
    Lage-Briefing läuft serverseitig weiter und verbrennt Compute, ohne dass der Client davon
    profitiert.

### P3 — Später

11. Mega-Serverless-Funktion (User-Traffic + alle Crons in einer Funktion) in separate Funktionen
    aufteilen, sobald Cron-Fanout (P1.1) steht.
12. Rest-Hardcode `"cem ince"` an einer weiteren Stelle bereinigen, falls beim P1-Umbau noch mehr
    auftauchen (dieser Sprint hat den bekannten Fall in `temperSingleSourceMediaDecisions` behoben).
13. CSS render-blocking entschärfen (kein Preload/kritisches CSS-Splitting) – spürbar erst bei
    schlechten Mobilverbindungen.

---

## 7. Bewusst nicht in diesem Sprint angefasst

Diese Punkte sind bekannt, aber zu groß/riskant für isolierte Fixes ohne dedizierte Planung und ohne
Staging-Umgebung mit echten Daten:

- Umbau des JSON-Blob-Storage auf den relationalen Pfad für den Haupt-Lesepfad (P1.2).
- Echter Queue/Worker statt Cron-Schleife in einer Web-Funktion (P1.1).
- RLS-Policies definieren und den Service-Role-Key-Bypass auflösen (P1.4).
- Aktivierung der V3-Flags in Produktion (P1.5) – erfordert Monitoring/Canary-Vorgehen wie in
  `docs/cutover-strategy.md` beschrieben, nicht einen stillen Flag-Flip.

---

## 8. Verifikation

- `node -c` auf allen vier geänderten JS-Dateien (server.js, client.js, scheduler.js, ai.js): OK.
- Lokaler Server (`node server.js`) startet und beantwortet `/`, `/api/ops/status`, `/api/app/start`
  korrekt; `index.html` liefert jetzt den dynamisch versionierten `ASSET_VERSION` statt der
  veralteten statischen Version.
- Neue Budget-Gates isoliert getestet (Node-Skript, ohne Netzwerkzugriff): `canSpendLlm` liefert bei
  erschöpftem Tagesbudget `allowed:false`; `generateCommunicationDraft` und `assessParliamentaryItem`
  liefern daraufhin sofort (< 2ms) den Regel-Fallback statt einen echten API-Call zu versuchen.
- Typewriter-Fix mit Playwright im Browser geprüft: Text baut sich über mehrere Ticks korrekt auf,
  der Cursor bleibt als eigenständiges Element erhalten, keine neuen Konsolenfehler.
- Bestehende Testsuite: `npm run test:p1` (177/177), `npm run test:goldset` (7/7 Fälle),
  `npm run test:lage` (34/34 Assertions) — alle grün nach den Änderungen.
- `npm run test:contract` zeigt 1 Fehlschlag (stiller Feldwechsel zwischen der gespeicherten
  Contract-Snapshot-Baseline und dem aktuellen `/api/app/start`). **Vorab geprüft:** derselbe
  Fehlschlag tritt identisch auf dem unveränderten Code auf (per `git stash` verifiziert) – er ist
  nicht durch diesen Sprint verursacht, sondern eine vorbestehende Diskrepanz zwischen der
  gespeicherten Baseline und dem aktuellen, in dieser Sandbox leeren lokalen Store. Nicht Teil dieses
  Sprints; zur Kenntnisnahme für den nächsten Engine-Sprint.
- `npm run smoke` läuft gegen `https://helmut-pilot.vercel.app` per Default und ist in dieser
  Sandbox ohne Netzwerkzugriff auf die echte Produktions-URL nicht aussagekräftig auszuführen.
