# Datenmodell, Migration & Rollback (Sprint 1)

Technische Referenz zum relationalen Fundament. Zielgruppe: Betreiber/Entwickler.

## Die 11 neuen Tabellen

Alle Tabellen sind **global geteilt** — sie enthalten ausschließlich öffentliche
Quellendefinitionen, **keine** mandanten- oder personenbezogenen Daten, daher **keine**
`tenant_id`/`user_id`-Spalte.

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `geographies` | Geo-Hierarchie (Bund→Land→Bezirk/Kreis→Kommune) | `level`, `parent_id`, `ags` |
| `electoral_districts` | Wahlkreise (separat, keine Ebene) | `kind`, `number`, `geography_id` |
| `political_entities` | typisierte Entitätsschicht | `entity_type`, `canonical_key`, `level`, `geography_id`, `aliases[]` |
| `publishers` | Herausgeber (einmal je Domain) | `canonical_domain` (unique), `publisher_type`, `evidence_role`, `trust`, `entity_id` |
| `retrieval_paths` | Abrufwege (N je Herausgeber) | `publisher_id`, `method`, `status`, `activation_mode`, `is_critical`, `legacy_source_id` |
| `source_packages` | Quellenpakete | `key` (unique), `status`, `is_base`, `political_level`, `required_classes[]` |
| `package_paths` | m:n Paket↔Abrufweg | `package_id`, `retrieval_path_id` |
| `path_expected_levels` | erwartete Ebenen je Abrufweg | `level` |
| `path_expected_geographies` | erwartete Geografien je Abrufweg | `geography_id` |
| `path_expected_topics` | erwartete Themen je Abrufweg | `topic` |
| `path_expected_entities` | erwartete Entitäten je Abrufweg | `entity_id` |

**Beziehungen:** `publishers 1—n retrieval_paths`; `source_packages m—n retrieval_paths` (über
`package_paths`); `political_entities`/`publishers`/`source_packages` referenzieren `geographies`;
`publishers.entity_id` → `political_entities`.

## Sicherheit & Mandantentrennung (RLS)

Die Migration aktiviert **Row Level Security** für alle 11 Tabellen — **restriktiv, nur
`service_role`** (Sprint-2-Verschärfung nach kritischer Prüfung):

- **Kritische Prüfung:** Brauchen normale angemeldete Nutzer direkten Lesezugriff? **Nein.** Der
  gesamte produktive DB-Zugriff läuft über den App-Server mit `service_role`; der
  `authenticated`/JWT-Pfad ist stillgelegt (`storage.tenantJwtModeEnabled=false`). Die
  Quellendefinitionen werden nur intern (Crawl/Understanding/Matching) und im Betreiber-Admin
  gebraucht — **nie** direkt vom Abgeordneten-Frontend über die REST-API.
- **Folge:** RLS aktiviert + **keine** permissive Policy → `deny` für `anon`/`authenticated`,
  `service_role` (BYPASSRLS) liest/schreibt. Konsistent mit `public.pipeline_locks`.
- Der Linter meldet dazu `rls_enabled_no_policy` (INFO) — **bewusst so**: es gibt keinen Grund,
  öffentliche Quellendefinitionen über die Endnutzer-API zu öffnen.

Sollte später echtes Supabase-Auth eingeführt werden **und** ein Admin über `authenticated` lesen,
wird gezielt eine **Rollen-Policy** ergänzt — als separater, **freigabepflichtiger** Schritt. Die
Migration ändert **keine bestehende** Policy.

## Anwenden & Zurückrollen

> **Wichtig:** Diese Migration ist **freigabepflichtig** und **noch nicht** auf Production
> angewendet (Auftrag §4). Die folgenden Schritte beschreiben den späteren Freigabe-Vorgang.

**Anwenden (nach Freigabe):**
1. Schema: `20260713_source_architecture.sql` (idempotent, `create … if not exists`).
2. Seed: `supabase/seeds/20260713_source_architecture_seed.sql` — vorher mit
   `npm run seed:source-architecture` aus dem Code-Modell **reproduzierbar** neu erzeugen (idempotent,
   `insert … on conflict`).

**Zurückrollen (Rollback):** `20260713_source_architecture_rollback.sql` entfernt ausschließlich die
11 neu angelegten Tabellen (abhängige zuerst, `drop … if exists … cascade`). Da die Migration rein
additiv ist, ist der Rollback **risikofrei** — keine bestehende Tabelle/Spalte/Daten ist betroffen.

## Der Katalog-Mapper (Kompatibilitätsschicht)

`lib/helmut/quellenarchitektur/catalog.js` übersetzt den bestehenden hartkodierten Katalog
(`v1Sources`) deterministisch in das neue Modell — **ohne** das Live-Verhalten zu ändern. Er ist die
Brücke, bis die Struktur nach Freigabe relational übernommen wird. `legacy_source_id` an jedem
Abrufweg hält die Verbindung zu den alten IDs (und damit zu bestehenden `raw_documents.source_id`).

Ergebnis der Abbildung (per `npm run test:source-architecture` verifiziert):

| Kennzahl | Wert |
|---|---|
| Katalog-Quellen | 144 (+ DIP = 145 Abrufwege) |
| Herausgeber (dedupliziert) | 51 |
| Pakete | 7 (5 aktiv, Berlin/Brandenburg `prepared`) |
| Paketzuordnungen | Bund Basis 54 · Arbeit&Soziales 84 · Die Linke 2 · Regional NDS 4 · Profilpaket des Piloten 1 |
| defekte Direkt-Feeds (`broken`) | 6 (Bundestag, Bundesregierung, Die Linke, Linksfraktion, DGB, Ausschuss A&S) |
| unzugeordnete Quellen | 0 |

## Rezepte (für spätere Sprints)

**Neuen Abrufweg zu bestehendem Herausgeber hinzufügen:** Zeile in `retrieval_paths` mit
`publisher_id` des Herausgebers; ggf. `package_paths`-Zeilen für die Pakete. Der Herausgeber wird
**nicht** dupliziert.

**Neuen Herausgeber hinzufügen:** Zeile in `publishers` (Domain, Typ, Belegfunktion, Trust); optional
`entity_id` auf die passende politische Entität setzen.

**Defekte Quelle deaktivieren:** `retrieval_paths.status` auf `broken`/`paused` setzen. Kritische
Pflichtquellen (`is_critical = true`) werden **nie automatisch** archiviert — sie bekommen einen
sichtbaren Status statt stiller Löschung (Auftrag §30).

**Neues Bundesland aktivieren:** Landespaket von `prepared` → `active`, Abrufwege verknüpfen; die
Referenzzählung aktiviert dann automatisch nur die tatsächlich benötigten Abrufwege.
