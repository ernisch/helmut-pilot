# Sprint 3 — SaaS-Tauglichkeit, Mandantentrennung und RLS-Vorbereitung (Phase 7)

**Kein Produktions-Deployment. Keine angewandte Migration.** Dieses Dokument bereitet die
RLS-Anforderungen und Zugriffsmatrix vor; die Umsetzung (`20260722_master_source_catalog.sql`) ist
freigabepflichtig.

## 1. Die sieben Schichten (strikte Trennung)

`master/tenant-scope.js` (`SCOPE_LAYERS`) deklariert die verbindliche Trennung:

| # | Schicht | Scope | Tabelle | tenant-Spalte |
|---|---------|-------|---------|---------------|
| 1 | globaler Quellenkatalog | global | `catalog_sources` | – |
| 2 | globale Quellenqualität | global | `catalog_sources` (Bewertung) | – |
| 3 | globale technische Gesundheit | global | `catalog_source_health` | – |
| 4 | mandatsbezogene Relevanz | global (ableitbar) | `catalog_package_assignments` | – |
| 5 | mandantenspezifische Auswahl | **tenant** | `tenant_source_relevance` | `tenant_id` |
| 6 | mandantenspezifische Korrektur | **tenant** | `tenant_source_overrides` | `tenant_id` |
| 7 | kundenspezifische private Quellen | **tenant** | `tenant_private_sources` | `tenant_id` |

- **Globale Quellen werden nicht pro Mandant dupliziert.** `resolveTenantSources()` liefert
  ausschließlich **Referenzen** (Quellen-IDs) auf den globalen Katalog; 100 Mandanten mit demselben
  Paket erzeugen genau eine globale Quelle.
- **Private Quellen sind strikt mandantengetrennt.** `resolveTenantSources(tenantId, …)` ignoriert
  jede fremde `tenant_id` und meldet einen fremden Privatdatensatz als **Verletzung**;
  `assertPrivateIsolation()` prüft, dass Mandant A nie eine Privatquelle von B sieht
  (Tests §10/§11, `master-catalog-tenant-test.js`).
- **Jede mandantenspezifische Zuordnung trägt eine eindeutige `tenant_id`** (= `mandate_profiles.user_id`).

## 2. RLS-Muster (konsistent mit dem Bestand)

Der Bestand kennt zwei Muster (Quelle: `docs/rls-tenant-policies-draft.md`,
`supabase/migrations/20260712_tenant_rls_policies.sql`). Der Master-Katalog übernimmt beide:

**Globale interne Tabellen** (`catalog_*`) — Muster `pipeline_locks` / `source_crawl_telemetry`:

```sql
revoke all on table public.catalog_sources from public, anon, authenticated;
alter table public.catalog_sources enable row level security;
-- BEWUSST KEINE Policy: nur service_role (BYPASSRLS) liest/schreibt.
```

**Tenant-Tabellen** (`tenant_*`) — Muster Category-A (`decisions`, `briefings` …):

```sql
alter table public.tenant_source_relevance enable row level security;
create policy tenant_isolation on public.tenant_source_relevance
  for all to authenticated
  using (tenant_id = public.helmut_current_tenant())
  with check (tenant_id = public.helmut_current_tenant());
```

`public.helmut_current_tenant()` liefert `nullif(auth.jwt() ->> 'user_id','')`. Existiert der Helfer
(noch) nicht, bleibt RLS **an ohne Policy** → **fail-closed** (deny für alle Nicht-service_role).

Heutiger Betrieb: der gesamte produktive DB-Zugriff läuft über den App-Server mit `service_role`
(App-Guards `assertTenant`/`assertTenantRows`); `tenantJwtModeEnabled()` ist `false`. Die
tenant_isolation-Policies sind damit **vorbereitet** und greifen automatisch, sobald echter
Supabase-Auth aktiviert wird.

## 3. Zugriffsmatrix (Rollen × Tabellen × Operation)

Format konsistent mit `docs/auth-service-role-matrix.md`.

| Tabelle | Scope | `service_role` | `authenticated` (eigener Mandant) | `authenticated` (fremd) | `anon` |
|---------|-------|:---:|:---:|:---:|:---:|
| `catalog_publishers` | global | R/W | – (kein Policy) | – | – |
| `catalog_sources` | global | R/W | – | – | – |
| `catalog_source_paths` | global | R/W | – | – | – |
| `catalog_source_{committees,topics,regions}` | global | R/W | – | – | – |
| `catalog_package_assignments` | global | R/W | – | – | – |
| `catalog_source_health` | global | R/W | – | – | – |
| `catalog_source_audit` | global | R/W (append) | – | – | – |
| `tenant_source_relevance` | tenant | R/W | **R/W nur eigene** `tenant_id` | – (RLS deny) | – |
| `tenant_source_overrides` | tenant | R/W | **R/W nur eigene** `tenant_id` | – (RLS deny) | – |
| `tenant_private_sources` | tenant | R/W | **R/W nur eigene** `tenant_id` | – (RLS deny) | – |

„–" = kein Zugriff (implizites deny mangels Policy bzw. RLS-Prädikat schlägt fehl). `anon` erhält
generell keinen Zugriff (kein `to anon` in irgendeiner Policy).

## 4. SaaS-Bewertung

- **Skaliert ohne Duplikation:** globaler Katalog + referenzielle Zuweisung → O(1) Speicher je
  zusätzlichem Mandanten mit gleichem Profil.
- **Vollständige Mandantenisolation:** private Quellen + Relevanz + Korrekturen sind je `tenant_id`
  getrennt und RLS-geschützt; eine Änderung eines Mandanten kann keinen anderen beeinflussen.
- **Betreiber-globale Pflege:** Quellenqualität und -gesundheit werden **einmal** global gepflegt und
  wirken für alle Mandanten — ohne mandantenspezifische Sonderlogik.

→ Die Architektur ist **SaaS-tauglich**. Freigabepflichtig bleibt ausschließlich das Einspielen der
vorbereiteten Migration + die Aktivierung echten Supabase-Auth (dann greifen die tenant_isolation-
Policies verbindlich).
