# Helmut Datenmotor — Kritischer Audit (Teil I: Auditbericht)

> **⚠️ Dies ist ein AUDITBERICHT, noch KEIN endgültiges Betriebsdokument.**
> Er beschreibt den *geprüften Ist-Zustand* des Datenmotors und dient als
> verbindliche Grundlage für die Umsetzung im zweiten Thread. Das endgültige
> Betriebsdokument (`docs/helmut_datenmotor_betriebslogik.md`) entsteht erst
> **nach** der Umsetzung der P0/P1-Härtungen.

| | |
|---|---|
| **Stand** | 2026-07-16 |
| **Geprüfter Commit** | `427295c` · `main` = Production |
| **Umgebung** | Vercel `fra1` · Supabase `eu-west-1` |
| **KI-Modell** | Azure OpenAI `gpt-5-mini` |
| **Erstellt auf Branch** | `claude/helmut-engine-audit-ifkv6r` · Modell: Opus |
| **Vertraulichkeit** | Intern · Helmut · Nohut |

**Methode:** Prüfung gegen echten Code (HEAD = Production), gegen die
Production-Datenbank (Supabase `ddckuvvpcytqbyfmbvie`), gegen Vercel-Deployments
und gegen die Git-/PR-Historie. Jede Aussage ist mit `Datei:Zeile`, DB-Abfrage
oder Deployment-Beleg unterlegt. **Laufzeiten sind gemessen, nicht geschätzt; wo
keine Messung existiert, steht das ausdrücklich.** Es wurde nichts an Production,
Migrationen, Zeitplänen, Secrets oder Deployments geändert.

**Wichtiger Lesehinweis zur Belastbarkeit:** Dieser Bericht ersetzt ältere
Berichte (`docs/AUDIT_DATENMOTOR_2026-07.md` ist nachweislich veraltet, siehe
§11). Er wurde nicht aus Dokumentation abgeleitet, sondern aus Code + Live-Daten.

**Zugehöriger Umsetzungsplan:** `docs/helmut_datenmotor_umsetzungsplan.md`
(Teil II, Priorisierung P0–P3 + Gründerentscheidungen).
**Visuelle Fassung:** `docs/visual/helmut_datenmotor_audit.pdf` /
`docs/visual/helmut_datenmotor_audit.html`.

---

## Inhalt

**Teil I · Auditbericht**
0. Kurzfassung (Abschlussurteil)
1. Geprüfter Stand (Phase 1 — Audit-Snapshot)
2. Geprüfte / nicht prüfbare Bereiche
3. Architektur-Überblick: das duale Datenmodell
4. Vollständiger Prozesskatalog (Phase 3 — Steckbriefe)
5. Zeitsteuerung (Phase 4)
6. Vollständiger Datenfluss (Phase 2) — Weg eines Dokuments
7. Dokumentlebenszyklus (Phase 5)
8. Laufzeitwerte (Phase 3) — vorhanden vs. fehlend
9. Fehler & Überwachung (Phase 6)
10. Datenqualität & Nachvollziehbarkeit (Phase 7)
11. Ungenutzte Dateien / toter Code (Phase 8)
12. Landtagsfähigkeit (Phase 9) — Berlin/Brandenburg
13. Risiken (priorisiert)
14. Offene Gründerentscheidungen

---

## 0. Kurzfassung (Abschlussurteil)

1. **Was geprüft wurde:** Kompletter Datenmotor — Crawling, Speicherung,
   Textverständnis (KI), Klassifikation, Matching/Relevanz, Entscheidungen,
   Briefing/Lage/Radar-Ausgabe, alle geplanten Prozesse (9 Vercel-Crons + 1
   GitHub-Action), Fehlerbehandlung, Datenqualität, toter Code,
   Landtagsfähigkeit, Env/Flags/Secrets. Belege aus Code und Production-DB.

2. **Was nachgewiesen funktioniert:** Der Crawl läuft stabil (145 Quellen,
   100 % Quellen-Erfolg über 20 protokollierte Läufe, 0 Laufzeitfehler);
   KI-Verständnis produziert Wissensobjekte (Azure `gpt-5-mini`, Ø 7,9 s/Call,
   236/256 erfolgreich); das Briefing wird bei jedem Aufruf deterministisch
   (0 KI) aus verstandenen Wissensobjekten gebaut und funktioniert für alle drei
   Testprofile; Quellen-Cutover auf die relationale Architektur ist live;
   Kostenkontrolle (Tagesdeckel, atomare Reservierung) ist aktiv; KI-Gesamtkosten
   seit 01.07. ≈ $0,92.

3. **Was NICHT nachgewiesen ist:** Keine einzige persistierte Laufzeit für
   Crawl, Pipeline, Lage-Check, Understanding-Batch, Briefing- oder Radar-Aufbau
   (nur ephemere Vercel-Logs). Der tatsächliche Prod-Wert zentraler
   Env-Variablen (`HELMUT_MAX_LLM_CALLS_PER_DAY`, `HELMUT_V3_MATCHING`,
   `HELMUT_AUTH_MODE` u. a.) ist aus der Arbeitsumgebung nicht lesbar
   (Vercel-„sensitive"). Ob die Blob-Daten `sources`/`rawItems` eingefroren sind,
   ist nur datenseitig, nicht codeseitig belegbar.

4. **Kritische Risiken:**
   - (a) 1,2-MB-Monolith-Blob `helmut_store` läuft wiederkehrend in
     10-s-Timeouts → ein Timeout kann einen ganzen Crawl-Save verlieren;
   - (b) Pipeline-Lock ist fail-open + nicht-atomar → Doppelverarbeitung/doppelte
     KI-Kosten möglich;
   - (c) kein Pipeline-Fehler landet je in `systemErrors` (kein `lib/helmut`-Modul
     ruft `recordSystemError`) → Motorfehler sind nur in flüchtigen Logs sichtbar;
   - (d) der Google-News-Degradations-Alarm ist ein toter Monitor (liest ein
     Feld, das `compactStore` beim Speichern entfernt);
   - (e) 247/314 Wissensobjekte ohne Ebene/Feature-Vektor (Altbestand nie
     gebackfillt) → Relevanz-Matching wirkt nur auf ~21 % des Bestands.

5. **Welche Messungen fehlen:** Crawl-/Pipeline-/Lage-/Understanding-/Briefing-
   Dauer; Pro-Quelle-„zuletzt erfolgreich"; Understanding-Durchsatz je Lauf
   (persistiert); Klassifikations-/Embedding-Abdeckung als laufende Kennzahl;
   KI-Budget-Ausschöpfung als Alarm; relational-vs-Fallback-Quellenpfad je Lauf;
   Alarm-Zustell-Bestätigung.

6. **Bundestagspilot (überwacht) geeignet?** *Bedingt ja.* Der fachliche Kern
   erzeugt nachweislich Vorgänge und Briefings. Für einen *überwachten* Piloten
   fehlen aber die Beobachtbarkeit (Laufzeiten, Pipeline-Fehler-Persistenz) und
   zwei Härtungen (Blob-Timeout-Robustheit, atomarer Lock). Diese sind P0/P1 und
   klein.

7. **Kern strukturell landtagsfähig?** *Ja im Kern, nein ohne gezielten Umbau.*
   Die relationale Quellenschicht, die Geografie-/Ebenen-Modelle (5 Ebenen,
   `land`/`kommune` real erzeugt), `parliamentTypeOf`,
   `LANDESPAKET_BY_BUNDESLAND` sind mehr-ebenen-fähig. Berlin/Brandenburg ist
   aber dreifach hart gesperrt und braucht zwei Codeänderungen (Landesmodul-Gate
   entfernen + PARDOK-Live-Modus bauen) plus Datenaktivierung plus
   Ebenen-Default-Fix. Kein Neubau, aber auch kein reines „Datenflippen".

8. **Welche Entscheidungen benötigt werden:** siehe §14 (Prod-Env-Werte
   bestätigen, Backfill freigeben, Blob-Migration terminieren, Landtag-Cutover-
   Umfang, Scoring scharfschalten, Persistenz von decisions/matching,
   Monitoring-Zweitkanal).

9. **Wo Auditbericht & Umsetzungsplan liegen:** dieses Dokument +
   `docs/helmut_datenmotor_umsetzungsplan.md`.

---

## 1. Geprüfter Stand (Phase 1 — Audit-Snapshot)

| Punkt | Wert | Beleg |
|---|---|---|
| Aktueller Branch | `claude/helmut-engine-audit-ifkv6r` | `git branch --show-current` |
| Aktueller Commit (HEAD) | `427295c` „Querformat-Sperre … (#94)" (2026-07-16 09:02 +0200) | `git log -1` |
| Production-Commit | `427295c` — Vercel `dpl_EaQJBYHpWoWw75fYUva5J9XtVo4C`, target=production, READY, branch `main` | Vercel list_deployments |
| Lokal == Production? | Ja. HEAD = Prod-Commit. Working tree sauber (keine lokalen Änderungen). | `git status --short` (leer) |
| GitHub `main` HEAD | `427295c` (verifiziert) | GitHub list_commits sha=main |
| ⚠️ Lokaler `origin/main`-Ref | `fce2e65` (2026-07-10, PR #25) — veraltetes Web-Clone-Artefakt, kein Merge-Base zu HEAD, HEAD hat 3 Wurzel-Commits. Nicht die Prod-Linie. | `git merge-base origin/main HEAD` → keine; `git rev-list --max-parents=0 HEAD` → 3 |
| Offene Pull Requests | #88 (Draft, Monitoring-Stack inkl. `durationMs`-Persistenz, **Basis = `claude/happy-allen-g5q1ua`, nicht `main`**); #70 (Quellen-Audit-Doku → `main`); #8 (White-Mode CSS → `main`) | GitHub list_pull_requests |
| Umgebungen | Vercel (Projekt `helmut-pilot`, Team „Nohut", Region `fra1`, 1 Lambda `api/index.js`→`server.js`, maxDuration 300 s); Supabase (Projekt `ddckuvvpcytqbyfmbvie`, `eu-west-1`, PostgreSQL 17.6, ACTIVE_HEALTHY, RLS auf allen Tabellen aktiv) | `vercel.json`; Supabase list_projects/list_tables |
| Relevante Datenbanken | Zwei Datenwelten (siehe §3): Legacy-Blob `helmut_store` (4 Zeilen) + relationale „Quellenarchitektur" (~38 Tabellen) | Supabase list_tables |
| Aktive Serverfunktionen | Genau eine Lambda; `api/index.js` = `module.exports = require("../server")` | `api/index.js` |
| Geplante Prozesse | 9 Vercel-Crons (UTC) + 1 geplante GitHub-Action (`briefing-watchdog` 05:30 UTC) | `vercel.json`, `.github/workflows/` |
| Externe Dienste | Azure OpenAI (`gpt-5-mini`), Supabase, Google News (Crawl + URL-Decode), Bundestag-DIP-API, CallMeBot-WhatsApp, Monitoring-Webhook, Web-Push (VAPID) | §9, `.env.example` |
| Verwendete KI-Modelle | Azure OpenAI `gpt-5-mini` (685 echte Calls); OpenAI `gpt-4.1` = Notfall-Fallback, in Prod durch Azure-Vorrang inaktiv | DB `llmUsage.model`; `ai.js:18-31`, `.env.example:1-8` |
| Aktive Quellenpakete | 7 `source_packages` (5 aktiv Bund-Basis, 2 `prepared`: berlin-basis/brandenburg-basis); 163 `retrieval_paths` (145 Bund + 18 BE/BB inaktiv) | DB; `05-quellenarchitektur`-Analyse |
| Aktive Nutzerprofile | 3: `cem-ince` (Pilot), `angela-merkel`, `james-brown` (Testpersonen) | DB `helmut_store`-Keys, `briefings`, `mandate_profiles` (2) |
| Feature-Flags (managed) | `HELMUT_UNDERSTANDING_GATE=shadow`, `HELMUT_PARDOK_DISPATCH=shadow`, `HELMUT_SOURCE_MODE=on` | `helmut-flags.json`; Allowlist `flags.js:31-35` |
| Unterschied lokal ↔ Production | Keiner auf Code-Ebene (HEAD = Prod). Prod-Env-Werte sind „sensitive" und nicht einsehbar → als Annahmen markiert (§9). | — |

**Applizierte DB-Migrationen (13):** u. a. `20260714_ko_classification`,
`20260717_llm_budget_reservation`, `source_architecture`. Verifiziert
angewendet: Spalte `knowledge_objects.decision_level` existiert; Funktion
`helmut_reserve_llm_call(p_day,p_scope,p_max)` existiert; `llm_budget_counters`
hat Zeilen. → Die im Code als „freigabepflichtig" markierten Migrationen sind in
Production real angewendet (das entkräftet die Hypothese eines stillen
KO-Schreibfehlers wegen fehlender Spalte).

---

## 2. Geprüfte / nicht prüfbare Bereiche

**Geprüft (belegt):** Cron-Verdrahtung & Autorisierung; Crawler (Fetch,
RSS/HTML, Google-News-Decode, PARDOK-Streaming); Dedup (2 Mechanismen);
Storage-Layer inkl. `compactStore`/Retention/Locks; Understanding (Clustering,
KI-Call, Schema, Klassifikation, Feature-Vektor, Gate, Budget);
Matching/Decisions/Scoring; Briefing-/Lage-/Radar-Ausgabe; Dokumentlebenszyklus;
Fehlerpfade & Monitoring; Landtag-/Cem-Hardcoding; toter Code; Env/Flags/Secrets.
Datenseitig: Crawl-Läufe, LLM-Nutzung, Gate-Telemetrie, Wissensobjekte,
Rohdokumente, Briefings, Decisions, Matching, Systemfehler.

**Nicht prüfbar / ungeklärt (ausdrücklich markiert):**

- **Prod-Env-Werte (Vercel „sensitive"):** `HELMUT_MAX_LLM_CALLS_PER_DAY`
  (50 vs. 100?), `HELMUT_V3_MATCHING`, `HELMUT_V3_LAZY_UNDERSTANDING`,
  `HELMUT_LLM_BUDGET_FAIL_CLOSED`, `HELMUT_UNDERSTANDING_LOCK`,
  `HELMUT_LLM_RESERVE_UNDERSTANDING`, `HELMUT_AUTH_MODE`, `HELMUT_DIP_PRIMARY`,
  `HELMUT_MORNING_PUSH_ALL_PROFILES`, `HELMUT_MONITORING_WEBHOOK_URL`. → aus
  Verhalten/Datenbestand abgeleitet, entsprechend gekennzeichnet.
- **Ephemere Laufzeiten:** Vercel-Runtime-Logs decken nur die letzten 24 h ab;
  historische Cron-Laufzeiten sind nirgends persistiert → nicht rekonstruierbar
  (§8).
- **Einfrier-Status der Blob-Daten** (`sources`=144, `rawItems`=466): Code
  liest/schreibt sie weiter — ob die Daten stillstehen, ist datenseitig zu
  klären, nicht codeseitig.
- **PARDOK-Shadow-Ertrag auf Production:** Dateiablage ist auf Vercel read-only
  → keine persistente BE/BB-Shadow-Messung.

---

## 3. Architektur-Überblick: das duale Datenmodell

Der Motor fährt **zwei parallele, nicht synchron gehaltene Speicher:**

**(A) Legacy-JSON-Blob `helmut_store` (4 Zeilen, Supabase):**

| id | Größe | wichtige Keys |
|---|---|---|
| `main` | 1,24 MB | `crawlRuns`, `systemErrors`, `briefings`, `politicalItems`, `sources` (144), `rawItems` (466), `lageChecks`, `pipelineDebugReports` |
| `main-p-cem-ince` | 734 KB | per-Nutzer: `briefings`, `communicationDrafts`, `politicalItems` … |
| `main-auth` | 85 KB | `llmUsage` (1878), `pipelineLocks`, `systemErrors` (59), `sourceModeShadowLastRun`, `sessions`, `users` |
| `main-p-james-brown` | 364 B | quasi leer (Testpersona) |

→ Bei jedem Schreiben läuft `compactStore` (`storage.js:2118`) und kappt hart
(`crawlRuns` ≤ 30, zusätzlich `saveCrawlRun` ≤ 20; `rawItems` ≤ 600;
`systemErrors` ≤ 300; `llmUsage` ≤ 5000). Der 1,24-MB-Blob `main` ist die
dokumentierte Timeout-Quelle (§9).

**(B) Relationale „Quellenarchitektur" (seit Cutover `HELMUT_SOURCE_MODE=on`
die aktive Quellenwahrheit):**

| Gefüllt | Zeilen | Leer (angelegt, ungenutzt) |
|---|---|---|
| `raw_documents` | 5733 | `sources`, `political_items`, `llm_usage` (!), `topic_memory` |
| `knowledge_objects` | 314 | `interactions`, `office_outputs`, `ko_relations` |
| `document_findings` | 1463 | `electoral_districts`, `matching_weights` |
| `ko_document_links` | 1230 | `path_expected_topics`, `path_expected_entities` |
| `gate_shadow_events` | 4543 | `personalized_recommendations`, `daily_tasks` |
| `decisions` | 98 | `communication_drafts`, `user_notes`, `priority_changes` |
| `matching_results` | 38 | `pipeline_locks` (Locks liegen im Blob, nicht hier!) |
| `briefings` | 13 | `retrieval_paths` / `package_paths` 163/165 |
| `geographies` / `political_entities` / `publishers` | 50 / 73 / 64 | |

**Zentrale Wahrheit:** Die *Laufzeit-/Betriebsdaten* des Motors (Crawl-Läufe,
Kosten, Fehler, Locks) leben im Blob; die *Inhaltsdaten* (Dokumente,
Wissensobjekte, Fundstellen) leben relational. Das erklärt viele Diskrepanzen
unten (z. B. „savedItems" vs. echte neue Dokumente).

---

## 4. Vollständiger Prozesskatalog (Phase 3 — Steckbriefe)

**Zeiten:** Vercel-Crons sind fix in UTC. Berlin = UTC+2 (Sommer/CEST, aktuell)
bzw. UTC+1 (Winter/CET). Autorisierung aller Crons: `authorizeCron`
(`server.js:4774`) — fail-closed (kein `CRON_SECRET` → 503; falsch → 403;
Query-Secret nur wenn `HELMUT_ALLOW_QUERY_SECRETS=true`, Default aus).

### 4.1 `/api/cron/crawl` — Quellen-Crawl (Kernprozess)

- **Zweck:** Alle Profil-Quellen abrufen, Rohdokumente speichern,
  Understanding/Matching/Decisions anstoßen.
- **Ausführungsort/Datei/Funktion:** Vercel-Lambda → `server.js:711-714` →
  `scheduler.js:168` `runSourceCrawl(politicianId=cemInceProfile.id)`.
- **Auslöser/Startzeit/Zeitzone/Häufigkeit:** Vercel-Cron `0 4 * * *` und
  `0 20 * * *` (UTC) → 06:00 & 22:00 CEST (05:00 & 21:00 CET). 2×/Tag.
- **Politische Ebene / Mandant:** Bund; single-tenant — ohne Login fällt
  `politicianId` auf `cem-ince` (`server.js:306-308`; nur Admin-Bypass wählt
  anderes Mandat).
- **Tatsächliche Startzeiten (belegt, 20 Läufe 12.–16.07.):** planmäßig
  04:03/16:02/20:02 UTC; zusätzlich manuelle Läufe (07:26, 07:43, 08:33, 09:41,
  14:35) — Gründer-Trigger während Merge-Sessions.
- **Max. Laufzeit:** `/api/cron/crawl` hat keinen `withTimeout` → darf bis 300 s
  (Lambda-Deckel) laufen. `/api/cron/pipeline` (dieselbe Funktion) ist auf 280 s
  begrenzt.
- **Tatsächliche Laufzeit / Ø / Median / min / max:** **NICHT MESSBAR** — keine
  Dauer wird persistiert (§8). `compactStore` strippt `durationMs`
  (`storage.js:2124-2133`), und `saveCrawlRun` berechnet gar kein `durationMs`
  (`scheduler.js:283-309`).
- **Erfolgsquote / gefundene / neue / doppelte Dokumente (20 Läufe, DB):** 145
  Quellen geprüft, 100 % erfolgreich, 0 Fehler; `newCandidateItems` konstant
  exakt 1012 (= Kandidaten-Cap, kein echter Neuheitswert); `savedItems` 862–939
  (überzeichnet, siehe §7/§8). Echte Neuheit: nur 55 neue `raw_documents` in 24 h.
- **Folgeprozess:** eager-Understanding (KI), Lazy-Understanding-Vormerkung,
  Matching-Shadow, Decision-Shadow, source-mode-Shadow-Vergleich — alle fail-safe
  (Fehler verschluckt).
- **Wiederholungslogik / Fehlerverhalten:** Kein Retry. Lock-Skip → HTTP 200
  „already running". Shadow-Fehler nur `console.error`, nie `recordSystemError`.
- **Manueller Neustart:** `GET /api/cron/crawl` mit
  `Authorization: Bearer <CRON_SECRET>`.
- **Überwachung:** keine direkte; nur indirekt über Health-Report-Frische &
  GitHub-Watchdog (letzterer triggert `pipeline`).
- **Status:** aktiv/produktiv, aber **blind** (Fehler nur in flüchtigen Logs).

### 4.2 `/api/cron/pipeline` — identischer Crawl, zeitbegrenzt

`0 16 * * *` UTC → 18:00 CEST. `server.js:770-782` →
`withTimeout(runSourceCrawl, 280000)`. Loggt `runSourceCrawl … ms` (ephemer).
Ist der Endpoint, den der GitHub-Watchdog auslöst. De facto der 3. tägliche Crawl.

### 4.3 `/api/cron/morning-briefing` — Morgen-Push

`0 5 * * *` UTC → 07:00 CEST. `server.js:716-768` → `buildV3Briefing` (0 KI) +
Push. Single-tenant außer `HELMUT_MORNING_PUSH_ALL_PROFILES=1` (Default aus).
Persistiert **NICHTS** in die `briefings`-Tabelle (nur Push + On-Demand-Build) →
erklärt, warum dort nur `slot=lage`-Zeilen liegen. Loggt `build=…ms push=…ms`
(ephemer).

### 4.4 `/api/cron/understanding` — dedizierter KI-Verständnis-Lauf

`30 5 * * *` und `30 21 * * *` UTC → 07:30 & 23:30 CEST. `server.js:961-973` →
`runPendingUnderstandingShadow` (Budget 240 s). Verarbeitet als `pending`
vorgemerkte Vorgänge. Ruft das Understanding-Gate **NICHT** auf (Gate nur im
eager-Pfad). Gibt immer `ok:true` zurück, auch bei `processed=0` (alle
budget-übersprungen) → **stille Erfolgsmeldung ohne Arbeit.**

### 4.5 `/api/cron/lage-check` — Lage-Prüfung

`0 10 * * *` UTC → 12:00 CEST. `server.js:867-884` →
`withTimeout(runLageCheck, 280000)`. Läuft **OHNE** Pipeline-Lock
(`scheduler.js:339`). Bei starker neuer Lage: faltet frische Items in
Wissensobjekte/Decisions (`foldLageItemsIntoV3`).

### 4.6 `/api/cron/lage-briefing` — Lage-Narrativ-Vorwärmung (einziger KI-Ausgabe-Pfad)

`45 5 * * *` UTC → 07:45 CEST. `server.js:888-914` → `buildLageBriefing` je
Profil (Loop über alle aktiven Profile; deaktivierte übersprungen). Schreibt
`briefings`-Tabelle (`slot=lage`, Upsert `bf-{user}-lage-{Berlin-Tag}`). Erklärt
die 13 Zeilen (cem 5 / merkel 4 / brown 4).

### 4.7 `/api/cron/health-report` — Morgen-Health-Report (einziger aktiver Alarmweg)

`0 6 * * *` UTC → 08:00 CEST. `server.js:814-865` → `buildHealthReport` +
Zustellung via CallMeBot-WhatsApp + optionaler Webhook. `?dryRun=1` baut ohne
Versand. Der Google-News-Achse liegt ein **toter Monitor** zugrunde (§9).

### 4.8 `/api/cron/pipeline-status` — rein lesender Status (kein Cron-Schedule)

`server.js:791-810`. Gibt den letzten Crawl-Lauf zurück; `durationMs` immer
`null` (Kommentar 803-806 bestätigt: „wird erst persistiert, sobald der
Monitoring-Stapel gemergt ist"). Wird vom GitHub-Watchdog nach Client-Timeout
gepollt.

### 4.9 GitHub-Action `briefing-watchdog.yml` — externer Backstop (triggert echten Crawl!)

- **Auslöser:** GitHub-Cron `30 5 * * *` UTC → 07:30 CEST + manuell.
- **Was er tut:** ruft `/api/cron/pipeline` (= echter V3-Crawl, nicht nur
  Health-Check; Kommentar Z.4 „Triggert täglich den V3-Pipeline-Lauf, falls
  Vercels eigener Cron ausfällt") und prüft die Antwort; Client-Timeout 330 s,
  danach `pipeline-status`-Poll. GitHub-Failure-Mail ist der einzige unabhängige
  E-Mail-Alarm.
- **Einschränkung:** prüft nur die Pipeline — nicht Health-Report, nicht
  Understanding, nicht Kosten.
- **Hinweis:** `health-watch.yml` (aus PR #88) existiert nicht (unmerged). Alle
  übrigen `.github/workflows/*` (staff-backfill ×3, pardok-parser, shadow-pilot,
  sprint9b-verify) sind `workflow_dispatch`-only (manuell); `ci.yml` läuft auf
  Push/PR.

---

## 5. Zeitsteuerung (Phase 4)

**Ablauf eines Sommertages (UTC → CEST):**

| UTC | CEST | Prozess | Art |
|---|---|---|---|
| 04:00 | 06:00 | crawl | Crawl + Understanding (eager) |
| 05:00 | 07:00 | morning-briefing | Push (0 KI) |
| 05:30 | 07:30 | understanding + GitHub-watchdog→pipeline | KI-Understanding + 3. Crawl |
| 05:45 | 07:45 | lage-briefing | KI-Narrativ (alle Profile) |
| 06:00 | 08:00 | health-report | Alarm/WhatsApp |
| 10:00 | 12:00 | lage-check | Lage-Refresh |
| 16:00 | 18:00 | pipeline | Crawl (zeitbegrenzt) |
| 20:00 | 22:00 | crawl | Crawl + Understanding (eager) |
| 21:30 | 23:30 | understanding | KI-Understanding |

- **Parallelität / Kollisionsrisiko:** Um 05:30 UTC überlappen
  `understanding`-Cron und watchdog-getriggerte `pipeline` (die selbst
  eager-Understanding fährt). Der Pipeline-Lock schützt nur `runSourceCrawl`,
  nicht den Understanding-Pfad (globaler Understanding-Lock ist Default aus). →
  **Doppelte KI-Understanding-Calls sind zeitlich möglich;** die einzige Bremse
  ist die Idempotenz (KO existiert bereits).
- **Abhängigkeiten:** `morning-briefing` (05:00) liest die vom 04:00-Crawl
  erzeugten Wissensobjekte; `lage-briefing` (05:45) ebenso. Später eintreffende
  Dokumente werden erst beim nächsten Crawl/Understanding sichtbar.
- **Später eintreffende Dokumente:** kein Nachtrag in bestehende Briefings; das
  V3-Briefing wird bei jedem Read neu gebaut → automatisch aktuell. Das gecachte
  Lage-Narrativ wird per `koSetHash` invalidiert.
- **Doppelte Briefings:** ausgeschlossen für Lage (Upsert je
  `bf-{user}-lage-{Tag}`). Morgen-Briefing wird nicht persistiert.
- **Verpasster Lauf:** keine Catch-up-Logik, kein Tages-Idempotenz-Marker.
  Vercel holt verpasste Crons nicht nach; der Code auch nicht. Einziger Ersatz:
  der GitHub-Watchdog triggert die Pipeline unabhängig.
- **Sommer-/Winterzeit:** Da alle Crons UTC-fix sind, verschiebt sich jeder
  Prozess im Winter um 1 h früher in Berliner Ortszeit (z. B. Morgen-Briefing
  07:00 → 06:00). Bewusst zu entscheiden, ob das gewünscht ist.
- **Versehentlicher Doppelstart:** möglich über (a) fail-open-Lock bei
  Storage-Timeout, (b) 05:30-Überlappung, (c) manuelle Trigger ohne
  Idempotenz-Schutz.

---

## 6. Vollständiger Datenfluss (Phase 2) — Weg eines Dokuments

| # | Schritt | Datei · Funktion | liest | schreibt | Fehler / stille Fehler | Status |
|---|---|---|---|---|---|---|
| 1 | Quelle | `source-mode.js` `buildRelationalCrawlPlan` | `retrieval_paths`/`packages`/`package_paths` (bei `on`) | — | Plan leer/Ladefehler → still Fallback Alt-Katalog (`console.warn`) | aktiv (`on`) |
| 2 | Abruf | `crawler.js` `crawlAllSources`/`crawlSource` (RSS/HTML; Google-News-Decode; PARDOK-Streaming) | HTTP | in-memory Items | per-Quelle try/catch → `ok:false` in `crawlRun.errors` (max 20) | aktiv |
| 3 | Original-Inhalt | nicht gespeichert (DSGVO-Datensparsamkeit: nur `summary` ≤ 240 Zeichen) | — | — | Volltext bewusst verworfen | by design |
| 4 | Textextraktion | `crawler.js` `normalizeRawItem`/`parseRssItems` (Regex, kein DOM) | HTML/XML | `rawItem` | keine „Extraktion fehlgeschlagen"-Zustandsklasse pro Dokument | aktiv |
| 5 | Speicherung roh | `scheduler.js:221` `saveRawItems` (Blob) + `persistRawDocumentsShadow` (relational) | Blob-Hashes | `helmut_store.rawItems`, `raw_documents` (Upsert `rd-<hash>`) | relationaler Write doppelt fail-safe (`scheduler.js:163`+224) → still 0 | aktiv (`V3_STORE`) |
| 6 | Klassifizierung | `understanding.js:501` → `classification.js` `classifyKnowledgeObject` | KO-Felder | `decision_level`, `political_level` (=decision_level), Entitäten, Geografien | try/catch verschluckt → KO ohne Ebene | aktiv (write-time) |
| 7 | Wissensobjekt | `understanding.js:448` `assembleKnowledgeObject` + KI (`ai.requestStructuredJson`, `gpt-5-mini`, `KNOWLEDGE_OBJECT_SCHEMA`, `politicianId:null` = global) | Cluster | `knowledge_objects` (Upsert) | Save-Fehler → still `skipped-store` (KI-Kosten schon ausgegeben) | aktiv |
| 8 | Feature-Vektor („embedding") | `understanding.js:522` `computeFeatureVectorForKnowledgeObject` (Token-Hash, kein semantisches Embedding) | KO | `embedding` | try/catch verschluckt → KO ohne Vektor | aktiv |
| 9 | Personen/Themen | in KO-Feldern (`mentioned_*`, `parteien`, `ausschuesse`) + `radar.js`/`radarState.js` (2 Engines) | KO | — | 2 divergierende Erwähnungs-Engines | aktiv |
| 10 | Politische Ebene | `decision_level` ∈ {bund, land, kommune, eu, international, unknown} | — | KO | Casing: Deriver schreibt klein (`bund`), Alt-Daten groß (`Bund`) | aktiv (sparse) |
| 11 | Quellenpaket / Mandatsprofil | `profile-packages.js` `resolveProfilePackages` (Referenzzählung) | Profil, Pakete | — | Bund-Basis Pflicht für jedes Profil | aktiv |
| 12 | Relevanzbewertung | on-read `decisions.js` `decideForUser` → `matching.js` `matchProfileToKnowledgeObjects` (deterministisch, 0 KI) | Profil + KOs + Feature-Vektoren | — (Read-Pfad); Shadow schreibt `matching_results`/`decisions` nur für cem-ince | Shadow-Fehler `.catch(()=>null)` ohne Log | aktiv |
| 13 | Handlungsempfehlung | aus KO-LLM-Feld `recommendation`/`handlungsempfehlung` | KO | — | — | aktiv |
| 14 | Briefing | `server.js:1746` `buildV3Briefing` (0 KI) → `briefingContract.js` | KOs + on-read Decisions + Quellen | — (nicht persistiert) | Store-Fehler → `empty('store-error')` | aktiv |
| 15 | Ausgabe/Speicherung | Lage-Narrativ (`lage.js`, 1 KI-Call) → `briefings`-Tabelle; Home/Radar on-read | KOs | `briefings` (nur Lage) | Cache-Fehler still verschluckt → KI-Neuerzeugung | aktiv |

**Nachvollziehbarkeit (rückwärts):** `decisions`/`matching_results` tragen
`knowledge_object_id` + `vorgang_id`; KO→Dokument via `ko_document_links` (N:M);
Dokument→Quelle via `document_findings`. **Bruchstelle:** Die `briefings`-Tabelle
hat keine Fremdschlüssel auf `decisions`/`knowledge_objects` (nur
`{id,user_id,slot,generated_at,payload}`) — die Kette „warum stand das im
Briefing" liegt nur im opaken `payload`-JSON. `office_outputs` (die einzige
Tabelle mit `decision_id` + `knowledge_object_id`) ist leer.

---

## 7. Dokumentlebenszyklus (Phase 5)

| Zustand | Existiert? | entsteht durch | gespeichert wo | Retention / Neuversuch / Löschung |
|---|---|---|---|---|
| neu | ✅ | `saveRawItems`/`toRawDocumentRow` | Blob `rawItems` + `raw_documents` | Blob gekappt auf 600; relational nie gelöscht |
| gespeichert | ✅ (implizit, kein Status-Feld) | Upsert `rd-<content_hash>` | `raw_documents` | idempotent; keine `status`-Spalte |
| zur Verarbeitung vorgesehen (pending) | ✅ | `runLazyUnderstandingShadow` → `savePendingKnowledgeObject` | `knowledge_objects.status='pending'` | bleibt bis Understanding; Budget-Skip belässt pending → Retry idempotent |
| in Verarbeitung | ❌ | — | — | kein `processing`-Status; nur grobkörniger globaler Lock (Default aus) |
| erfolgreich verarbeitet | ✅ | `assembleKnowledgeObject` (KI ok+valide) | `understanding_status='complete'` | — |
| relevant / nicht relevant | ✅ (Relation, kein Dok-Flag) | on-read `decideForUser`; Shadow `runDecision/Matching` (nur cem-ince) | `decisions`/`matching_results`; Gate-Telemetrie `gate_shadow_events` | keine Löschung stale Zeilen |
| doppelt | ✅ | `dedupeRawDocuments` (content_hash) + dedup-global (3 Stufen: canonical / Fingerprint / Domain+Titel-Ähnlichkeit ≥ 0,72 + 2-Tage-Fenster) | Duplikat → nie eigene Zeile, stattdessen `document_findings` + `finding_count++` | — |
| unvollständig | ✅ | Schema-Validierung schlägt fehl → `markUnderstandingFailed`; oder Lese-Qualitätsstatus | `understanding_status='failed'` | terminal |
| nicht lesbar | ❌ (nur quellenweit) | Fetch-Fehler `ok:false` | `crawlRun.errors` (max 20, pro Quelle) | kein Pro-Dokument-Zustand |
| unbekanntes Format | ❌ | — | — | `document_type` zu 99 % null, nie als Ablehnungsgrund |
| Verarbeitung fehlgeschlagen | ✅ | LLM-/Schema-Fehler → `markFailed` | `understanding_status='failed'`, `status` bleibt `pending` | kein Auto-Retry (aus `listPendingKnowledgeObjects` gefiltert) |
| erneuter Versuch geplant | ❌ | — | — | nur manueller `resetFailedUnderstanding` (kein Cron-Aufrufer) |
| endgültig fehlgeschlagen | ✅ (= failed) | s. o. | `knowledge_objects` | nie erneut versucht, nie ausgeliefert |
| archiviert | ❌ | — | — | kein Archiv/Purge/Retention im Storage (grep = 0) |
| gelöscht | ❌ (für Dokumente/KOs) | nur DSGVO-Profillöschung (`deleteProfileDataV3`, nur nutzergebundene Tabellen) | — | `raw_documents`/`knowledge_objects`/`ko_document_links`/`document_findings` werden NIE gelöscht; Blob nur gekappt |

**Was mit nicht-für-ein-Briefing-verwendeten Dokumenten passiert:** Sie bleiben
dauerhaft in `raw_documents`/`knowledge_objects` (kein Archiv, keine Löschung,
keine Retention). Bei Budget-Engpass bleiben interessante Cluster `pending` und
werden idempotent nachgeholt; verstandene, aber nie relevante KOs verbleiben
unbegrenzt. **Datenverlust-Schutz:** Upsert-Idempotenz + Dedup-Fundstellen.
**Doppelverarbeitungs-Schutz:** Idempotenz + (schwacher) Lock. **Sichtbarkeit der
Zustände:** nur Admin-Reads; kein Zustands-Dashboard, keine Alarme auf
Zustandsübergänge.

---

## 8. Laufzeitwerte (Phase 3) — vorhanden vs. fehlend

### 8.1 Vorhandene, belegte Messwerte

Einzige persistierte Laufzeit = pro LLM-Call (`llmUsage.durationMs`, geschrieben
in `ai.js` → `recordLlmUsage`). Aggregiert (1878 Einträge, 01.–16.07., Azure
`gpt-5-mini`):

| callType | n | ok | Ø ms | Median | min | max | Kosten $ | letzte |
|---|---|---|---|---|---|---|---|---|
| skipped-understanding-budget | 1115 | – | – | – | – | – | – | 14.07. 20:03 |
| understanding | 256 | 236 | 7900 | 8276 | 24 | 19278 | 0,5437 | 16.07. 07:37 |
| communicationDraft (Büro) | 210 | 210 | 3880 | 3647 | 2106 | 12963 | 0,1960 | 16.07. 07:56 |
| koTagsBackfill (Einmal) | 161 | 161 | 1609 | 1466 | 1121 | 6481 | 0,0303 | 12.07. |
| skipped-understanding-error | 68 | – | – | – | – | – | – | 15.07. 14:34 |
| v2ScoreAndPrioritize (tot) | 26 | 26 | 9220 | 9472 | 3061 | 13501 | 0,0585 | 06.07. |
| helmutAssessment (tot) | 25 | 25 | 4714 | 4254 | 2802 | 14782 | 0,0387 | 06.07. |
| lageBriefing | 6 | 6 | 5247 | 5270 | 3633 | 6464 | 0,0087 | 16.07. 07:39 |
| parliamentAssessment | 1 | 1 | 2965 | – | – | – | 0,0005 | 03.07. |

**Gesamt-LLM-Kosten seit 01.07. ≈ $0,92.** Weitere belegte Betriebszahlen: 20
Crawl-Läufe (100 % Quellen-Erfolg, 0 Fehler); `raw_documents` 5733 (55 neu/24 h);
Gate-Telemetrie `verstehen` 3088 / `zurueckstellen` 1415 / `parken` 40.

### 8.2 Fehlende Messwerte (müssen im 2. Thread eingebaut werden)

| Prozess | Fehlt | Wo einbauen |
|---|---|---|
| Crawl / Pipeline | Gesamtdauer (Wall-Clock) | `scheduler.js:168` `t0=Date.now()`, `durationMs` in `saveCrawlRun` (283) und in die `compactStore`-Whitelist (`storage.js:2124-2133`), sonst sofort wieder gestrippt |
| Lage-Check | Dauer | `scheduler.js:339` + `saveLageCheck`-Payload |
| Understanding-Batch (eager + Cron) | Loop-Dauer, processed/deferred/reason persistiert, Anzahl `skipped-store` | eigene Zähler-Zeile im Auth-Store (Muster `adminRecoveryLastRun`), nicht im großen Blob |
| Briefing-/Radar-Aufbau | End-to-End-Dauer (0 KI) | `server.js:1746` / `radar.js:234` `t0`/`Δ` |
| Pro-Quelle-Gesundheit | `last_success_at` je Quelle | beim `saveRawDocument` je `source_id` fortschreiben → quality-watchdog `pathTelemetry=true` |
| Klassifikation/Feature-Vektor | Abdeckungs-Kennzahl (`decision_level`/`embedding` null-Quote) | Health-Report-Achse |
| KI-Budget | Ausschöpfung als Alarm (nicht nur 1115 stille Records) | Health-Report-Achse aus `getLlmUsage` |
| Quellenpfad | „relational vs. Fallback" je Lauf | Flag in `crawlRun` / `pipeline-status` |

**Fazit Laufzeit:** Für einen *überwachten* Piloten ist die Nicht-Persistenz
jeder Prozessdauer der größte Beobachtbarkeits-Mangel. **PR #88 adressiert genau
`durationMs`, hängt aber auf Nicht-`main`-Basis fest.**

---

## 9. Fehler & Überwachung (Phase 6)

**Grundmuster:** Die Pipeline ist durchgängig „fail-safe" — aber fail-safe heißt
hier fast überall *`console.error` + weiter*, nicht *Systemfehler + Alarm*.
`recordSystemError` wird von KEINEM `lib/helmut`-Modul aufgerufen (nur
`server.js`). Alle Crawl-/KI-/DB-/Dedup-/Matching-Fehler landen ausschließlich in
flüchtigen Vercel-Logs.

| Fehlerklasse | Erkennung | Protokollierung | Wiederholung | sicherer Endzustand | Warnung/Mensch | Datenverlust-Risiko |
|---|---|---|---|---|---|---|
| Quelle nicht erreichbar | ja (`ok:false`) | `crawlRun.errors` (max 20) | nächster Lauf | Lauf läuft weiter | nur bei aggregierter Fehlerrate | gering |
| leere Antwort | ja (empty feed) | in `errors[]` | nächster Lauf | ja | nein | gering |
| veränderte Seitenstruktur | schwach (Regex-Parser liefert `[]`) | ggf. `errors[]` | nächster Lauf | ja | nein (schleichend) | mittel (unbemerkte Erosion) |
| defekte/große PDF | teilw. (PARDOK 64-MiB-Deckel, fail-closed) | `errors[]` | nächster Lauf | ja | nein | gering |
| unbekanntes Format | keine Zustandsklasse | — | — | — | nein | gering |
| Textextraktion fehlgeschlagen | keine Pro-Dok-Klasse | — | — | — | nein | mittel |
| KI nicht erreichbar (Azure 404) | ja (Exception) | `markFailed` + `skipped-error` | kein Auto-Retry | `failed` (terminal) | nein | hoch (Vorgang dauerhaft unsichtbar) |
| KI-Timeout | ja | wie oben | kein Auto-Retry | `failed` | nein | hoch |
| KI-Ergebnis unbrauchbar | ja (Schema-Validierung) | `markFailed` + `skipped-invalid` | kein Auto-Retry | `failed` | nein | hoch |
| Datenbankfehler | teilw. `console.error`; Blob-Timeout → 500 (scope api) | kein Retry | evtl. ganzer Lauf verloren | nur als api-Fehler | | hoch |
| Doppelverarbeitung | schwach | — | — | Lock (fail-open) | nein | mittel (Doppelkosten) |
| fehlendes Mandatsprofil | ja (`getActiveProfile` neutral) | — | — | neutrale Defaults | nein | gering |
| falsche Nutzerzuordnung | — | — | — | — | nein | ungeklärt |
| unvollständiges Briefing | ja (Leerzustände) | Response-only | — | `empty('…')` | nein | gering |
| erfolgreicher Lauf ohne neue Daten | nein | — | — | `ok:true`/200 | nein | — |
| Prozess bleibt ohne Fehler stehen | nein | — | — | — | nein | — |
| mehrere gleichzeitige Instanzen | schwach (Lock fail-open, TOCTOU) | — | — | — | nein | mittel |
| Kostenlimit überschritten | ja (`skipped-budget`) | 1115 `llmUsage`-Records | idempotent (bleibt pending) | Regel-Fallback | nein (kein Alarm) | gering |

**Belegte Kernbefunde:**

1. **Toter Google-News-Monitor:** `buildHealthReport` liest
   `crawl.googleUrlResolution` (`server.js:3201`), aber `compactStore` strippt
   dieses Feld → `gnr` immer null → die als SPOF-Frühwarnung beworbene Warnung
   feuert nie.
2. **`recordSystemError`-Lücke:** kein Pipeline-Modul meldet je einen
   Systemfehler → der Motor ist im `systemErrors`-Log unsichtbar.
3. **Lock fail-open + TOCTOU:** `acquirePipelineLock` (`storage.js:1017-1033`)
   ist ein nicht-atomarer Read-modify-write auf dem Auth-Blob und liefert bei
   Storage-Fehler `true` → unter Blob-Instabilität Doppelverarbeitung. Der
   einzige echte Doppel-KI-Schutz (globaler Understanding-Lock) ist Default aus
   und nirgends verdrahtet.
4. **Blob-Timeout = Datenverlustpfad:** 10-s-AbortController
   (`storage.js:1791`); der 1,24-MB-Write ohne Retry → bei Timeout während
   `saveCrawlRun`/`saveRawItems` geht der ganze Lauf verloren. Belegt:
   wiederkehrend „Supabase storage timed out 10000ms /rest/v1/helmut_store"
   (58 api-Fehler, zuletzt 16.07. 05:50).
5. **Stille Erfolge:** understanding-Cron `ok:true` bei `processed=0`;
   crawl-Cron 200 bei Lock-Skip; `newCandidateItems` konstant 1012 → niemand
   bemerkt einen klemmenden Kandidaten-Cap.
6. **quality-watchdog (10 Achsen):** existiert, wird aber nur im Admin-Read mit
   `signals:{}` instanziiert → alle Frische-Achsen „unbekannt", kein Alarmpfad.
7. **Alarmwege:** einziger aktiver = Health-Report 06:00 UTC über
   CallMeBot-WhatsApp (Gratis-Drittdienst, fail-open/still) + optionaler Webhook.
   Fällt der Report-Cron aus, merkt es nur der GitHub-Watchdog — der aber nur die
   Pipeline prüft.
8. **Azure-404-Fenster (03.07., 6×):** „DeploymentNotFound" —
   Provider-Fehlkonfiguration, inzwischen behoben (Understanding läuft).

---

## 10. Datenqualität & Nachvollziehbarkeit (Phase 7)

- **Aktualität:** ✅ tagesfrisch (`raw_documents` bis 16.07. 07:34; KOs bis
  16.07. 07:37).
- **Vollständigkeit KO-Anreicherung:** ⚠️ 67/314 Wissensobjekte haben
  `decision_level`/`political_level`/`embedding` (Feature-Vektor); 247 sind
  Altbestand vor 14.07. und wurden nie gebackfillt (verifiziert: von 83 KOs seit
  14.07. haben 65 die Ebene). Der Schreibpfad funktioniert (Migration
  angewendet) — es fehlt der Backfill.
- **Ebenen-Verteilung (belegt):** `bund` 46, `land` 8, `eu` 8, `international` 3,
  `kommune` 2, `(null)` 247. → Multi-Ebenen-Klassifikation funktioniert
  nachweislich (auch `land`/`kommune`).
- **„0 × Bund"-Auflösung:** war ein Casing-Artefakt — `classification.js`
  schreibt klein (`bund`); Alt-/Debug-Daten nutzen `Bund`. Downstream-Filter auf
  `Bund` verfehlen neue KOs.
- **Dubletten:** `raw_documents` 5386 distinct `content_hash` von 5733 → 347
  kollidieren (per Fundstelle zusammengeführt, keine echten Dubletten-Zeilen).
- **Textextraktion:** Regex-basiert (kein DOM); `summary` ≤ 240 Zeichen (DSGVO).
  99 % ohne `document_type` (nie befüllt, aber auch nie als Ablehnungsgrund
  genutzt).
- **Personen/Organisationen/Themen/Ebene:** in KO-Feldern vorhanden; 2
  divergierende Erwähnungs-Engines (`radar.js` vs. `radarState.js`) mit
  unterschiedlicher Strenge → Radar-Tab und „Über dich"-Sektion können abweichen.
- **Nutzerzuordnung / Relevanz:** on-read deterministisch für alle Profile; die
  persistierten `decisions`/`matching_results` existieren nur für `cem-ince` und
  werden im Ausgabepfad fast nicht gelesen (`listDecisions` hat „keinen
  Produktionsaufrufer", `storage.js:1478`).
- **Quellenangabe:** ✅ 93 % direkte Links; KO→Dokument via `ko_document_links`.
- **Rückwärts-Nachvollziehbarkeit bis … Nutzer:** ✅
  Quelle→Dokument→Fundstelle→KO→Decision/Matching. ❌ Bruch bei
  Briefing→Decision (keine FK-Spalte; nur `payload`-JSON).

---

## 11. Ungenutzte Dateien / toter Code (Phase 8)

„Laufzeit-tot" = kein `require` durch `server.js`/`scheduler.js`/anderen
`lib`-Code, nur durch `scripts/`. **Nichts wurde gelöscht (reine Lese-Analyse).**

| Fund | Ort | frühere Rolle | aktuelle Verwendung | Risiko | Empfehlung |
|---|---|---|---|---|---|
| `staff-backfill.js` | `lib/helmut/` | Stabschef-Felder-Backfill | nur `scripts/staff-backfill.js` (CLI, dry-run-Default) | niedrig | nach `scripts/one-off/` |
| `migration-mapper.js` | `lib/helmut/quellenarchitektur/` | Sprint-6-Migration Blob→relational | nur `scripts/sprint6-*` | niedrig | als abgeschlossene Migration archivieren |
| `cem-shadow-compare.js` | `lib/helmut/quellenarchitektur/` | Cem-Migrations-Shadow-Vergleich | nur `scripts/sprint6-*` | niedrig | wie oben |
| `understanding-priority.js` | `lib/helmut/quellenarchitektur/` | relevanzbasierte Budget-Auswahl (fertig, getestet, nie scharf) | nur `scripts/gate-adversarial-test.js` | mittel (verdrängt heute relevante späte Vorgänge, Ankunftsreihenfolge) | scharfschalten (Freigabe) — Kern-Fix gegen Aushungern |
| `ko-classification-backfill.js` | `lib/helmut/` | Altbestand-Ebenen-Nachfüllung | nur `scripts/` (`--execute` manuell) | hoch (247 KOs ohne Ebene) | einmalig ausführen / an Cron |
| `generateHelmutAssessment` (+Umfeld) | `ai.js:350` | V2-KI-Bewertung | 0 Aufrufer (V3 nutzt deterministisches `buildHelmutAssessment`) | mittel (versehentliche LLM-Reaktivierung) | als toten V2-Pfad entfernen (nach Bestätigung) |
| `v2ScoreAndPrioritize` | — | V2-Scoring | nur Test-Fixture-String | keiner | erledigt |
| `runMorningBriefing` | — | V2-Morgen-Briefing | entfernt (Cron ruft V3) | keiner | erledigt |
| `docs/AUDIT_DATENMOTOR_2026-07.md` | `docs/` | Alt-Audit (01.07.) | referenziert nicht existierende Dateien (`personalization.js`/`runtime.js`/`briefing.js`), Single-Tenant-Vor-V3-Framing | mittel (irreführend bei Due Diligence) | als überholt kennzeichnen |
| `docs/V3_MIGRATION_PLAN.md` | `docs/` | „Plan" | faktisch abgeschlossenes Cutover-Protokoll | niedrig | umbenennen |
| tote Env-Flags | `.env.example` | — | `HELMUT_TENANT_JWT_MODE` (hart false), `SUPABASE_JWT_SECRET`/`ANON_KEY` (nur im stillgelegten JWT-Modus), OpenAI-Pfad (Azure-Vorrang), `HELMUT_MONITORING_EMAIL` (existierte nie) | niedrig | dokumentieren/entfernen |
| **Falsch-verdächtigt (LIVE!)** | `learning.js` (`server.js:638/702/708/3046`), `presentation-backfill.js` (`server.js:953`), `quality-watchdog.js` (`server.js:3726`) | — | — | — | **nicht anfassen** |

**Falle:** `HELMUT_UNDERSTANDING_GATE=on` und `HELMUT_PARDOK_DISPATCH=on`
schalten im aktuellen Code **NICHTS** scharf (der `on`-Arm ist nicht verdrahtet;
pardok fällt bei `on` still auf `off`). Wer sie setzt, ändert nichts — ohne
Fehlermeldung.

**Blob-Keys `rawItems`/`politicalItems`/`topicMemory`/`sources`:** Code
liest/schreibt sie weiter (nicht tot). Ob die *Daten* eingefroren sind, ist
datenseitig zu klären (ungeklärt).

**Fehlend:** kein toter-Code-/require-Graph-Report in CI → solche Module fallen
nicht automatisch auf.

---

## 12. Landtagsfähigkeit (Phase 9) — Berlin/Brandenburg

### 12.1 Was strukturell BEREITS mehr-ebenen-fähig ist

Relationaler Quellenplan (`source-mode.js`) ist die aktive Wahrheit;
`geographies` mit 5 Ebenen; `parliamentTypeOf` löst Landtag aus
`mandate_profiles.politische_ebene` auf (`config.js:151-164`);
`profileCompleteness` kennt „Landtag braucht Bundesland" (`config.js:194`);
`LANDESPAKET_BY_BUNDESLAND = {berlin, brandenburg}` (`profile-packages.js:28-31`);
Klassifikation erzeugt real `land`/`kommune`; `entity_type`-Enum enthält
`parliament`/`authority`.

BE/BB-Seed (`20260717`) ist in der Live-DB angewendet: 4 Entitäten, 14 Publisher,
18 Abrufwege, 18 `path_expected_levels` (alle `land`), 19 `package_paths`.

### 12.2 Die DREIFACH-Sperre (warum heute 0 sichtbare BE/BB-Items)

1. **Hartes Landesmodul-Gate** in `buildRelationalCrawlPlan`
   (`source-mode.js:46-52,112-116` `isLandesmodulPath`) schließt jeden `rp-be-` /
   `rp-bb-`-Weg aus — auch die Google-News/RSS-Wege, bevor Status/Paket geprüft
   werden. → **CODE-Blocker.**
2. **PARDOK hat keinen Live-Modus:** `pardokDispatch` gibt in jedem Modus
   `items:[]` zurück (`pardok-dispatch.js:19,72,113`); der Live-Pfad ist „bewusst
   nicht implementiert". BE/BB-Plenum/Drucksachen können nie in die Pipeline. →
   **CODE-Blocker.**
3. **Status:** alle 18 BE/BB-Wege `needs_review` + `manual`; Pakete
   `berlin-basis`/`brandenburg-basis` `prepared` (nicht `active`). → **DATEN.**

### 12.3 Ergänzbarkeit je Element (Data-Flip vs. Codeänderung)

| Element | Data oder Code | Beleg |
|---|---|---|
| Neue Parlamente | DATA (Entität existiert via Publisher-FK; anreichern) | 20260717-Seed |
| Neue Ausschüsse | DATA (keine Landes-Ausschuss-Entitäten geseedet; classification löst nur Bund auf) | `classification.js:127-129` |
| Neue Ministerien | DATA (nur Sammel-Publisher „Ministerien Brandenburg") | 20260717-Seed |
| Neue Fraktionen | DATA (nur `group-agh-linke`; SPD/CDU/AfD/BSW/Grüne fehlen) | 20260717-Seed |
| Neue Behörden | DATA (`authority`-Enum vorhanden, ungenutzt) | 20260713-Migration |
| Wahlkreise | DATA (`electoral_districts` komplett leer; kein Landtagswahlkreis) | DB |
| Regionalmedien | DATA (Tagesspiegel/rbb24/MAZ geseedet, `needs_review`) | 20260717-Seed |
| Neue Quellenpakete | DATA (`prepared` → `active` flippen) | `packages.js:60-70` |
| Eigene Abrufzeiten | **CODE** (Crons global, kein Land-Scheduler) | `vercel.json` |
| Eigene Mandatsprofile | DATA (`mandate_profiles`-Zeile Landtag; keine BE/BB-Profile existieren) | `profile-packages.js:109-114` |
| Landesspezifische Relevanzregeln | **CODE** (Bund-Bias in classification/scoring/matching; s. u.) | `classification.js:163-174`, `scoring.js:97-99` |
| Landesspezifische Briefingregeln | **CODE** (keine Ebenen-/Land-Filterung in `lage.js`/Briefing) | — |

### 12.4 Bund-Bias, der Landtag heute verhindert (produktweit, nicht nur Demo)

- `neutralProfileDefaults`/`blankProfile` setzen für jedes Nicht-Cem-Mandat
  `politicalLevel='Bund'`, `function='Bundestagsabgeordnete:r'`,
  `relevantMinistries=['Bundesregierung']` (`scheduler.js:1404-1441`,
  `server.js:4490-4534`, Save-Fallback 4621). → `parliamentTypeOf` klassifiziert
  ein Mandat ohne explizites `politische_ebene='landtag'` als Bundestag.
- Crawl-/Scoring-/Relevanz-Heuristiken mit Default `profile=cemInceProfile`
  feuern für jedes Profil mit fixen Bundesbegriffen: `itemPoliticalWeight` +35 für
  `bundesregierung`/`bmas` (`scheduler.js:1145`); `lageCheckSourceWeight` +120 für
  `bmas|bundesregierung|bundestag|linke|dgb` (427); `hasGovernmentWork` nur
  Bundesbegriffe (975); föderale Top-Quelle (prio 94) rangiert über Landtag-Quelle
  (prio 92).
- `matching.js` Synonymkataloge nur Bundestags-Ausschüsse/Bundesparteien
  (53-74, 118-126). DIP (nur Bundestag, WP 21) wird für jedes Mandat abgerufen
  (`dip.js`, `scheduler.js:220`) — kein Landtags-Pendant.
- **Sauber gegated (nur Demo):** das volle `cemInceProfile`
  (Die Linke/BMAS/Niedersachsen) und `demoFallback`-Themen greifen nur bei
  `!authModeOn() && id==='cem-ince'`.

### 12.5 Urteil Landtag

Der Kern ist strukturell geeignet (relationale Ebenen-Architektur,
`land`/`kommune`-Klassifikation, `parliamentTypeOf`, Landespaket-Mapping). BE/BB
ist aber **nicht durch reines Datenflippen ergänzbar:** zwingend sind zwei
Codeänderungen — (1) das harte Landesmodul-Gate entfernen/parametrisieren,
(2) den PARDOK-Live-Modus bauen — plus Datenaktivierung (Status-Flips, Entitäten,
`electoral_districts`, ein Landtags-Mandatsprofil) plus der Ebenen-Default-Fix
(nicht mehr auto-`Bund`) plus der KO-Backfill. **Kein Neubau, aber ein
umschriebenes Umbaupaket (siehe Umsetzungsplan P2).**

---

## 13. Risiken (priorisiert)

| # | Risiko | Schwere | Beleg |
|---|---|---|---|
| R1 | 1,24-MB-Monolith-Blob → 10-s-Timeouts, ganzer Crawl-Save verlierbar; skaliert mit mehr Mandaten schlechter | **kritisch** | `systemErrors` api=58; `storage.js:1791/188-195` (kein Retry) |
| R2 | Pipeline-Lock fail-open + TOCTOU; Understanding-Lock Default aus → Doppelverarbeitung/Doppel-KI-Kosten, unbemerkt | **kritisch** | `storage.js:1017-1033, 1053-1074` |
| R3 | Kein Pipeline-Fehler in `systemErrors`; Motor im Fehlerlog unsichtbar | **kritisch** | `grep recordSystemError` = 0 in `lib/helmut` |
| R4 | Toter Google-News-Monitor (liest gestripptes Feld) → SPOF-Frühwarnung feuert nie | hoch | `server.js:3201` vs. `storage.js:2124-2133` |
| R5 | 247/314 KOs ohne Ebene/Feature-Vektor → Relevanz-Matching wirkt nur auf ~21 % | hoch | DB; `understanding.js:500-525` |
| R6 | `failed`-KOs (88 Skips) nie auto-retry → Vorgänge nach einem KI-Fehlertag dauerhaft unsichtbar | hoch | `storage.js:1524`; `understanding.js:591-599` |
| R7 | Keine persistierte Laufzeit → überwachter Pilot ohne Beobachtbarkeit | hoch | §8 |
| R8 | `savedItems` überzeichnet Durchsatz ~15× (Blob-Cap-Artefakt) → falsche Reporting-Basis | mittel | `storage.js:2153-2167`; DB 55/24h |
| R9 | Ebenen-Casing (`bund` vs. `Bund`) → Downstream-Filter verfehlen neue KOs | mittel | `classification.js:24` vs. `server.js:4972` |
| R10 | Alarm nur über CallMeBot (fail-open/still) + optionaler Webhook; kein Ack | mittel | `server.js:3267-3279` |
| R11 | `raw_documents`/`knowledge_objects` ohne Retention/Archiv → unbegrenztes Wachstum | mittel | `grep retention`=0 |
| R12 | Briefing→Decision nicht relational verlinkt → „warum stand das im Briefing" nicht auditierbar | mittel | `storage.js:1630-1636` |
| R13 | `HELMUT_*_GATE=on` / `PARDOK=on` schalten still nichts scharf (trügerischer Wert) | mittel | `understanding.js:685`; `pardok-dispatch.js:41` |
| R14 | 05:30-UTC-Überlappung understanding-Cron + watchdog-Pipeline ohne gemeinsamen Lock | mittel | `vercel.json` + `briefing-watchdog.yml` |
| R15 | `HELMUT_MAX_LLM_CALLS_PER_DAY` versehentlich leer → dauerhaft 50 statt 100, nur 1× Warnung | mittel | `storage.js:600-611` |

---

## 14. Offene Gründerentscheidungen

*Nur Fragen, die nicht durch Codeanalyse beantwortbar sind. Detailstruktur
(Optionen/Empfehlung/Risiko/Dringlichkeit) siehe
`docs/helmut_datenmotor_umsetzungsplan.md`, Abschnitt „Offene
Gründerentscheidungen".*

1. **Prod-Env-Werte bestätigen (nicht einsehbar):**
   `HELMUT_MAX_LLM_CALLS_PER_DAY` (50 vs. 100?), `HELMUT_V3_MATCHING`,
   `HELMUT_V3_LAZY_UNDERSTANDING`, `HELMUT_LLM_BUDGET_FAIL_CLOSED`,
   `HELMUT_UNDERSTANDING_LOCK`, `HELMUT_LLM_RESERVE_UNDERSTANDING`,
   `HELMUT_AUTH_MODE`, `HELMUT_DIP_PRIMARY`, `HELMUT_MORNING_PUSH_ALL_PROFILES`,
   `HELMUT_MONITORING_WEBHOOK_URL`.
2. **KO-Backfill freigeben** (kostenneutral, 0 KI) für die 247 Alt-KOs →
   Ebene/Feature-Vektor.
3. **Blob→relational-Migration** der Betriebsdaten (Crawl-Läufe/Locks/Kosten) vor
   Landtag-Skalierung terminieren.
4. **Landtag-Cutover-Umfang BE/BB** freigeben (2 Codeänderungen +
   Datenaktivierung) oder verschieben.
5. **Scoring scharfschalten** (`HELMUT_SCORING_MODE`) — heute Default aus; nötig
   für ebenen-gewichtete Lage.
6. **Persistenz von `decisions`/`matching_results`:** als Output-Quelle nutzen,
   alle Profile loopen, oder als reine Telemetrie führen + Cleanup.
7. **Monitoring härten:** Pipeline-Fehler in `systemErrors`, `compactStore`-
   Whitelist um Diagnosefelder, Zweitkanal + Meta-Heartbeat.
8. **`sources`/`rawItems`-Blob eingefroren?** (Datenfrage, nicht codeseitig
   belegbar).
9. **Sommer-/Winterzeit-Drift der Crons** akzeptieren oder auf Ortszeit
   umstellen.

---

*Ende Auditbericht. Umsetzungsschritte mit Priorisierung P0–P3:*
`docs/helmut_datenmotor_umsetzungsplan.md`.
*Alle `Datei:Zeile`-Verweise beziehen sich auf HEAD = Production-Commit `427295c`.*
