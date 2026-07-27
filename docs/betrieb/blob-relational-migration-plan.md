# Blob → Relational: Migrationsplan der Betriebsdaten (P0-5 Stufe 2)

> **Status: VORBEREITET, NICHT AKTIV.** Alle Schritte sind freigabepflichtig.
> Diese Datei ist der Übergangsplan; sie ändert nichts an Production.

| | |
|---|---|
| **Bezug** | Audit R1 / E3 · P0-5 Stufe 2 |
| **Ziel** | Betriebsdaten (Crawl-Läufe, Kosten, Locks, technische Telemetrie) aus dem 1,24-MB-Monolith-Blob in relationale Tabellen ziehen → Blob schrumpft → 10-s-Timeouts verschwinden, skaliert für Mehr-Mandant/Landtag |
| **Datensparsamkeit** | Zieltabellen enthalten **nur** technische Metadaten/Zähler + pseudonyme Mandatskennung — kein Volltext, kein Fehler-Rohtext (nur `error_count`), keine PII |

## Betroffene Betriebsdaten und ihr relationales Ziel

| Blob-Key (heute) | Relationales Ziel | Migration | Status |
|---|---|---|---|
| `crawlRuns` | `public.crawl_runs` | `20260720_crawl_runs_relational.sql` | **vorbereitet** (diese Stufe) |
| `pipelineLocks` (Auth-Blob) | `public.pipeline_locks` (+ atomare Funktionen) | `20260719_pipeline_lock_atomic.sql` | vorbereitet (P0-4) |
| `llmUsage` / Budget-Zähler (Auth-Blob) | `public.llm_usage` / `public.llm_budget_counters` | bereits angewendet (`20260717`) / vorhanden | teils aktiv |
| Pro-Quellenabruf-Telemetrie | `public.source_crawl_telemetry` | `20260718_source_crawl_telemetry.sql` | vorbereitet (P0-1) |
| Prozess-Laufzeit-Ring `processRuns` (Auth-Blob) | `public.process_runs` (Upsert auf `(run_id, process)`) | `20260727_process_runs_relational.sql` | **vorbereitet** (W-2) — die frühere Einstufung „klein, unkritisch" ist durch Befund W-2 **widerlegt**: der Blob verliert parallele Läufe per Last-Write-Wins (`befund-werkzeug-haertung-w1-w2.md`) |

## Übergang in 4 Phasen (jede Phase = eigener Freigabepunkt)

**Phase 1 — nur Blob (heute, Ist-Zustand).**
Crawl-Läufe leben ausschließlich im Blob. Lese- und Schreibpfad unverändert.

**Phase 2 — Dual-Write (Blob + relational parallel) + Vergleich.**
- Voraussetzung: Migration `20260720` eingespielt (Freigabe).
- `HELMUT_CRAWL_RUNS_RELATIONAL=on` aktiviert den Dual-Write in `saveCrawlRun`
  (`storage.insertCrawlRunRelational`, heute default AUS, fail-safe).
- Aus **einem** Blob-`crawlRun` entsteht **eine** `crawl_runs`-Zeile über die reine
  Projektion `crawlRunToRelationalRow` (Modul `lib/helmut/blob-relational.js`).
- **Vergleichstest:** `scripts/crawl-run-relational-projection-test.js` belegt
  offline die verlustfreie Projektion (alle Zähl-/Skalarfelder gleich,
  Datensparsamkeit gewahrt). Im Betrieb: über einen Messzeitraum die letzten N
  Blob-`crawlRuns` gegen die neuen `crawl_runs`-Zeilen prüfen (`compareCrawlRunProjection`).
- Dauer: mind. 3 echte Crawl-Läufe + 1 Morgenzyklus grün, bevor Phase 3.

**Phase 3 — Lesepfad auf relational umstellen.**
- `getLatestCrawlRun`/`listCrawlRuns`/`pipeline-status` lesen aus `crawl_runs`
  statt aus dem Blob (neuer, gated Lesepfad; Blob bleibt als Fallback erhalten).
- Beweis: Admin-Datenstatus/pipeline-status identisch zu Phase 2.

**Phase 4 — Blob-Key `crawlRuns` abschalten.**
- `saveCrawlRun` schreibt `crawlRuns` nicht mehr in den Blob (nur noch relational).
- `compactStore` entfernt den `crawlRuns`-Zweig; einmaliger Blob-Shrink.
- Rückfall: `HELMUT_CRAWL_RUNS_RELATIONAL=off` + Blob-Zweig reaktivieren
  (Code bleibt hinter Flag erhalten, bis Phase 4 endgültig bestätigt ist).

## Abschaltplan alter Blob-Keys

| Blob-Key | Abschalt-Bedingung | Rückfall |
|---|---|---|
| `crawlRuns` | Phase 4 bestätigt (3 Läufe + Morgenzyklus relational grün) | Flag off → Blob-Zweig reaktivieren |
| `pipelineLocks` | atomarer Lock (P0-4) ≥ 1 Woche stabil, keine fail-closed-Fehlalarme | `HELMUT_ATOMIC_LOCK=off` → Blob-Lock |

Kein Blob-Key wird gelöscht, solange sein relationales Ziel nicht über einen
dokumentierten Messzeitraum bestätigt ist. Alte Blob-Werte werden durch die
Retention (`HELMUT_CRAWL_RUN_RETENTION`) ohnehin natürlich verdrängt — es gibt
**keine** aktive Löschung im Rahmen dieses Plans.

## Freigabepunkte (gebündelt in der Gründer-Freigabe)

1. Migration `20260720_crawl_runs_relational.sql` auf Production anwenden.
2. `HELMUT_CRAWL_RUNS_RELATIONAL=on` (Phase 2 Dual-Write).
3. Nach Messzeitraum: Phase 3 (Lesepfad) und Phase 4 (Blob-Abschaltung) je separat.
4. **W-2:** Migration `20260727_process_runs_relational.sql` auf Production anwenden
   und `HELMUT_PROCESS_RUNS_RELATIONAL=on` setzen (Phase 2 Dual-Write; der
   Dual-Read im Code bevorzugt relational automatisch). Ohne beides bleibt der
   Blob-Pfad aktiv — seit der Werkzeug-Härtung idempotent und mit sichtbaren
   Fehlern, aber weiterhin Last-Write-Wins-verlustbehaftet (dokumentierte
   Übergangsphase, **kein Dauerzustand**).

## Rollback

Jede Phase ist einzeln zurücknehmbar: Flag `off` (Code fällt auf Blob zurück) und
`20260720_crawl_runs_relational_rollback.sql` (Zieltabelle entfernen). Der Blob
bleibt bis Phase 4 die Lese-Wahrheit — bis dahin ist Rollback datenverlustfrei.
