# Restore-Übung 2026-07-28 — OP-01 Rückweg-Beweis (isolierte lokale PostgreSQL)

**Ergebnis: ERFOLG — 18/18 Prüfungen, 0 Fehler.** Erstmals ist der Rückweg
aus einer Production-Vollsicherung praktisch durchgeführt und feld- wie
mengenmäßig bewiesen. Production wurde ausschließlich lesend angefasst.

Nur Kennzahlen und Objektnamen — keine Inhalte, keine personenbezogenen Daten.

## 1. Umgebung

| Größe | Wert |
|---|---|
| Quelle | Supabase-Projekt `ddckuvvpcytqbyfmbvie` (einziges Projekt der Organisation, eu-west-1, `ACTIVE_HEALTHY`) |
| Tarif (gegengeprüft) | **Free-Plan** (`plan: free` via Management-API) — keine nativen Backups, kein PITR |
| Production-DB | PostgreSQL 17.6, pgvector 0.8.0 |
| Übungs-Ziel | lokale PostgreSQL **16.13** + pgvector **0.6.0**, `127.0.0.1:5432`, eigene Drill-DB, nach der Übung gelöscht |
| Ausführungsort | Claude-Code-Cloud-Sitzung; Secrets ausschließlich aus Environment-Einstellungen (CLAUDE.md §4.9), nichts protokolliert |
| main-Commit | `0f8d33a` (Merge PR #158) |

## 2. Sicherung (Phase 5, read-only)

Ruhefenster geprüft (09:42 UTC): 0 aktive `pipeline_locks`, 0 laufende
`process_runs`, letzte Crawl-Telemetrie 08:16 UTC.

| Größe | Wert |
|---|---|
| Start / Ende | 2026-07-28 09:43:22 UTC / 09:44:12 UTC (**50 s**) |
| Verfahren | `node scripts/backup-export.js` (REST, PK-sortiert paginiert, serverseitiger Count-Abgleich je Tabelle) |
| Umfang | **40/40 Tabellen, 74 844 Datensätze, 56 MB**, `vollstaendig: true` |
| Gesamtprüfsumme | `c63f1d95ae767b42db1a5ad0a3dd80a0eb76a8c40b3e2524621840e8f1821b4c` |
| Ablage | `backups/2026-07-28T09-43-22-743Z/` — gitignored, verbleibt NICHT im Repo; Aufbewahrung/Verschlüsselung nach Runbook 1b (Löschtermin 2026-10-28) |
| Größte Tabellen | `gate_shadow_events` 37 792 · `source_crawl_telemetry` 14 289 · `raw_documents` 9 174 · `document_findings` 5 728 · `ko_document_links` 4 660 · `knowledge_objects` 1 249 |
| Einschränkung | kein transaktionaler Snapshot (Runbook §1); Lauf im belegten Ruhefenster |

## 3. Restore + Beweis (Phasen 6/7)

Werkzeug: `scripts/restore-verify-local.js` · Lauf
`restore-verify-2026-07-28T09-49-57-975Z` · **Gesamtdauer 20 s**
(Schema 2 s · Import 6 s · Prüfung 12 s) · Exit 0.

Alle 18 Prüfungen OK:

| # | Prüfung | Beleg |
|---|---|---|
| 1 | Backup-Integrität (SHA-256 je Datei gegen Manifest) | 40 Dateien |
| 2 | Schema-Aufbau schema.sql + 14 Migrationen (ohne `20260720`, wie Production) | ok |
| 3 | Zielumgebung beginnt leer | 0 Zeilen |
| 4 | RESTORE_ORDER deckt alle Backup-Tabellen | 40 |
| 5 | Zeilenzahlen aller Tabellen == Manifest | 40 exakt |
| 6 | Keine unerwarteten Zusatzdaten | 74 844 == 74 844 |
| 7 | PK-Mengen byte-identisch (Digest je Tabelle) — keine kanonische ID verloren | 40 Tabellen |
| 8 | Feldgenaue Stichproben kritischer Tabellen (normalisierter Vergleich) | 90 Zeilen identisch |
| 9 | `knowledge_objects`: Nicht-NULL-Zähler je Spalte == Backup (deckt Ebenen-, Geografie- und Klassifikationsfelder aus Sprint 19–21; Geografien/Ebenen unverändert) | 60 Spalten |
| 10 | Sprint-21-Nachklassifikation erhalten | **740/740** Objekte |
| 11 | Tabellenmenge == Production-Strukturreferenz | 40/40 |
| 12 | RLS auf allen Tabellen aktiv | 40 |
| 13 | Policy-Menge == Referenz (keine Policy fehlt, keine zusätzlich) | 23/23 |
| 14 | Trigger-Menge == Referenz | 14/14 |
| 15 | Funktions-Menge == Referenz | 7/7 |
| 16 | **Mandantentrennung funktional**: RLS-Probe als `authenticated` mit JWT-Claim (`auth.jwt()`-Shim, Supabase-Semantik) über `briefings`/`decisions`/`matching_results` — je Mandant exakt die eigenen Zeilen, Kreuzprobe fremder Mandant 0, ohne Claim 0; Mandanten datengetrieben gewählt, nicht hartkodiert | 3 Tabellen, 2 Mandanten |
| 17 | Funktionsprobe `match_knowledge_objects` mit echtem Profil-Embedding (pgvector + ivfflat) | 3 Treffer, 768 Embeddings im Bestand |
| 18 | Triggerprobe `set_updated_at` (in Rollback-Transaktion, Daten unverändert) | fortgeschrieben |

Briefings: 71 Zeilen gesichert, 71 wiederhergestellt (Zeilen- und PK-beweis,
Prüfung 5/7); Fremdschlüssel wurden beim Import live erzwungen (kein
`session_replication_role`-Bypass). Identity-Sequenzen wurden nach dem Import
fortgesetzt (Restore-Ziel ist schreibfähig ohne ID-Kollision).

Aufräumen: Drill-DB `helmut_drill_2026_07_28t09_49_57_975z` unmittelbar nach
der Übung gelöscht (09:52 UTC, verifiziert; enthielt personenbezogene Daten).

## 4. Befunde des Sprints

| # | Befund | Status |
|---|---|---|
| B-1 | **Backup-Deckungslücke:** `source_crawl_telemetry` (14 289 Zeilen) und `process_runs` fehlten in `TABLES`/`RESTORE_ORDER` — ein „Voll“-Backup deckte 38 von 40 Tabellen | **behoben** (Export + Restore-Reihenfolge + Deckungstest gegen Strukturreferenz) |
| B-2 | **Schema-Drift Repo ↔ Production**, spaltengenau belegt: (a) `knowledge_objects.action_items`/`action_items_struct` in Production nullable, im Repo NOT NULL → Import bricht; (b) Production trägt 10 Alt-Spalten in `profiles` (u. a. `party`, `committees`, `embedding vector(256)`) und `topic_memory.vorgang_id`, die das Repo-Schema nicht kennt → ohne Korrektur stiller Feldverlust beim Restore; (c) Repo kennt 4 `llm_usage`-Spalten, die Production nicht hat (importunkritisch) | dokumentiert in `scripts/produktions-strukturreferenz.json` (`schemaDrift`); Drill wendet Korrekturen automatisch an; **dauerhafte Bereinigung offen** (Restliste OP-01-Notiz) |
| B-3 | Runbook-Bootstrapliste der Migrationen endete bei `20260717` (4 Migrationen fehlten) | behoben (Runbook 3b) |
| B-4 | Supabase Auth und Storage sind ungenutzt (0/0/0) — kein separater Sicherungspfad nötig; App-Auth liegt im Blob-Store und ist Teil des Exports | dokumentiert (Runbook §0) |

## 5. Bewertung Zielarchitektur (Phase 3, Kurzform)

Verglichen: nur native Backups (erst ab Pro verfügbar) · Pro+PITR · nur
logische Exporte · Exporte+Prüfsummen+geübter Restore · Kombinationen.
Gewählt (kleinste tragfähige Lösung, 0 € bis zur Tarifentscheidung):
**täglicher geprüfter logischer Voll-Export (40 Tabellen, Prüfsummen,
Vollständigkeits-Riegel) + bewiesener isolierter Rückweg + monatliche Übung**;
als Dauerlösung für zahlende Mandanten **zusätzlich Supabase Pro + PITR**
(RPO Minuten statt 24 h, echter Snapshot statt sequenziellem REST-Export).
Keine eigene Backupplattform, kein Zweit-Cloud-Konto.

## 6. Was dieser Beweis NICHT abdeckt (ehrlich)

- **Kein Restore gegen Production** — bleibt eine freigabepflichtige
  Einzelfallentscheidung (Runbook §2); die Werkzeuge verweigern Production
  als Ziel konstruktionsbedingt.
- Kein App-Boot gegen die Drill-DB (PostgREST fehlt einer rohen PostgreSQL);
  der lesende Anwendungstest lief als SQL-/RLS-/pgvector-Probe. Der
  App-Boot-Test bleibt Teil der Testprojekt-Übung (Runbook 3b).
- Versionsdifferenz Übung/Production: PG 16/pgvector 0.6 vs. PG 17/0.8.
- RPO bleibt bis zur Tarifentscheidung bei bis zu 24 h (tägliche Exporte).
