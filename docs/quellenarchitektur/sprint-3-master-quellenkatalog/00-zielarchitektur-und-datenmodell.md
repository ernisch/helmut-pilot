# Sprint 3 — Master Quellenkatalog · Zielarchitektur und Datenmodell

**Stand:** 2026-07-21 · **Status:** VORBEREITET (kein Deployment, keine angewandte Migration,
keine Produktionsänderung) · **Branch:** `claude/session-pyryop`

Dieses Dokument beschreibt das neue, **globale** Master-Quellenkatalog-Modell, das Sprint 3 additiv
auf die bestehende relationale Quellenarchitektur (Sprint 1/2: `publishers` / `retrieval_paths` /
`source_packages` / `package_paths`) aufsetzt — **ohne** die bestehende Produktionslogik zu ändern.

## 1. Zentrale Architekturentscheidung

- Der Master Quellenkatalog ist **global**. Eine Quelle wird nur **einmal** kanonisch gespeichert
  (`catalog_sources`, `unique(canonical_key)`).
- Mandanten erhalten **keine kopierten Quellenlisten**, sondern nachvollziehbare **Zuweisungen /
  Relevanzen / Korrekturen** auf den globalen Katalog.
- Eine Änderung für einen Mandanten (`tenant_*`-Tabellen) kann per Konstruktion **keinen anderen
  Mandanten beeinflussen** (eigene `tenant_id` + RLS).

## 2. Die acht strikt getrennten Belange

| # | Belang | Träger (Code) | Träger (vorbereitete DB) |
|---|--------|---------------|--------------------------|
| 1 | Globale Quelle | `master/source-record.js` | `catalog_sources` (+`catalog_publishers`) |
| 2 | Technischer Abrufweg | `retrieval`-Feld | `catalog_source_paths` (1:n) |
| 3 | Inhaltliche Klassifikation | `master/model.js`, `taxonomy.js`, `classification` | `catalog_sources.*` + `catalog_source_{committees,topics,regions}` |
| 4 | Mandatsbezogene Zuweisung | `master/assignment.js` (datengetrieben) | `catalog_package_assignments` (Referenzen) |
| 5 | Laufzeitgesundheit | `master/health.js` (aus Telemetrie) | `catalog_source_health` |
| 6 | Mandantenspezifische Relevanz | `master/tenant-scope.js` | `tenant_source_relevance` (RLS) |
| 7 | Manuelle Korrekturen | `master/tenant-scope.js` | `tenant_source_overrides` (RLS) |
| 8 | Audit und Herkunft | `source-record` (discovery/review) | `catalog_sources.discovery_*` + `catalog_source_audit` |

Zusätzlich: **private, kundenspezifische Quellen** → `tenant_private_sources` (RLS, streng
mandantengetrennt; für andere Mandanten weder sichtbar noch abrufbar).

## 3. Der kanonische Quellenrecord — die 20 Pflichtattribute (Phase 4)

`buildSourceRecord()` erzeugt für jede Quelle einen Record mit exakt diesen Attributen:

1. `publisher_id` (kanonischer Herausgeber) · 2. `canonical_url` · 3. `retrieval` (technischer
Abrufweg) · 4. `source_type` (Taxonomie) · 5. `political_level` · 6. `institution_id` ·
7. `party_id`/`group_id` · 8. `committee_ids` · 9. `topics` · 10. `region_ids` · 11. `language` ·
12. `discovery_origin` (Herkunft) · 13. `discovered_at` · 14. `last_checked_at` · 15. `trust` ·
16. `license_status` · 17. `privacy_status` · 18. `review_status` (Prüfstatus = Importzustand) ·
19. `release_status` (Freigabestatus) · 20. `responsible` (Regel **oder** Rolle — nie eine
Privatperson).

**Herkunft und Prüfstatus sind Pflicht** (Abnahme §4): `validateSourceRecord()` weist einen Record
ohne `discovery_origin` / `discovered_at` / gültigen `review_status` als unvollständig aus.

## 4. Rein lesender Adapter + Shadow-Vergleich (Phase 1)

- `master/adapter.js` bildet den **bestehenden** relationalen Bestand (via
  `quellenarchitektur.buildFullModel()`) rein lesend auf kanonische Records ab. Felder, die das
  Alt-System nie erhoben hat (Lizenz-/Datenschutzbewertung, Herkunftsbeleg), bleiben **ehrlich**
  `unbewertet` — der Shadow-Vergleich macht genau diese Lücken sichtbar. Es wird **nichts erfunden**
  und **nichts geschrieben**.
- `master/shadow-compare.js` beantwortet die sechs Auftragsfragen (nur-Alt · nur-Neu · abweichende
  Klassifikation · widersprüchliche URLs · vermutliche Dubletten · abweichende Zuweisung) und liefert
  ein reproduzierbares Urteil. Treiber: `scripts/master-catalog-shadow-compare.js` → `audit/master-katalog-vergleich.json`.

## 5. Importstrecke mit 12 Zuständen (Phase 5)

`entdeckt → normalisiert → (moegliches Duplikat) → technisch geprüft → inhaltlich klassifiziert →
rechtlich geprüft → freigegeben → aktiv → eingeschränkt → quarantänisiert → ersetzt → archiviert`.

- **Keine Quelle springt direkt von `discovered` auf `active`** (`INTAKE_TRANSITIONS`, Test §16).
- Unklare/widersprüchliche Quellen bekommen Review-Status (`duplicate_candidate` / `quarantined`).
- `ingestBatch()` ist **idempotent**: dieselbe Charge zweimal ausgeführt erzeugt keine Dubletten und
  keine unkontrollierten Änderungen (bestehende Records werden nie still mutiert). Kein `Date.now()`
  im Kern → reproduzierbar.

## 6. Vorbereitete Migration (freigabepflichtig)

- `supabase/migrations/20260722_master_source_catalog.sql` (+ Rollback) — **additiv**, idempotent
  (`create ... if not exists`), **nicht angewendet**. Legt die globalen `catalog_*`-Tabellen
  (RLS an, service_role-only, Muster `pipeline_locks`) und die `tenant_*`-Tabellen
  (RLS `tenant_isolation` über `helmut_current_tenant()`) an.
- `supabase/seeds/20260722_master_source_catalog_seed.sql` — **vorbereiteter** Seed (idempotent,
  `on conflict do nothing`), erzeugt aus dem JS-Seed via `scripts/generate-master-catalog-seed.js`.
- Additivität/Rollback-Vollständigkeit sind statisch getestet: `scripts/master-catalog-migration-test.js`.

## 7. Modulübersicht (`lib/helmut/quellenarchitektur/master/`)

| Modul | Zweck |
|-------|-------|
| `taxonomy.js` | 26 Quellenkategorien + Suchanbieter (datengetrieben, Phase 2) |
| `model.js` | Enums, 12 Importzustände, kanonischer Schlüssel, Dedup (Phase 5) |
| `source-record.js` | 20-Attribut-Record + Validierung + DSGVO-Guard (Phase 4/8) |
| `acquisition.js` | 5-stufige Beschaffungspriorität (Phase 4) |
| `intake-pipeline.js` | idempotenter Import + Zustandswechsel (Phase 5) |
| `adapter.js` | rein lesender Adapter Alt→Kanon (Phase 1) |
| `shadow-compare.js` | 6-Kategorien-Shadow-Vergleich (Phase 1) |
| `assignment.js` | datengetriebene Paketzuweisung (Belang 4) |
| `supply-standard.js` | 12 Versorgungsebenen × 10 Attribute (Phase 3) |
| `coverage-matrix.js` | Abdeckungs-/Ausgewogenheitsmatrix (Phase 9) |
| `tenant-scope.js` | 7-Schichten-Mandantentrennung (Phase 7) |
| `health.js` | Laufzeitgesundheit aus Telemetrie (Belang 5) |
| `seeds/*` | Taxonomie-nahe Daten, ergänzende Entitäten, Startkatalog, Master-Pakete (Phase 6) |

Alle Module sind **rein** (keine KI, kein Netz, kein Storage-Write) und **nicht** in
Scheduler/Server verdrahtet.
