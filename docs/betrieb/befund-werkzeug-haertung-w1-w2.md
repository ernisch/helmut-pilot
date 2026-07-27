# Befund W-1/W-2 — Werkzeug-Härtung: Lesefehler-Semantik und Lauftelemetrie

**Kanonisches Dokument** für die beiden am 2026-07-27 beim B4-4-Production-Nachweis
entdeckten Werkzeugdefekte (`CURRENT_STATE.md`,
[`../befund-csd-2026-vorgangsverlust.md`](../befund-csd-2026-vorgangsverlust.md) §18).

**Stand:** 2026-07-27 · Sprint „Werkzeug-Härtung W-1 + W-2" ·
Branch `claude/werkzeug-haertung-w1-w2-fvmbwj`

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

`20260727_process_runs_relational.sql` ist **nicht angewandt** (freigabepflichtig,
CLAUDE.md §5). Ohne Migration + Flag ist der relationale Pfad ein No-Op; mit
Flag, aber ohne Migration hält der Blob-Spiegel den Lauf und der Fehler wird
sichtbar (`ok=false`) — kein Ausfall vor der Migration. Aktivierungsreihenfolge:
[`blob-relational-migration-plan.md`](blob-relational-migration-plan.md),
Freigabepunkt 4.

## 10 · Übergangsstrategie (klar begrenzt, kein Dauerzustand)

| Phase | Zustand | Verlustrisiko |
|---|---|---|
| 1 (heute) | Blob only — idempotent, Fehler sichtbar | Last-Write-Wins bleibt (dokumentiert) |
| 2 (nach Migration + Flag) | relational kanonisch + Blob-Spiegel; Dual-Read bevorzugt relational | keines für Läufe (relational); Spiegel best effort, Ausfall sichtbar |
| 3/4 (je eigene Freigabe) | Lesepfad nur relational · Blob-Key abschalten | keines |

„Best Effort" ist damit ausdrücklich **kein** Endzustand der kanonischen
Production-Lauftelemetrie — Phase 2 ist der nächste Freigabeschritt.

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
6. **Migration:** `process_runs` existiert in Production **nicht** (404 —
   erwartungsgemäß). Historisch zu übernehmen wären 149 Einträge; durch den
   Dual-Read ist **keine** Datenmigration nötig (Altbestand bleibt lesbar).
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

1. **Bis zur Freigabe** (Migration + Flag) verliert der Blob-Pfad parallele
   Läufe weiter — jetzt dokumentiert und je Werkzeuglauf sichtbar, aber
   vorhanden. Betroffen sind auch `getRunCostReport`-Zuordnungen (Punkt 17).
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
