# RLS-Tenant-Policies — ENTWURF (P0-2)

> **STATUS: ENTWURF — NICHT ANGEWENDET.** Dieses Dokument ist bewusst **kein**
> ausführbares Migrationsskript (liegt in `docs/`, nicht in `supabase/migrations/`).
> Es wurde in **Sprint 1 nur vorbereitet und dokumentiert**. Keine DB-Policy wurde
> geändert, keine Migration ausgeführt. Umsetzung erst nach ausdrücklicher
> Betreiber-Freigabe (berührt DB & Security).

Bezug: `audit/saas-risk-matrix.md` #1, `audit/fix-plan.md` P0-2. Ergänzt den in Sprint 1
umgesetzten **P0-1** (App-seitiger Tenant-Guard, `lib/helmut/storage.js`).

---

## 1. Ausgangslage (verifiziert)

- **24 Tabellen** haben RLS **aktiviert**, aber **0 Policies** (`pg_policies` public = 0; Advisor `rls_enabled_no_policy` ×24). → Für `anon`/`authenticated` gilt **Deny-all**.
- Die App verbindet sich mit dem **Service-Role-Key** (`storage.js`, `Authorization: Bearer <serviceRoleKey>`). **Der Service-Role umgeht RLS vollständig** (`BYPASSRLS`).
- **Konsequenz:** RLS-Policies allein bewirken für die **App-eigenen** Abfragen **keine** Mandantentrennung, solange diese über den Service-Role laufen. RLS ist heute nur ein Backstop gegen direkten `anon`/`authenticated`-PostgREST-Zugriff (der bereits deny-all ist).

**Daraus folgt:** Echte Defense-in-Depth auf DB-Ebene verlangt **zusätzlich** zur App-Filterung (P0-1) eine der beiden Optionen unten. Policies „einfach hinzufügen" genügt nicht.

---

## 2. Service-Role-Nutzung in den betroffenen Pfaden (Prüfung, keine Änderung)

Geprüft im Zuge von P0-1 (rein lesend, nichts geändert):

| Pfad | Service-Role? | Tenant-Scoping heute |
|---|---|---|
| `listDecisions` / `listMatchingResults` / `listOfficeOutputsByUser` | ja (alle Reads via `supabaseRequest` + Service-Role) | **jetzt** hart per `assertTenant` + Pflicht-`user_id=eq.`-Filter (P0-1) |
| `saveDecisions` / `saveMatchingResults` | ja | per-Row `user_id` Pflicht + `assertTenantRows` (P0-1) |
| `getOfficeOutput` / `canSpendOfficeOutput` / `saveOfficeOutput` / `getProfileEmbedding` / `saveProfileEmbedding` | ja | `user_id`-gekeyed; Reads jetzt `assertTenant` |
| `knowledge_objects` / `raw_documents` | ja | **bewusst mandantenlos** (öffentliche parlamentarische Daten) — kein Tenant-Scoping nötig/gewollt |
| V2-Blob (`helmut_store`) | ja | physisch getrennte Rows `main-p-<id>` + `user_id`-Filter |

**Befund:** Alle mandantenbezogenen Zugriffe laufen über den Service-Role; die Trennung ist nach P0-1 **app-seitig erzwungen** (Guard wirft statt still alle Mandanten zu liefern). Der Service-Role-Bypass bleibt bestehen — deshalb P0-2 als zweite Verteidigungslinie. **In Sprint 1 wurde am Service-Role-Setup und an den Policies nichts geändert.**

---

## 3. Zielarchitektur (zwei Optionen)

### Option A (empfohlen) — Session-GUC + RLS, Service-Role behalten
Die App setzt pro Request eine Session-Variable (`app.user_id`) **vor** den mandantenbezogenen Queries; RLS-Policies prüfen gegen diese Variable. Der Service-Role umgeht RLS zwar technisch — daher zusätzlich eine **dedizierte, nicht-BYPASSRLS-Rolle** für Tenant-Tabellen ODER `SET ROLE`/`SET request.*` je Request. Kleinster Eingriff mit echter Wirkung: eigener DB-User `helmut_app` **ohne** `BYPASSRLS`, den die App für Tenant-Tabellen nutzt.

### Option B — reiner Backstop
Policies bleiben deny-all für `anon`/`authenticated` (Status quo), P0-1 bleibt die alleinige Trennung. Kein zusätzlicher Schutz gegenüber heute — **nicht empfohlen** als P0-Lösung, nur als Zwischenschritt.

Der folgende Entwurf setzt **Option A** um.

---

## 4. Entwurf — Policies (NICHT ausführen)

```sql
-- ENTWURF / DRAFT — NICHT ANWENDEN OHNE BETREIBER-FREIGABE.
-- Voraussetzung: die App setzt pro Request  SET LOCAL app.user_id = '<politicianId>';
-- und verbindet sich für Tenant-Tabellen mit einer Rolle OHNE BYPASSRLS.

-- Helper: aktueller Tenant aus der Session-GUC (leer/NULL => kein Zugriff).
create or replace function public.helmut_current_tenant()
returns text language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

-- Beispiel für EINE mandantenbezogene Tabelle (identisch für alle unten gelisteten):
alter table public.decisions enable row level security;

drop policy if exists tenant_select on public.decisions;
create policy tenant_select on public.decisions
  for select using (user_id = public.helmut_current_tenant());

drop policy if exists tenant_write on public.decisions;
create policy tenant_write on public.decisions
  for all
  using (user_id = public.helmut_current_tenant())
  with check (user_id = public.helmut_current_tenant());

-- Analog anzuwenden auf die mandantenbezogenen Tabellen:
--   decisions, matching_results, office_outputs, profile_embeddings,
--   personalized_recommendations, daily_tasks, communication_drafts,
--   user_notes, priority_changes, interactions, topic_memory, briefings,
--   mandate_profiles, profiles (profiles ggf. self-scope über id = tenant)
--
-- BEWUSST OHNE Policy (mandantenlos, öffentlich):
--   raw_documents, knowledge_objects, ko_document_links, ko_relations, sources
--   (Lesezugriff für alle Tenants gewollt; Schreibzugriff nur Service-Role/Backend)
--
-- Hygiene (separat, aus audit/saas-risk-matrix.md #7/#8):
--   revoke execute on function public.helmut_ensure_profile() from anon, authenticated;
--   alter function public.helmut_set_updated_at() set search_path = public, pg_temp;
--   alter function public.match_knowledge_objects(...) set search_path = public, pg_temp;
```

Erforderliche **App-Änderung** (separater, späterer Schritt — nicht Teil dieses Entwurfs):
`SET LOCAL app.user_id = '<tenant>'` je Request setzen und für Tenant-Tabellen die
non-BYPASSRLS-Rolle verwenden. Ohne diese Änderung sind die Policies wirkungslos
(Service-Role umgeht sie).

---

## 5. Rollout, Test, Rollback

- **Rollout:** zuerst auf einem Supabase-Branch/Staging; App-GUC-Wiring + non-BYPASSRLS-Rolle bereitstellen; Policies je Tabelle; Smoke gegen alle Tenant-Pfade.
- **Test:** RLS-Suite — (a) ohne gesetzten `app.user_id` → 0 Zeilen; (b) Tenant A sieht nur A; (c) `anon`/`authenticated` → deny; (d) Service-Role/Shared-Tabellen weiter lesbar. Ergänzt die App-seitige `scripts/tenant-guard-test.js`.
- **Rollback:** `drop policy …` je Tabelle (Policies sind additiv); Rückfall auf Service-Role-Only + App-Guard (P0-1) — funktional wie heute. Kein Datenverlust.
- **Risiko beim Rollout:** Wenn die App-GUC nicht gesetzt ist, blocken die Policies **alle** Tenant-Reads → Leerzustände. Deshalb App-Wiring **vor** Policy-Aktivierung.

---

## 6. Nicht Teil von Sprint 1

Dieser Entwurf wird **nicht** in Sprint 1 umgesetzt. Sprint 1 liefert ausschließlich
den app-seitigen Tenant-Guard (P0-1). Die Ausführung der Policies + App-GUC-Wiring
ist ein eigener, freigabepflichtiger Schritt (DB/Security).
