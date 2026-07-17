# Watchdog-Audit — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 6** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Writes, keine Migration, kein Merge, keine Fixes.
**Belegbasis:** `.github/workflows/briefing-watchdog.yml`, `scripts/watchdog-eval.js`, `server.js` (buildHealthReport/operationalStatus/backendHealth/releaseCheck), `lib/helmut/storage.js`, `briefingContract.js`, `client.js` (Splash-Watchdog), `index.html`; SELECT-Abfragen gegen Prod `ddckuvvpcytqbyfmbvie`; Tests `watchdog-eval` 14/14, `splash-boot` 29/29, `admin-overview` 104/104.

> **Kernbefund (belegter Fehlalarm):** Der WhatsApp-Morgenreport meldet **„Pipeline seit 139h nicht durchgelaufen"**, weil er den Zeitstempel `getLatestPipelineDebugReport()` liest — und **dieser Marker wird von keinem Code mehr geschrieben** (`savePipelineDebugReport` hat **null Aufrufer**). Gleichzeitig laufen Crawl/Understanding/Decisions nachweislich weiter. Zweiter, inverser Fehler: die Briefing-Frische ist **build-zeit-blind** (`generatedAt = now`) → sie kann nie „veraltet" erkennen (false-green). Beide belegt mit Code + Prod-DB.

---

## 1. Watchdog-Inventar (mehrere, unabhängige Systeme)

| # | Watchdog | Ort | Zweck | Datenquelle |
|---|---|---|---|---|
| **A** | GitHub-Action Backstop | `.github/workflows/briefing-watchdog.yml` + `scripts/watchdog-eval.js` | Täglich 05:30 UTC `/api/cron/pipeline` triggern, Live-Antwort prüfen | **Live-HTTP-Antwort** (successfulSources/understanding/errors), **kein Timestamp** |
| **B** | WhatsApp-Morgenreport | `server.js:2566 buildHealthReport` via `/api/cron/health-report` | Betreiber-Frühwarnung (CallMeBot) | 4 Store-Timestamps: crawl, briefing, lage, **pipelineDebug** |
| **C** | Server Ops/Status | `/api/ops/status` → `operationalStatus`/`backendHealth`/`pilotReadiness` | Betriebsampel + Health-Score | crawlRun, lageCheck, **on-read gebautes V3-Briefing**, storage |
| **D** | Release-Check | `/api/release/check` → `computeReleaseCheck` | Pitch-/Release-Gate | wie C + radarArchive |
| **E** | Admin-Watchdog-Kachel | client.js:1235-1241 aus `dsMorningStatus` (server.js:3204) | Admin-UI-Kachel „Watchdog" | `crawlRuns`-Liste (frühester Erfolg ≤ 07:30 Berlin) |
| **F** | Client Splash-Watchdog | `SPLASH_WATCHDOG_SCRIPT` (server.js:1953), gespiegelt index.html:40 | Boot-Sicherheitsnetz: Splash nie dauerhaft hängen | rein clientseitig: `__helmutClientLoaded` + `is-loading`, Timer 8s/30s |

**Trennschärfe:**
- **Lage vs. Crawl getrennt?** Teilweise — `operationalStatus`/`backendHealth` veroderen `isFullCrawlHealthy(crawl) || isLageCheckFresh(lageCheck)` (eigene Fenster 14h/4h, aber zu einem Signal verodert).
- **Briefing-Aktualität vs. Crawl?** Nominell ja, **faktisch nein** — Briefing-Frische ist wegen `generatedAt=now` blind (§3).
- **Teiljobs vs. Gesamtprozess?** Nur B und C/D zerlegen; B produziert eine `problems[]`-Liste, aber **ein einziger toter Marker kippt `ok` auf false**. A bewertet nur den Crawl-Teiljob.
- **Recovery-Erkennung?** Keiner hat ein explizites „Erholt"-Signal; Frische-Fenster erholen sich nur implizit.
- **Lage/Radar/Helmut/Büro getrennt?** Nur `releaseLiveFlow` (D) zerlegt in 7 Schritte; A/B/C nicht.
- **Profile getrennt?** **Inkonsistenz:** `getLatestCrawlRun` liest **global** `main`, `getLatestPipelineDebugReport`/`getLatestLageCheck` lesen **profil-scoped** `main-p-<id>` → B mischt globale und profil-lokale Timestamps in einem Urteil.

---

## 2. Watchdog-Job-Matrix

| Watchdog | Maßgeblicher Timestamp | Schwelle | Alarm-Auslöser | Fehlalarm-Risiko |
|---|---|---|---|---|
| **A GitHub** | keiner (Live-Antwort) | HTTP≠200, `ok:false`, `understanding.reason~error`, `successfulSources≤0` | harter Pipeline-/Understanding-Fehler oder 0 Quellen | **Niedrig** — gegen Live-Antwort; `skipped/already-running` = kein Fehler |
| **B crawl** | `main.crawlRuns[0].checkedAt` | >28h | Crawl alt/nie | Niedrig (Marker lebt) |
| **B briefing** | `buildV3Briefing().generatedAt` | >30h ODER (≤30h & 0 items) | Briefing alt/leer | **Hoch (invers):** `generatedAt`=Buildzeit → nie „alt". Nur der 0-items-Zweig greift → **falsch-grün** möglich |
| **B lage** | `main-p-<id>.lageChecks[0].checkedAt` | >28h | Lage-Check alt | Niedrig (Marker frisch) |
| **B pipeline** | `main-p-<id>.pipelineDebugReports[0].createdAt` | >28h | „Pipeline seit Xh nicht durchgelaufen" | **SEHR HOCH — toter Marker, kein Schreiber** ⚠️ |
| **B errors** | `systemErrors` 24h-Zähler | >15 | Fehler-Spike | Mittel |
| **C operationalStatus** | crawl 14h / lage 4h (ODER) + briefing 18h | Backend≠supabase → „Achtung" | „Prüfen" statt „Bereit" | Mittel: 4h-Lage-Fenster eng; briefing blind |
| **C backendHealth** | 13 Einzelchecks, Score = passed/total | <90 „Prüfen", <70 „Kritisch" | jeder rote Teilcheck | „Pipeline-Debug"-Check **falsch-grün** (prüft nur `Boolean(debugReport?.counts)`, alter Report hat counts) |
| **D releaseCheck** | wie C + Radar/LiveFlow | irgendein Blocker → „Nicht pitchbereit" | strengstes Gate | Mittel |
| **E Admin-Kachel** | `crawlRuns` frühester Erfolg ≤ 07:30 Berlin | erster Erfolg >07:30 → warn | „Morgen-Check 7:30 nicht bestanden" | Mittel: kippt bei spätem ersten Tageslauf |
| **F Splash** | Client-Boot-Flags | 8s / 30s | „Neu laden"-Karte | Niedrig (rein UI) |

---

## 3. Belegte Fehlalarm-Ursache (Code + Prod-DB)

**Wachstum bestätigt (Pipeline lebt), Stand ~2026-07-12 10:04 UTC:**
| Signal | Wert |
|---|---|
| `raw_documents` max created | 2026-07-12 10:01 (Crawl läuft) |
| `knowledge_objects` max created | 2026-07-12 07:42 (Understanding läuft) |
| `decisions` max created | 2026-07-12 07:43 (Decisions laufen) |

**Die von den Watchdogs gelesenen Store-Timestamps (aus `helmut_store`-Blobs, verifiziert):**
| Blob | Array | letzter Eintrag | Alter | Zustand |
|---|---|---|---|---|
| `main` | crawlRuns (n=20) | **2026-07-12 07:43** | ~2,4h | **FRISCH** |
| `main` | lageChecks (n≈7) | 2026-06-30 10:01 | ~12 T | (global, unbenutzt) |
| `main` | pipelineDebugReports (n=4) | 2026-06-30 16:02 | ~12 T | TOT |
| `main-p-<pilot-mandats-id>` | lageChecks (n=10) | **2026-07-12 10:00** | ~0h | **FRISCH** |
| `main-p-<pilot-mandats-id>` | pipelineDebugReports (n=2) | **2026-07-06 15:24** | **~139h** | **TOT ⚠️** |
| `main-p-<pilot-mandats-id>` | crawlRuns | — | (n=0) | (crawlRuns liegen global in `main`) |

**Ursachenkette (verifiziert):**
1. `buildHealthReport` liest `pipelineH = hoursSince(getLatestPipelineDebugReport('<pilot-mandats-id>'))` = **~139h** (server.js:2573/2588).
2. Schwelle `pipelineH != null && pipelineH > 28` → `problems.push("Pipeline seit 139h nicht durchgelaufen")` (server.js:2607) → `ok=false` → WhatsApp „⚠️ Achtung".
3. **Aber:** `pipelineDebugReports` wird nur von `savePipelineDebugReport` geschrieben, und das hat **null Aufrufer** (bestätigt: nur Definition storage.js:1783 + Export 2601). Der letzte Eintrag (07-06) stammt aus dem abgeschalteten V2-Briefing-Lauf. Der Code-Kommentar server.js:2605 („wird am Ende jedes Briefing-Laufs geschrieben") ist **veraltet/falsch**.
4. `/api/cron/pipeline` fährt `runSourceCrawl` → schreibt `saveCrawlRun` (frisch) + KOs + Decisions, aber **nie** einen pipelineDebugReport.

⇒ **Der Alarm misst einen Zeitstempel, den die heutige Architektur prinzipiell nicht mehr aktualisiert, während der eigentliche Prozess nachweislich läuft.** Klassischer Fehlalarm. Verstärkt durch den **Profil-/Global-Mismatch** (frischer globaler Crawl-Marker + toter profil-scoped Pipeline-Marker im selben Report).

**Zweiter, inverser Latent-Fehler (falsch-grün):** `toBriefingContractV3` setzt `generatedAt = nowDate.toISOString()` bei jedem Read (briefingContract.js:743). Damit ist `briefingH ≈ 0` in `operationalStatus`/`backendHealth`/`pilotReadiness`/`releaseCheck`/`buildHealthReport` (server.js:2586). **Kein** timestamp-basierter Briefing-Frische-Check kann je „veraltet" erkennen. Bliebe Understanding stehen (KOs blieben `pending`), zeigten alle Timestamp-Checks weiter „frisch" — nur der 0-items-Zweig (server.js:2604) würde greifen. Genau der Fall, den Kernregel 5 verbietet.

---

## 4. Entworfene Zustandslogik (Design — NICHT umgesetzt)

**Leitidee:** Nie einen roten Gesamtausfall aus einem einzelnen Marker ableiten. Betriebszustand aus **zwei orthogonalen Achsen** aus **lebenden** Signalen:
- **Achse INGEST** (kommen Rohdaten/Verständnis rein?): `crawlRuns[0].createdAt`, `raw_documents`-24h, `knowledge_objects` complete letzte 24h, `decisions` letzte 24h.
- **Achse OUTPUT** (entsteht ein nutzbares Briefing?): `buildV3Briefing().available` (items>0) + Entscheidungs-/Beobachtungswert — **nicht** `generatedAt`.

Als „Pipeline-durchgelaufen"-Signal **`crawlRuns[0].createdAt` benutzen** (lebt); den toten `pipelineDebugReports`-Pfad fallenlassen **oder** erst nach Reaktivierung von `savePipelineDebugReport` nutzen.

| Zustand | Bedingung (Design-Schwellen) | Funktioniert | Funktioniert nicht | Nutzerwirkung | Betroffene Profile | Handlung | Sofort-Eingriff |
|---|---|---|---|---|---|---|---|
| **GESUND** | INGEST frisch (crawl <14h, ≥450 Quellen, Fehlerquote ≤10%) UND OUTPUT frisch (`available`, jüngstes complete-KO ≤24h) | Alles | – | Aktueller Stand | – | Keine | Nein |
| **RUHELAGE (gesund, still)** | INGEST frisch, OUTPUT `available` aber `react=0`/nur situational | Alles, keine akute Reaktion nötig | – | „Heute keine Reaktion nötig" | – | Keine | Nein |
| **TEILWEISE GESTÖRT** | genau **eine** Achse degradiert (z.B. Crawl 14-28h; oder complete-KO 24-48h; oder Lage-Check 4-28h) | Kern läuft | eine Teilfunktion verzögert | leicht veralteter Teilbereich, App nutzbar | ggf. einzelnes Profil | Beobachten | Nein |
| **VERALTET (stale)** | INGEST frisch (crawlt weiter!) ABER OUTPUT tot: kein neues complete-KO >36h ODER `available=false`/0 items trotz Crawls ODER alle KOs `pending` | Datenzufuhr | Briefing-Erzeugung (Understanding hängt) | „Alter Tagesstand", wirkt trügerisch grün | alle (KOs global) | Understanding-Lock/KI prüfen | **Ja** (stiller Ausfall) |
| **KRITISCHER AUSFALL** | Speicher≠supabase ODER kein Crawl >28h/nie ODER Understanding harter Fehler ODER ≥2 Achsen tot | – | Ingest **und** Output | Kein aktueller Stand | alle | Pipeline/Cron/Supabase prüfen | **Ja** |
| **ERHOLT (recovery)** | vorher VERALTET/KRITISCH, jetzt 2 Zyklen beide Achsen im GESUND-Fenster | Wiederhergestellt | – | „Wieder aktuell" | betroffene | Alarm auflösen | Nein |

**Konkrete Design-Schwellen** (aus vorhandenen Konstanten server.js:45-52 abgeleitet, ergänzt):
- Crawl frisch <14h (`maxFullCrawlAgeMs`), Warnung 14-28h, kritisch >28h/nie.
- Lage-Check frisch <4h (`maxLageCheckAgeMs`), Warnung 4-28h.
- Quellen: ≥450 geprüft, ≥405 Erfolg, Fehlerquote ≤0,10.
- **Neu OUTPUT-Frische:** jüngstes `knowledge_objects` mit `understanding_status='complete'` ≤24h = frisch; 24-36h = teilweise; >36h trotz frischem Crawl = **VERALTET**.
- **Recovery-Hysterese:** Zustand darf erst nach 2 aufeinanderfolgenden gesunden Auswertungen von „kritisch/veraltet" auf „gesund" springen (verhindert Flackern).
- Fehler-Spike: `errors24 > 15` bleibt (Warnung, kein Rot allein).

**Umsetzung der Kernregel 5:**
- „Kein rotes Gesamt-Rot bei laufenden Teilprozessen" → Zustand = Funktion **beider Achsen**; ein einzelner toter/alter Marker (`pipelineDebugReports`) darf **nie** allein `ok=false` erzeugen. Pipeline-Alarm an `crawlRuns[0].createdAt` hängen.
- „Kein Grün bei Crawl-ohne-Briefing" → **VERALTET**-Zustand explizit: INGEST frisch + OUTPUT tot ⇒ Alarm; dafür `available`/complete-KO-Frische statt `generatedAt` prüfen.

---

## 5. Diagnose-Hinweise (nur Analyse, nichts geändert)

1. **Fehlalarm abstellen:** In `buildHealthReport` (server.js:2588/2607) den `pipelineDebugReports`-Timestamp durch `crawlRuns[0].createdAt` (oder jüngstes complete-KO) ersetzen — **oder** `savePipelineDebugReport` am Ende von `runSourceCrawl` wieder aufrufen.
2. **Falsch-grün abstellen:** Briefing-Frische nicht über `generatedAt` (=Buildzeit, briefingContract.js:743), sondern über jüngstes `knowledge_objects.created_at`/`understanding_status='complete'`. Betrifft `operationalStatus`, `backendHealth` „Briefing-Frische", `pilotReadiness`, `releaseCheck`.
3. **Profil-/Global-Mismatch:** `getLatestCrawlRun` (global) und `getLatestPipelineDebugReport`/`getLatestLageCheck` (profil-scoped) im selben Urteil vereinheitlichen (storage.js:1741 vs. 1796).

---

## 6. Fachlich korrekt vs. technisch falsch (Watchdog)

| Meldung | Bewertung |
|---|---|
| „Pipeline seit 139h nicht durchgelaufen" bei laufendem Crawl | **technisch falscher Alarm** (toter Marker) |
| Briefing gilt immer als „frisch" (generatedAt=now) | **technisch falsch (false-green)** — kann echten Ausfall verdecken |
| Splash-Watchdog 8s/30s → „Neu laden" | **fachlich korrekt** (reines Boot-Sicherheitsnetz) |
| GitHub-Action prüft Live-Pipeline-Antwort | **fachlich korrekt** (robust gegen Timestamp-Probleme) |
| Admin-Kachel „Morgen-Check 7:30" bei spätem Erstlauf | **grenzwertig** (kann korrekt-spät als Warnung zeigen) |

---

## 7. Priorisierte Ursachen (Watchdog)

1. **P1 — Toter `pipelineDebugReports`-Marker erzeugt roten Fehlalarm** (Watchdog meldet falschen Systemzustand). Größter Vertrauensschaden. — ✅ **BEHOBEN** (2026-07-12): `buildHealthReport` nutzt den Marker nicht mehr; „Pipeline durchgelaufen" = lebender `crawlRuns[0].createdAt`. Auch der `backendHealth`-Check „Pipeline-Debug" hängt jetzt am Crawl-Timestamp statt an `debugReport.counts`.
2. **P1 — `generatedAt=now` macht Briefing-Frische blind** (false-green) → echter „Crawl-ohne-Briefing"-Ausfall würde als gesund gemeldet. — ✅ **BEHOBEN** (2026-07-12): OUTPUT-Frische misst das jüngste `knowledge_objects` mit `understanding_status='complete'` (`getLatestCompleteKnowledgeObjectAt`), verwendet in `buildHealthReport`, `operationalStatus`, `backendHealth`, `pilotReadiness`, `releaseCheck`. Schwelle 36h (ruhige Tage bleiben grün, echter Stau wird rot).
3. **P2 — Profil-/Global-Timestamp-Mismatch** im selben Urteil. — ✅ **entschärft**: der tote profil-scoped Pipeline-Marker wird nicht mehr gelesen; INGEST kommt aus dem globalen Crawl, OUTPUT aus den globalen KOs (konsistente Quellen).
4. **P2 — Zustandsmodell ohne INGEST/OUTPUT-Trennung, ohne Recovery-Hysterese** (Design in §4). — ✅ **UMGESETZT** (2026-07-12): `lib/helmut/watchdog-state.js` klassifiziert aus zwei Achsen in sechs Zustände (Gesund/Ruhelage/Teilweise gestört/Veraltet/Kritisch/Erholt) mit Recovery-Hysterese; 43/43 Unit-Tests (`scripts/watchdog-state-test.js`). Jede Meldung erklärt Was funktioniert / Was nicht / Wer betroffen / Was tun.

---

## 8. Tests, Belege, Grenzen

**Ausgeführt (offline, grün):** `watchdog-eval-test.js` 14/14, `splash-boot-test.js` 29/29, `admin-overview-test.js` 104/104, `current-helmut-state-test.js` 79/79.
**Abfragegrundlage:** Prod-Supabase `ddckuvvpcytqbyfmbvie`, nur SELECT (helmut_store-Blobs + V3-Tabellen). Datenstand 2026-07-12. Verwendetes Profil: `<pilot-mandats-id>`.
**Grenzen / VERMUTUNG:** `savePipelineDebugReport`-Aufruferlosigkeit ist per Repo-Grep belegt; ob nicht ein externer/manueller Pfad ihn doch triggert, ist unwahrscheinlich, aber read-only nicht 100% ausschließbar. Die entworfenen Schwellenwerte (§4) sind Design-Vorschläge, nicht empirisch kalibriert.
