# `supabase/migrations/prepared/` — vorbereitete, NICHT angewendete Migrationen

Dieses Verzeichnis enthält Schemaänderungen, die **entworfen, aber bewusst NICHT
eingespielt** sind. Es liegt **außerhalb** des regulären Migrationspfads
(`supabase/migrations/*.sql`) — weder ein Runner noch die Migrations-Registry noch
das CI-Gate berühren die Dateien hier. Anwenden ist jeweils ein **eigener,
ausdrücklich freigabepflichtiger Schritt**.

## Warum getrennt?

Der Auftrag (Sprint 1 „Universelles Mandatsregister") verlangt ausdrücklich:
*„Bereite alle notwendigen Schemaänderungen und Schnittstellen vor, führe sie aber
nicht in Produktion aus. Migrationen dürfen nur vorbereitet und dokumentiert werden."*
Die physische Trennung stellt technisch sicher, dass hier **kein** Production-Write
passieren kann, solange niemand die Datei bewusst in den aktiven Pfad zieht.

## Inhalt

| Datei | Zweck |
|---|---|
| `20260722_mandate_register.sql` | Persistente kanonische Projektion des Mandatsregisters (`mandate_register`) + stabile externe Personen-IDs (`mandate_external_ids`, DB-seitiger Dubletten-Schutz). |
| `20260722_mandate_register_rollback.sql` | Vollständiger Rollback (droppt beide additiven Tabellen). |

## Eigenschaften der Migration

- **Additiv:** keine bestehende Tabelle wird geändert; `mandate_profiles` bleibt unberührt.
- **Idempotent:** `create table/index if not exists`, `do $$ … enable row level security`.
- **Abgeleitet:** beide Tabellen sind jederzeit aus `mandate_profiles` + Registry
  (`lib/helmut/mandate-register.js`) **neu berechenbar** — kein Primärdatenverlust bei Rollback.
- **service_role-only:** RLS an, keine Policies (konsistent mit `source_crawl_telemetry`,
  `gate_shadow_events`, `document_findings`).
- **Kein neuer PII-Umfang:** nur öffentliche Mandatsdaten (Name/Partei/Ausschuss),
  die in `mandate_profiles` ohnehin stehen.

## Vor dem Anwenden zu klären (Review-Checkliste)

1. **Backups/PITR aktiv** (Restliste OP-01) — vor jeder Migration.
2. **Fremdschlüssel-Ziel verifizieren:** `mandate_register.profile_id` referenziert
   `mandate_profiles.id` **oder** `profiles.id` — die auskommentierte FK-Variante in
   der `.sql` passend einkommentieren, nachdem die reale Ziel-Tabelle/-Spalte geprüft ist.
3. **Schreibpfad:** die App schreibt heute **nicht** in diese Tabellen (reines
   Schema). Ein Backfill/Dual-Write (`resolveMandate` → `mandate_register`-Upsert)
   ist ein eigener, gated Folgeschritt (analog `HELMUT_CRAWL_RUNS_RELATIONAL`).
4. **Registry-Version mitschreiben:** `register_version` dokumentiert, mit welcher
   Registry-Fassung eine Zeile berechnet wurde (Reproduzierbarkeit/Neuberechnung).
