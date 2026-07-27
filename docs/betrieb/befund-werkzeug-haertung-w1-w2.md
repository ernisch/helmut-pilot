# Befund W-1/W-2 — Werkzeug-Härtung: Lesefehler-Semantik und Lauftelemetrie

**Kanonisches Dokument** für die beiden am 2026-07-27 beim B4-4-Production-Nachweis
entdeckten Werkzeugdefekte (`CURRENT_STATE.md`,
[`../befund-csd-2026-vorgangsverlust.md`](../befund-csd-2026-vorgangsverlust.md) §18).

**Stand:** 2026-07-27 · Sprint „Werkzeug-Härtung W-1 + W-2" (PR #152 gemergt,
`54e9c12`) · **Phase B:** Migration angewendet und verifiziert (§14) ·
**Phase C:** Flag aktiviert, Dual-Write-Smoke über den echten Production-Pfad
bestanden (§15) — offen ist **nur noch** der Nachweis an einem echten
regulären Cron-Lauf (§15.5). Sprintstatus deshalb weiterhin
**teilweise abgeschlossen**.

---

## 1 · Beobachtete Production-Symptome

**W-1 — Lesefehler wird als leere Ergebnismenge behandelt.**
`listRawDocuments` lieferte bei jedem technischen Fehler (DNS, Timeout, Auth,
Storage) `[]`. Das Nachholwerkzeug `scripts/vorgangsbildung-nachholen.js` konnte
„Abfrage fehlgeschlagen" nicht von „erfolgreich, aber keine Kandidaten"
unterscheiden und meldete bei einem Lesefehler „Nichts nachzuholen" mit Exit 0 —
falsches Grün. In Production nicht eingetreten, durch Codeinspektion belegt.

**W-2 — Production-Läufe verschwinden aus `processRuns`.**
Der Nachweislauf `nachhol-20260727121511` (12:15 UTC, 2 Dokumente, +2 Knowledge
Objects, +2 LLM-Aufrufe) schrieb seinen Telemetrie-Eintrag um 12:15:54 — er fehlte
anschließend trotzdem. Die Store-Zeile `main-auth` stand weiter bei 148 Einträgen,
weit unter der Kappung (300). Der Aufruf war zusätzlich mit `.catch(() => {})`
abgesichert: ein Schreibfehler wäre ebenfalls unsichtbar gewesen.

## 2 · Root Cause

**W-1:** `listRawDocuments`/`listRecentRawDocuments` fingen jeden Fehler intern
(`catch` → `console.error` → `return []`). Schlimmer: `listKoDocumentLinks` und
`listKnowledgeObjectStates` gaben bei einem Fehler die bis dahin gelesene
**Teilmenge** zurück — unverknüpfte Dokumente erschienen dadurch fälschlich als
Nachhol-Kandidaten (unnötige KI-Kosten) bzw. Rückstände wurden unsichtbar. Der
`main().catch`-Pfad des Werkzeugs (Exit 1) war unerreichbar, weil nie etwas warf.

**W-2:** `recordProcessRun` lief als Lese-Ändere-Schreibe-Zyklus über den
**gesamten** Auth-Store-Blob (`helmut_store`, Zeile `main-auth`). Denselben Blob
schreiben parallel mit vollständigem Ersetzen der `data`-Spalte:
`recordLlmUsage` (bei **jedem** KI-Call), Sessions/Login, `systemErrors`,
`pipelineLocks` (Blob-Modus), `understandingRetries`, `adminRecoveryLastRun`,
`monitoringWebhookDelivery` u. a. (15 Top-Level-Keys). Jeder dieser Writer
überschreibt `processRuns` mit seinem — ggf. veralteten — Lesestand:
**Last-Write-Wins ohne jeden Fehler**. Der Verlust ist strukturell, kein
Timing-Zufall; die Suite `prozesslauf-telemetrie-test.js` stellt ihn mit
kontrolliertem Interleaving deterministisch nach. `.catch(() => {})`
(server.js, nachhol-Skript) verschluckte zusätzlich echte Schreibfehler.

## 3 · Gewählte Lösung

**W-1 — typisierte, geworfene Lesefehler.**
Die vier Lebenszyklus-Lesepfade werfen bei technischen Fehlern einen
`StorageReadError` mit `quelle` (Tabellenname) und inhaltsfreier `fehlerklasse`
(`dns`/`timeout`/`auth`/`connection`/`db`/`http-4xx`/`http-5xx`; Meldung durch
`redactSensitive` redigiert, cause-Kette von undici wird mitklassifiziert).
`[]` bedeutet ausschließlich „erfolgreich gelesen, null Zeilen";
`v3StoreReady()===false` bleibt bewusst `[]` (Konfigurationszustand, kein
Laufzeitfehler). Das Nachholwerkzeug bricht bei einem Lesefehler **vor** jeder
Bewertung, jedem KI-Aufruf und jedem Schreibzugriff mit **Exit 6** ab und nennt
Quelle + Fehlerklasse; „Nichts nachzuholen" gibt es nur noch nach erfolgreichem
Read. Vorschau und Ausführung reagieren identisch fail-closed.

**W-2 — Option B: relationale Tabelle `public.process_runs`.**
Migration `20260727_process_runs_relational.sql` (+ Rollback), Muster
`20260720_crawl_runs_relational`: **eine** Zeile je `(run_id, process)`
(Primärschlüssel = Idempotenz-Anker), atomarer Upsert über PostgREST
`on_conflict` + `merge-duplicates` — append-only, parallel-sicher, unabhängig von
der Blob-Größe. CHECK-Constraint auf die sechs kanonischen Zustände `running` ·
`success` · `partial` · `failed` · `blocked` · `rolled_back`; historische
Blob-Werte werden im Code abgebildet (`ok`→`success`, `skipped`→`blocked`,
`error`→`failed`, `empty`→`success`), Unbekanntes wird **nicht** still umgedeutet,
sondern läuft sichtbar in den Constraint. Felder: Run-ID, Prozess, Status, Start-/
Endzeit, Dauer, Zielmenge, verarbeitet/gespeichert/übersprungen/fehlgeschlagen/
zurückgestellt, Grund-Code, Fehlerklasse, Backend, Commit-Referenz, sanitisierte
Zählerkarten (`telemetrie` jsonb).

`recordProcessRun` liefert ein Ergebnisobjekt
`{ ok, vollstaendig, gespeichert: {relational, blob}, fehler[], eintrag }` statt
still `null`; jeder Telemetriefehler wird strukturiert geloggt
(`[processRun] TELEMETRIEFEHLER …` mit runId), als `systemError` erfasst
(dedupliziert) und von den Aufrufern im Abschlussstatus ausgewiesen
(`lauftelemetrie` in den Cron-Antworten; **Exit 7** im Nachholwerkzeug bei
„fachlich gelaufen, Telemetrie nicht gespeichert"). `recordProcessRunStart`
schreibt einen `running`-Startbeleg (nur relational): ein hart sterbender Lauf
(z. B. Serverless-504 — der zweite Verlustmodus aus dem Production-Befund)
hinterlässt damit eine sichtbare Spur. Der Blob-Pfad ist jetzt idempotent je
`(runId, process)`.

## 4 · Verworfene Alternativen

- **Option A (bestehende Tabelle mitnutzen):** `source_crawl_telemetry` ist je
  Quellenabruf, `llm_budget_counters` ein Tageszähler, `crawl_runs` (20260720)
  je Crawl-Lauf — jede Nutzung wäre Zweckentfremdung mit falschem Schema.
- **Option C (CAS auf dem Blob):** ein Compare-and-Swap nur in `recordProcessRun`
  schützt nicht — **jeder andere** Auth-Store-Writer ersetzt die `data`-Spalte
  weiter vollständig. CAS für alle ~15 Writer wäre ein Umbau des gesamten
  Auth-Stores und bliebe an die Blob-Größe gekoppelt.
- **Option D (Blob + Lock):** ein zusätzlicher verteilter Lock um jeden
  Auth-Store-Write serialisiert Login, KI-Logging und Cron-Pfade gegeneinander
  (Latenz, Deadlock-Risiko) und kaschiert das Strukturproblem nur.
- **W-1 als Textanalyse der Fehlermeldung im Aufrufer:** ausdrücklich
  ausgeschlossen; stattdessen typisierter Fehler an der Quelle.

## 5 · Fehler- und Exit-Code-Semantik (`vorgangsbildung-nachholen.js`)

| Exit | Bedeutung |
|---|---|
| 0 | Erfolg — auch der **erfolgreiche** Leerlauf („Nichts nachzuholen" nach gelungenem Read) |
| 1 | unerwarteter Fehler (`main().catch`) |
| 2 | Argumentfehler |
| 3 | Konfiguration unvollständig (v3-Store nicht bereit) |
| 4 | Mengen-/Fremd-Riegel |
| 5 | `HELMUT_NACHHOLEN_BESTAETIGT` fehlt |
| **6** | **technischer Lesefehler** — kein KI-Aufruf, kein Write, nie „nichts nachzuholen" |
| **7** | **fachlich gelaufen, Lauftelemetrie nicht gespeichert** — Lauf nicht wiederholen (idempotent, aber KI-Kosten), erst Telemetrie-Speicher prüfen |

## 6 · Parallelitäts- und Idempotenzgarantie

Relational: der Primärschlüssel `(run_id, process)` macht jeden Write zu einem
atomaren Upsert — n parallele Läufe ergeben n Zeilen (offline mit 2 und 10
parallelen, deterministisch verschränkten Writern belegt; gegen echtes
PostgreSQL 16 mit `scripts/process-runs-pgverify.sh`, 21/21). Wiederholtes
Schreiben derselben Kennung aktualisiert die eine Zeile (Start → Abschluss),
dupliziert nie. Fehlt die Run-ID, wird sie deterministisch aus Prozess +
Startzeit abgeleitet (`runIdAbgeleitet`-Markierung). Der Blob bleibt bis zur
Freigabe Last-Write-Wins-behaftet — dokumentierte Übergangsphase, siehe §10.

## 7 · Datenschutz

Unverändert ausschließlich technische Skalare, Zähler, klassifizierte
Fehlerklassen und Kennungen — keine Dokumentinhalte, keine PII, keine Secrets
(`sanitizeProcessRun`-Allowlist; Fehlermeldungen laufen durch `redactSensitive`;
Production-Messung §11: keine verdächtigen Feldnamen im Bestand). Neue Tabelle:
RLS aktiv, alle Rechte für `public`/`anon`/`authenticated` entzogen,
Retention-Klassifikation `technische-telemetrie`, 90 Tage
(`lib/helmut/retention.js`, `aufbewahrung-loeschung.md`).

## 8 · Rollback

- **Code:** Revert des PR; kein Datenformat wurde verändert (Blob-Einträge sind
  additiv erweitert, alte Leser ignorieren neue Felder).
- **Migration:** `20260727_process_runs_relational_rollback.sql` entfernt die
  Tabelle; Flag `HELMUT_PROCESS_RUNS_RELATIONAL` aus → Code fällt fail-safe auf
  den Blob zurück. Während Dual-Write enthält der Blob dieselben
  Abschluss-Einträge; nur reine `running`-Startbelege gingen verloren.

## 9 · Migrationsbedarf

**Erledigt am 2026-07-27, 14:03 UTC** (Betreiberfreigabe Phase B):
`20260727_process_runs_relational.sql` ist auf Production **angewendet** und als
`20260727140343 / 20260727_process_runs_relational` in der Migrationshistorie
registriert. Vollständiger Ausführungs- und Verifikationsnachweis: §14.

Ohne Flag bleibt der relationale Pfad trotz vorhandener Tabelle ein No-Op (die
Aktivierung ist der zweite, getrennte Schritt — siehe §14.4). Mit Flag, aber
ohne Migration hätte der Blob-Spiegel den Lauf gehalten und der Fehler wäre
sichtbar geworden (`ok=false`) — dieser Fall ist damit gegenstandslos.
Aktivierungsreihenfolge: [`blob-relational-migration-plan.md`](blob-relational-migration-plan.md),
Freigabepunkt 4.

## 10 · Übergangsstrategie (klar begrenzt, kein Dauerzustand)

| Phase | Zustand | Verlustrisiko |
|---|---|---|
| 1 | Blob only — idempotent, Fehler sichtbar | Last-Write-Wins bleibt (dokumentiert) |
| 1b | Migration angewandt, Flag AUS | wie Phase 1 (Last-Write-Wins besteht fort) |
| **2 (seit 2026-07-27, 14:23 UTC)** | **Flag AN** — relational kanonisch + Blob-Spiegel; Dual-Read bevorzugt relational | keines für Läufe (relational); Spiegel best effort, Ausfall sichtbar |
| 3/4 (je eigene Freigabe) | Lesepfad nur relational · Blob-Key abschalten | keines |

Phase 2 ist seit dem Redeploy um 14:23 UTC aktiv und über den echten
Dual-Write-Pfad bewiesen (§15). „Best Effort" ist kein Endzustand der
kanonischen Production-Lauftelemetrie — Phase 3/4 bleiben eigene
Freigabeschritte, sind aber **nicht** Voraussetzung für die Verlustfreiheit.

## 11 · Read-only Production-Befund (2026-07-27, nach 12:37 UTC)

Ausschließlich GET-Anfragen; keine Reparatur, keine Datenmigration.

1. **149 `processRuns`-Einträge** (Kappung 300 nicht erreicht); je Prozess:
   understanding-eager 67 · understanding-lage 39 · understanding-cron 22 ·
   briefing-morning 11 · briefing-lage 8 · understanding-nachhol 2.
2. **Zeitraum** 2026-07-16 bis 2026-07-27 (12 Tage, jeder Tag vertreten).
3. **Lücken auf Laufebene trotz belegter Aktivität:** von 109 distinct
   `run_id`s der `source_crawl_telemetry` (14 Tage, alle im Blob-Zeitraum)
   fehlen **4** vollständig in `processRuns` (`crawl-20260722160005`,
   `crawl-20260723040125`, `crawl-20260725040353`, `lage-20260727100425`).
   Zusätzlich fehlt der dokumentierte Lauf **`nachhol-20260727121511`**
   dauerhaft (sein Nachfolger 12:36 und der 10:29-Lauf sind vorhanden) —
   zusammen **mindestens 5 unsichtbare Läufe in 12 Tagen**. Untergrenze:
   zählbar sind nur Läufe, die andere Telemetrie hinterlassen haben.
   `llm_budget_counters` (36–70 Calls/Tag, lückenlos 15.–27.07.) und
   `knowledge_objects.updated_at` (täglich 16–236 Zeilen) belegen durchgehende
   fachliche Aktivität.
4. **Blob-Größe:** Zeile `main-auth` = **1 104 347 Bytes** (~1,1 MB); Anteil
   `processRuns` 49 513 Bytes (149 Einträge). Haupttreiber `llmUsage`
   (2 564 Einträge), daneben Sessions (41), systemErrors (67).
5. **Gleichzeitige Writer:** alle §2 genannten Pfade laufen als parallele
   Serverless-Funktionen (Crons crawl/pipeline/understanding/briefing/lage,
   Login/Session, Admin, Skripte).
6. **Migration:** `process_runs` existierte zum Messzeitpunkt in Production
   **nicht** (404 — erwartungsgemäß; seit 14:03 UTC angewandt, §14).
   Historisch zu übernehmen wären 149 Einträge; durch den Dual-Read ist
   **keine** Datenmigration nötig (Altbestand bleibt lesbar — in §14.5 an den
   echten 149 Einträgen belegt).
7. **Sensible Inhalte:** keine — Feldnamen ausschließlich technisch.
8. **Leser:** `/api/admin/stats/process-runs` (Admin „Pipeline"),
   `/api/admin/stats/run-costs` (`getRunCostReport`, Punkt 17),
   `getVorgangsbildungKennzahlen` (B4-Kennzahlen), `scripts/kostenmessung-nachweis.js`.

## 12 · Teststand

- `werkzeug-lesefehler-test.js` **43/43** (Modul- und CLI-Ebene, lokale Stubs,
  strikt allowlistete Kindumgebung — erbt nie Production-Env).
- `prozesslauf-telemetrie-test.js` **37/37** (deterministische
  Last-Write-Wins-Reproduktion, 2/10 parallele Writer, Idempotenz, Lebenszyklus,
  alle sechs Zustände, Fehler-Sichtbarkeit, Kappung, Altbestand, Übergang, Exit 7).
- `process-runs-pgverify.sh --eigenes-cluster` **21/21** gegen echtes
  PostgreSQL 16 (Migration, Idempotenz, PK, CHECK, Upsert, RLS, Rollback).
- Mutationsprobe `werkzeug-haertung-mutationsprobe.js` **8/8 Mutationen rot**
  (M1 Fehler→`[]` · M2 Exit 0 · M3 „nichts nachzuholen" · M4 Append→RMW ·
  M5 Idempotenz raus · M6 ok erzwungen · M7 Fehler verschluckt ·
  M8 Status-Kanonisierung raus) + 2 grüne Vorbedingungen. Keine logisch
  äquivalenten Mutationen im Set.
- Offline-Suite **155/169** in dieser Cloud-Sandbox — die **14** roten Suiten
  sind **byte-identisch** zur `origin/main`-Baseline in derselben Sandbox
  (153/167; Netz-Guard-/Umgebungsartefakte) und in CI grün. Kein neuer Rotfall
  durch diesen Sprint; `env-inventar-test` (38/38) und `retention-test` (18/18)
  nach den Doku-/Klassifikations-Ergänzungen grün. Browser-Smoke **32/32**.

## 13 · Verbleibende Risiken

1. **Bis zur Flag-Aktivierung** verliert der Blob-Pfad parallele Läufe weiter —
   jetzt dokumentiert und je Werkzeuglauf sichtbar, aber vorhanden. Die
   Migration allein ändert daran **nichts** (Zustand 1b, §10). Betroffen sind
   auch `getRunCostReport`-Zuordnungen (Punkt 17).
2. Der Blob-**Spiegel** in Phase 2 bleibt Last-Write-Wins; bis Phase 3 kann die
   Admin-Ansicht einen Lauf später zeigen als die relationale Wahrheit (der
   Dual-Read gleicht das bereits aus, wo er verwendet wird).
3. `recordLlmUsage`/Sessions/systemErrors schreiben den 1,1-MB-Blob weiter
   RMW — deren Verlustrisiko ist **nicht** Gegenstand dieses Sprints (P0-5-Plan).
4. Startbelege existieren nur relational; vor der Freigabe bleibt ein hart
   sterbender Lauf unsichtbar (wie bisher).
5. `listSourceCrawlTelemetry` liefert bei Lesefehlern weiterhin `[]`
   (bewusst: Störungserkennung meldet dann „keine Telemetrie" — eigener
   Ehrlichkeitspfad); nicht Teil der W-1-Werkzeugkette.
6. Der **Blob-Spiegel-Schreibpfad** von `recordProcessRun` ist gegen Production
   noch nicht ausgeführt worden (§14.6) — bewusst, um aus einer Sitzung heraus
   keinen Voll-Blob-RMW auf `main-auth` auszulösen. Er ist unveränderter
   Bestandscode; die einzige Änderung an ihm (Idempotenzfilter) ist offline
   und mutationsgeprüft belegt.

---

## 14 · Phase B — Production-Aktivierung (2026-07-27, Betreiberfreigabe)

Der Betreiber hat am 2026-07-27 die Migration, die Flag-Aktivierung und **einen**
Telemetrie-Smoke freigegeben. Ergebnis: **Migration angewendet und vollständig
verifiziert, Smoke bestanden — die Flag-Aktivierung konnte aus der Sitzung
technisch nicht ausgeführt werden** (§14.4). Zustand: **1b** (§10).

### 14.1 Vorprüfung (14:02 UTC)

| Prüfung | Ergebnis |
|---|---|
| PR #152 gemergt | `54e9c12` auf `main` |
| CI-Pflicht-Checks | `Syntax + Offline-Suiten` **success**, `Browser-/Mobile-Smoke (Chromium)` **success** |
| Production-Deployment | `dpl_C2ErVsq7sEWyFb3xJTughKx43K5y`, target `production`, **READY**, Commit `54e9c12` |
| Aktive Sperren | **0** (`pipeline_locks`: 2 Zeilen, beide abgelaufen; Blob-`pipelineLocks`: 4 Einträge, ältestes `expiresAt` ≈ 6,8 Tage alt) |
| Laufendes Cron-Fenster | nein — nächster Cron `/api/cron/pipeline` 16:00 UTC, ~2 h Abstand |
| Zielprojekt | Supabase `ddckuvvpcytqbyfmbvie` = Host aus `SUPABASE_URL` (gegengeprüft) |

**Ausgangsmessung:** `knowledge_objects` 1 142 · `ko_document_links` 4 143 ·
`raw_documents` 8 929 · `pending` 426 · `failed` 7 · LLM-Zähler heute **55** ·
Blob `main-auth` **1 104 347 Bytes** mit **149** `processRuns` ·
`process_runs` **nicht vorhanden**.

### 14.2 Migration (14:03 UTC)

`supabase/migrations/20260727_process_runs_relational.sql` **unverändert**
angewendet, registriert als `20260727140343 / 20260727_process_runs_relational`.
Kein anderes SQL, keine Datenmigration.

### 14.3 Verifikation — keine Abweichung

- **22 Spalten** in exakter Reihenfolge, Typ, Nullability und Default wie in der
  Datei (`run_id`/`process` `not null`; `status` Default `'running'`;
  `created_at` Default `now()`; `run_id_derived` Default `false`; `telemetrie` jsonb).
- **Primärschlüssel** `process_runs_pkey PRIMARY KEY (run_id, process)`.
- **CHECK** `process_runs_status_check` mit exakt `running, success, partial,
  failed, blocked, rolled_back`.
- **Indizes** `idx_process_runs_created (created_at)`,
  `idx_process_runs_process (process, created_at)` + Unique-Index des PK.
- **RLS aktiv**, **0 Policies** (deny-all für Nicht-BYPASSRLS-Rollen).
- **Grants** ausschließlich `postgres` und `service_role`; für
  `anon`/`authenticated`/`PUBLIC` **0 Rechte**.
- **Tabellenkommentar** gesetzt, **0 Zeilen** bei Anlage.
- **Supabase-Advisor:** `process_runs` erscheint als `rls_enabled_no_policy`
  **INFO** — identisch zu 16 bestehenden Tabellen (`source_crawl_telemetry`,
  `pipeline_locks`, `llm_budget_counters` …), also das etablierte Projektmuster.
  **Kein neuer WARN/ERROR**; der einzige WARN (`extension_in_public: vector`)
  ist Bestand und unabhängig.

### 14.4 Flag-Aktivierung — in Phase B nicht ausführbar (inzwischen erledigt, §15)

> **Nachtrag:** der Betreiber hat das Flag am 2026-07-27 selbst gesetzt und
> Production neu deployt (§15.1). Der folgende Abschnitt dokumentiert, **warum**
> dieser Schritt nicht aus der Sitzung heraus möglich war — die Einschränkung
> gilt unverändert für künftige Env-Änderungen.

`HELMUT_PROCESS_RUNS_RELATIONAL=on` konnte **nicht** gesetzt werden:

- Der Vercel-MCP-Zugang dieser Sitzung ist **rein lesend** (Projekte,
  Deployments, Logs, Analytics) — es gibt **kein** Werkzeug für
  Environment-Variablen. Kein `VERCEL_TOKEN`, kein `vercel`-CLI, keine
  `.vercel/project.json`.
- `helmut-flags.json` ist **kein** Ersatz: feste Allowlist
  (`HELMUT_UNDERSTANDING_GATE`, `HELMUT_PARDOK_DISPATCH`, `HELMUT_SOURCE_MODE`,
  `HELMUT_LANDESMODULE`) ohne diesen Schlüssel; zusätzlich liest
  `processRunsRelationalEnabled()` bewusst direkt `process.env` statt über
  `lib/helmut/flags.js`. Ein Dateieintrag wäre wirkungslos, ihn wirksam zu
  machen wäre eine Code-Änderung samt Merge — außerhalb dieser Freigabe.

**Folge (Stand Phase B):** Production-Crons schrieben weiterhin Blob-only.
**Erforderliche Betreiberaktion:** in Vercel (Projekt `helmut-pilot`, Team
`nohut`) `HELMUT_PROCESS_RUNS_RELATIONAL=on` für Production setzen und
redeployen — **am 2026-07-27 um 14:23 UTC erfolgt** (§15.1). Ein Rückweg ist
jederzeit derselbe Schalter auf `off`.

### 14.5 Telemetrie-Smoke (14:06:58–14:07:00 UTC) — bestanden

Da der Vercel-Schalter blockiert war, lief der freigegebene Smoke
**sitzungsgebunden**: das Flag wurde **ausschließlich als Präfix an genau diesen
einen Befehl** gesetzt (keine Vercel-Env, kein Export, keine Persistenz), über
den **echten** Production-Codepfad `storage.recordProcessRun` /
`recordProcessRunStart`. **Kein Crawl, kein KI-Aufruf, keine fachliche
Datenänderung.**

Bewusste Absicherung: `HELMUT_STORAGE_BACKEND=local` — die **Blob-Seite** des
Dual-Writes ging in eine lokale (gitignorierte) Datei, **nicht** in die
1,1-MB-Production-Zeile `main-auth`. Damit wurde aus einer Sitzung heraus genau
der Voll-Blob-RMW **nicht** ausgelöst, den dieser Befund als Verlustquelle
nachweist. Der kanonische (relationale) Pfad lief unverändert gegen Production.

**Drei Schreibvorgänge auf EINE Laufkennung** (`phase-b-20260727140658`,
Prozess `telemetrie-smoke`): Startbeleg `running` → Abschluss `success` →
identische Wiederholung. Alle drei meldeten `ok: true`, `fehler: []`.

| Beweisfrage | Ergebnis |
|---|---|
| Genau eine relationale Zeile? | **1** Zeile in `process_runs` (gesamt **1**) |
| Dublette? | **0** (Gruppierung über `(run_id, process)`) |
| Start → Abschluss auf derselben Zeile? | ja — `status` **success**, `started_at` 14:06:58.361, `finished_at` 14:07:00.509 |
| Dual-Read liefert Blob-Historie **und** neuen Lauf? | **150 = 149 Blob + 1 relational**, korrekt nach Zeit sortiert (Smoke zuoberst), Altbestand mit Alt-Status `ok` unverändert lesbar |
| Gegenprobe mit Flag AUS | **149**, Smoke **nicht** sichtbar — das Flag steuert die Strecke tatsächlich |
| Inhalt der Zeile | nur technische Skalare; `error_class`/`commit_ref`/`telemetrie` `null`, **keine** PII, **kein** Volltext |

`backend` steht in der Zeile ehrlich auf `local` — das beschreibt die
Blob-Seite dieses einen Smokes, nicht den Production-Betrieb.

### 14.6 Nichts anderes verändert (14:08 UTC gegengemessen)

| Größe | vorher | nachher |
|---|---|---|
| `knowledge_objects` | 1 142 | **1 142** |
| `ko_document_links` | 4 143 | **4 143** |
| `raw_documents` | 8 929 | **8 929** |
| `pending` / `failed` | 426 / 7 | **426 / 7** |
| LLM-Zähler heute | 55 | **55** (0 KI-Aufrufe) |
| Blob `main-auth` | 1 104 347 Bytes | **1 104 347 Bytes** (byte-identisch) |
| Blob `processRuns` | 149 | **149** |
| aktive Locks | 0 | **0** |

Seit der Ausgangsmessung: **0** geänderte Knowledge Objects, **0** neue
Verknüpfungen, **0** neue Rohdokumente, **0** neue Telemetriezeilen. Der
Production-Auth-Blob enthält den Smoke-Lauf **nicht** (`smoke_im_blob: false`);
`llmUsage` 2 564, `sessions` 41, `systemErrors` 67 unverändert. Die
Blob-Seite des Smokes liegt nachweislich in der lokalen Datei (1 Eintrag).

> **Messhinweis:** eine erste Gegenmessung ließ den Blob scheinbar wachsen
> (1 104 347 → 1 197 493). Das war ein reines **Messartefakt** —
> `octet_length(data::text)` in Postgres serialisiert `jsonb` mit Trennzeichen-
> Leerraum, `JSON.stringify` nicht. Mit der Methode der Ausgangsmessung
> gemessen ist der Wert byte-identisch. Der Unterschied ist hier festgehalten,
> damit er nicht erneut als Veränderung fehlgedeutet wird.

### 14.7 Nebenbefund: Migrationsliste war falsch (Teil von Phase B)

Beim Lesen der Migrationshistorie zeigte sich, dass
`20260721_security_advisor_hardening` **angewendet ist** (registriert
`20260716221109`), während `CLAUDE.md` §5 und `ARCHITECTURE.md` §6 es als
„nicht angewandt" führten. Faktisch gegengeprüft statt dem Namen vertraut: alle
sechs von der Migration adressierten Funktionen (`helmut_set_updated_at`,
`match_knowledge_objects`, `helmut_reserve_llm_call`,
`helmut_acquire_pipeline_lock`, `helmut_release_pipeline_lock`,
`helmut_ensure_profile`) tragen in Production `search_path=public, pg_temp`.
Beide Dokumente sind korrigiert. **Offen ist damit nur noch `20260720`.**

---

## 15 · Phase C — Abnahme nach der Flag-Aktivierung (2026-07-27)

Der Betreiber hat `HELMUT_PROCESS_RUNS_RELATIONAL=on` gesetzt und Production
neu deployt. Diese Abnahme prüft, ob die relationale Lauftelemetrie im echten
Betrieb wirkt. **Ergebnis: Phasen 1–4 der Abnahme vollständig bestanden; offen
ist ausschließlich der Nachweis an einem echten regulären Cron-Lauf (§15.5).**

### 15.1 Deployment (14:23 UTC) — erfüllt

| Prüfung | Ergebnis |
|---|---|
| Neues Production-Deployment | **`dpl_AfputRmtSgFGp7P4bTokBg37rMhP`**, target `production`, **READY**, erstellt **14:23:14 UTC** |
| Auslöser | `action: "redeploy"` auf `originalDeploymentId dpl_C2ErVsq7sEWyFb3xJTughKx43K5y`, **derselbe** Commit — Signatur einer reinen Env-Änderung |
| Deployter Commit | `54e9c12` = Merge-Commit von PR #152, enthält #152 vollständig |
| CI des deployten Commits | Workflow-Lauf **30272642696** (`push` auf `main`), **completed/success** |
| Migration weiterhin registriert | ja (`20260727140343`) |
| Schema unverändert | Tabelle da · RLS aktiv · **0** Policies · **0** Rechte für anon/authenticated/PUBLIC · PK `(run_id, process)` · 1 CHECK · 3 Indizes · 22 Spalten |

**Ehrliche Grenze:** der Flag-**Wert** ist aus einer Sitzung nicht lesbar
(Vercel-Env ist „sensitive"). Der Redeploy belegt, *dass* die Konfiguration
geändert wurde, nicht *was*. Die Wirksamkeit ist deshalb über das tatsächliche
Verhalten zu beweisen — §15.3/§15.4 belegen den Codepfad, §15.5 steht für den
Beweis im unbeeinflussten Regelbetrieb aus.

### 15.2 Sicherheitsgates + Ausgangsmessung (14:28 UTC)

0 aktive `pipeline_locks` · kein Crawl (letztes Rohdokument 10:03:19, letzte
`source_crawl_telemetry` 10:04:50) · kein Lage-/Understanding-Lauf (letzte
KO-Änderung 12:36:58) · Schreibgate konsistent · nächster regulärer Cron
**16:00 UTC** (`/api/cron/pipeline`).

Ausgangszahlen: `process_runs` **1** · Blob-`processRuns` **149** ·
`knowledge_objects` **1 142** · `ko_document_links` **4 143** ·
`raw_documents` **8 929** · LLM-Zähler heute **55** · aktive Locks **0**.
**Blob-Prüfsumme der 149 Bestandseinträge:** `6e76e22fe8bba22afe70556ad4df5f51`.

### 15.3 Smoke über den ECHTEN Production-Pfad (14:29:35–14:29:41 UTC)

Anders als in Phase B **ohne lokale Umgehung**: `HELMUT_PROCESS_RUNS_RELATIONAL=on`
**und** `HELMUT_STORAGE_BACKEND=supabase` → voller Dual-Write wie in Production,
inklusive Blob-Spiegel. Dokumentierter Smoke-Pfad unverändert genutzt
(`storage.recordProcessRunStart` + `storage.recordProcessRun`), **keine neue
Testfunktion**. Kein Crawl, kein KI-Aufruf, keine fachliche Datenänderung.

Run-ID **`abnahme-20260727142935`**, Prozess `telemetrie-smoke`, drei
Schreibvorgänge auf **eine** Kennung: Startbeleg `running` → Abschluss
`success` → identische Wiederholung. Alle drei: `ok: true`,
`gespeichert {relational: true, blob: true}`, `fehler: []`.

### 15.4 Verifikation — alle zwölf Punkte erfüllt

| # | Kriterium | Ergebnis |
|---|---|---|
| 1 | genau eine relationale Zeile | **1** |
| 2 | keine Dublette | **0** |
| 3 | Start-/Endzeit | `started_at` 14:29:35.921 · `finished_at` 14:29:41.082 · `duration_ms` **5 161** |
| 4 | Status | **success** (aus `running` fortgeschrieben — eine Zeile, kein zweiter Datensatz) |
| 5 | Process-Typ | `telemetrie-smoke` |
| 6 | Dual-Read: Blob-Historie **und** neuer Lauf | **151 = 2 relational + 149 Blob**; der neue Lauf steht durch den Dual-Write in **beiden** Quellen, erscheint aber **genau 1×** — die Dedup über `(runId, process)` greift |
| 7 | abgeschaltete relationale Lesestrecke | **150** über den Blob-Spiegel; der **nur relationale** Phase-B-Lauf ist dort **unsichtbar** — der relationale Pfad liefert nachweislich Daten, die der Blob nicht hat |
| 8 | kein Verlust/Überschreiben anderer relationaler Runs | `phase-b-20260727140658` **unverändert vorhanden**, gesamt **2** Zeilen |
| 9 | Blob-Altbestand unverändert | 149 → **150** (neuer Eintrag vorangestellt); Prüfsumme der übrigen 149 = `6e76e22fe8bba22afe70556ad4df5f51` — **byte-identisch zur Ausgangsmessung** |
| 10 | keine Änderung an Fachtabellen | KO **1 142** · Links **4 143** · Rohdok **8 929**; seit Baseline **0** geändert/neu |
| 11 | kein LLM-Budgetverbrauch | **55 → 55** |
| 12 | keine neuen Locks | **0** |

`backend` der neuen Zeile steht auf **`supabase`** (die Phase-B-Zeile trägt
`local` — dort lief die Blob-Seite bewusst lokal). **Kein Abbruchkriterium
eingetreten, kein Rückweg genutzt.**

**Stärkster Einzelbeweis gegen Last-Write-Wins:** der Smoke aus Phase B steht
nach dem zweiten, unabhängigen Schreibvorgang unverändert in `process_runs`.
Auf dem Blob-Pfad hätte ein zweiter Writer ihn überschreiben können; relational
stehen beide Läufe nebeneinander.

### 15.5 Echter regulärer Production-Lauf — ZEITLICH OFFEN

Zum Messzeitpunkt **14:36 UTC** hatte seit der Flag-Aktivierung (14:23:14 UTC)
**noch kein** regulärer Production-Lauf stattgefunden: `process_runs` enthielt
unverändert die **2** Smoke-Zeilen, **0** neue seit 14:30; letzte
`source_crawl_telemetry` 10:04:50, letztes Rohdokument 10:03:19, letzte
KO-Änderung 12:36:58, 0 aktive Locks, LLM-Zähler 55.

Der nächste reguläre Lauf ist **`/api/cron/pipeline` um 16:00 UTC**
(→ `runSourceCrawl` → `recordProcessRun` mit Prozess `understanding-eager`).
**Es wurde nichts künstlich gestartet** — ein erzwungener Crawl würde KI-Budget
verbrauchen und wäre kein Beleg für den unbeeinflussten Regelbetrieb.

Nachzuweisen bleibt: Run-ID ermitteln · relational vorhanden · Start/Ende/
Status/Kennzahlen plausibel · Zeile nach späteren Writes **erhalten** ·
Abgleich mit `source_crawl_telemetry` (gleiche `run_id`), Locks, Budget und
Fachtelemetrie · Blob-Spiegel trägt denselben Lauf.

### 15.6 Erfolgskriterien-Stand

**Erfüllt:** Deployment READY (1) · Migration aktiv (2) · Smoke erzeugt genau
eine relationale Zeile (4) · Idempotenz (5) · Dual-Read (6) · Blob-Historie
lesbar (7) · keine Fachdatenänderung (8) · kein KI-Aufruf (9) · kein
Last-Write-Wins-Verlust auf dem neuen Pfad erkennbar (12) · kein Rückweg nötig (13).

**Offen:** Wirksamkeit des Flags im Regelbetrieb (3, nur über §15.5 endgültig
belegbar) · echter Production-Lauf relational sichtbar (10) · dieser Lauf nach
späteren Writes erhalten (11).

**Sprintstatus bleibt daher `teilweise abgeschlossen`.** Er wird erst auf
`erfolgreich abgeschlossen` gesetzt, wenn 3, 10 und 11 belegt sind — ein
vorheriges Umstellen wäre falsches Grün.
