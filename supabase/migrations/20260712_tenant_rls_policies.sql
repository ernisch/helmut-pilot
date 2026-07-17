-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  ENTWURF (P0-2, Sprint 2) — NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBER-
--     FREIGABE. Dieses Repo hat KEINE CI/CD-Automatisierung, die Dateien aus
--     supabase/migrations/ automatisch einspielt (verifiziert: kein `supabase
--     db push` / kein Migration-Runner in .github/workflows oder
--     scripts/vercel-deploy.sh). Anwendung geschieht ausschließlich manuell
--     durch einen Menschen (`psql < diese-datei.sql` oder Supabase-Dashboard/
--     MCP `apply_migration`), analog zu 20260711_presale_hardening.sql.
--
--     In Sprint 2 wurde diese Datei NUR VORBEREITET, NICHT AUSGEFÜHRT.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tenant-RLS-Policies — schließt P0-2 aus audit/fix-plan.md / audit/saas-risk-matrix.md #1.
-- Zweite Verteidigungslinie zusätzlich zum App-seitigen Tenant-Guard (P0-1,
-- lib/helmut/storage.js assertTenant/assertTenantRows).
--
-- Vollständig verifiziert gegen die Live-Datenbank (Supabase ddckuvvpcytqbyfmbvie,
-- 2026-07-12, read-only) — siehe docs/rls-tenant-policies-draft.md für die
-- vollständige Herleitung, Policy-Matrix und Begründung pro Tabelle.
--
-- KERNBEFUND DER VERIFIKATION (korrigiert den Sprint-1-Entwurf):
--   1. Die App spricht Supabase AUSSCHLIESSLICH über PostgREST-HTTP-Calls mit
--      statischem `Authorization: Bearer <service_role_key>` an (kein pg-Client,
--      "dependencies": {} in package.json). Ein `SET LOCAL app.user_id` (wie im
--      Sprint-1-Entwurf skizziert) ist über diesen Transport NICHT umsetzbar —
--      es gibt keinen SQL-Statement-Kanal über REST.
--   2. Der korrekte, Supabase-native Mechanismus für stateless PostgREST ist
--      JWT-CLAIMS: auth.jwt(), auth.role(), auth.uid() sind in diesem Projekt
--      verifiziert vorhanden. Policies lesen den Tenant aus dem JWT-Claim
--      'user_id' eines PRO-MANDANT gemäss request signierten Tokens (mit der
--      `authenticated`-Rolle, NICHT service_role).
--   3. `anon` UND `authenticated` haben HEUTE BEREITS volle CRUD-Grants auf
--      ALLE 24 Tabellen (Supabase-Default-Bootstrap, verifiziert via
--      information_schema.role_table_grants). RLS mit 0 Policies ist aktuell
--      die EINZIGE Barriere. Policies werden daher explizit `TO authenticated`
--      gescoped (NIE `TO anon`) — ein anonymer Aufrufer bleibt so auch nach
--      dieser Migration vollständig ausgeschlossen (kein Claim => keine
--      passende Policy => impliziter Deny).
--   4. Die App nutzt heute für JEDEN Tenant-Pfad den service_role-Key
--      (BYPASSRLS) — diese Migration ändert daran NICHTS. Solange die App
--      nicht auf JWT-Minting + `authenticated`-Rolle umgestellt wird (separater,
--      NICHT in diesem Sprint enthaltener Folgeschritt), hat das Anwenden
--      dieser Migration FUNKTIONAL KEINE Auswirkung auf den Piloten
--      (Pilotmandat) — reine Defense-in-Depth-Vorbereitung.
--
-- Live-vs-tote Tabellen (verifiziert per grep auf /rest/v1/<table> in
-- lib/helmut/storage.js): 9 Tabellen werden von der App tatsächlich
-- angesprochen (helmut_store, decisions, matching_results, office_outputs,
-- profile_embeddings, briefings, knowledge_objects, raw_documents,
-- ko_document_links). Die übrigen 15 sind V1/V2-Aspirationsschema aus
-- schema.sql, werden NIE per REST erreicht (0 Zeilen, kein Code-Pfad) — sie
-- erhalten trotzdem konsistente Policies (Hygiene + Zukunftssicherheit),
-- OHNE dass dies irgendeinen produktiven Pfad berührt.
--
-- Voraussetzung für WIRKUNG (nicht Teil dieser Migration): die App muss für
-- Tenant-Tabellen ein pro-Request signiertes JWT mit Claim `user_id` nutzen
-- und die `authenticated`-Rolle statt service_role verwenden. Bis dahin ist
-- diese Migration ein NO-OP für den laufenden Betrieb (siehe Punkt 4).
--
-- Additiv, idempotent (create or replace / drop policy if exists / create
-- policy), KEINE DROPs an Daten oder Spalten, reversibel (siehe
-- 20260712_tenant_rls_policies_rollback.sql).

begin;

-- ── Helper: aktueller Tenant aus dem JWT-Claim 'user_id' ────────────────────
-- security invoker (läuft mit den Rechten des Aufrufers, kein Privilege-
-- Escalation-Risiko); search_path fest gesetzt (Hygiene, vgl.
-- audit/saas-risk-matrix.md #8 zu den bestehenden mutable-search_path-Funden).
create or replace function public.helmut_current_tenant()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select nullif(auth.jwt() ->> 'user_id', '')
$$;

comment on function public.helmut_current_tenant() is
  'P0-2 Tenant-Guard: liest den Mandanten (politicianId) aus dem JWT-Claim user_id. '
  'NULL ohne gueltigen Claim (auch fuer anon/service_role ohne diesen Claim) -> '
  'jede Policy, die dagegen vergleicht, verweigert dann implizit den Zugriff.';

-- ── Kategorie A: Tenant-scoped Tabellen (user_id-Spalte) ────────────────────
-- Muster identisch fuer alle Tabellen dieser Kategorie. `TO authenticated`
-- schliesst `anon` explizit aus (anon hat laut Grant-Pruefung ebenfalls CRUD-
-- Rechte, darf aber NIE durch diese Policies erfasst werden).

-- LIVE (von der App tatsaechlich ueber /rest/v1/... angesprochen):
--   decisions, matching_results, office_outputs, profile_embeddings, briefings
-- TOT/aspirational (V1/V2, 0 Zeilen, kein Code-Pfad, nur Hygiene):
--   mandate_profiles, political_items, personalized_recommendations,
--   daily_tasks, communication_drafts, user_notes, priority_changes,
--   interactions, topic_memory, matching_weights

do $$
declare
  t text;
  tenant_tables text[] := array[
    'decisions', 'matching_results', 'office_outputs', 'profile_embeddings', 'briefings',
    'mandate_profiles', 'political_items', 'personalized_recommendations', 'daily_tasks',
    'communication_drafts', 'user_notes', 'priority_changes', 'interactions',
    'topic_memory', 'matching_weights'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated ' ||
      'using (user_id = public.helmut_current_tenant()) ' ||
      'with check (user_id = public.helmut_current_tenant())',
      t
    );
  end loop;
end $$;

-- ── Sonderfall: llm_usage (hat sowohl politician_id ALS AUCH user_id — ─────
-- Schema-Inkonsistenz, keine Migration der Spalten in diesem Sprint. Policy
-- deckt BEIDE moeglichen Tenant-Spalten ab (defensiv, keine Seite bevorzugt).
alter table public.llm_usage enable row level security;
drop policy if exists tenant_isolation on public.llm_usage;
create policy tenant_isolation on public.llm_usage for all to authenticated
  using (
    user_id = public.helmut_current_tenant()
    or politician_id = public.helmut_current_tenant()
  )
  with check (
    user_id = public.helmut_current_tenant()
    or politician_id = public.helmut_current_tenant()
  );

-- ── Sonderfall: profiles (Tenant-Identitaet selbst: id IST der Mandant, ────
-- keine user_id-Spalte). Selbstzugriff: ein Mandant sieht/aendert nur die
-- eigene Profilzeile. Wird von der App heute NICHT ueber REST gelesen
-- (Profile kommen aus dem helmut_store-Blob) -> aktuell wirkungslos, aber
-- korrekt fuer den Fall kuenftiger Nutzung UND weil `profiles` als FK-Ziel
-- von 15 anderen Tabellen referenziert wird.
alter table public.profiles enable row level security;
drop policy if exists tenant_isolation on public.profiles;
create policy tenant_isolation on public.profiles for all to authenticated
  using (id = public.helmut_current_tenant())
  with check (id = public.helmut_current_tenant());

-- ── Sonderfall: helmut_store (kein user_id, Tenant im id-Praefix kodiert) ──
-- Drei id-Klassen (verifiziert, Live-Zeilen 2026-07-12): 'main' (geteilte
-- Daten: Quellenkatalog, Crawl-Runs), 'main-auth' (ALLE Accounts/Logins in
-- EINER Zeile, hochsensibel), 'main-p-<politicianId>' (pro-Mandant-Blob).
-- Policy matcht NUR das 'main-p-'-Praefix-Muster -> 'main' und 'main-auth'
-- bleiben fuer JEDE nicht-service_role-Rolle implizit gesperrt (keine
-- Policy matcht sie), das ist beabsichtigt und sicherheitskritisch richtig.
-- NUR SELECT (die App schreibt ausschliesslich ueber service_role; ein
-- tenant-scoped Direktschreibzugriff ist architektonisch nicht vorgesehen).
alter table public.helmut_store enable row level security;
drop policy if exists tenant_isolation_select on public.helmut_store;
create policy tenant_isolation_select on public.helmut_store for select to authenticated
  using (id = 'main-p-' || public.helmut_current_tenant());

-- ── Kategorie B: geteilte/oeffentliche Daten (kein Tenant-Bezug) ───────────
-- Parlamentarische Rohdaten sind bewusst mandantenlos (jeder Mandant braucht
-- denselben Korpus). Nur SELECT fuer authenticated; Schreiben bleibt
-- service_role-exklusiv (keine INSERT/UPDATE/DELETE-Policy fuer
-- authenticated -> automatisch verweigert).
do $$
declare
  t text;
  shared_tables text[] := array['knowledge_objects', 'raw_documents', 'ko_document_links', 'ko_relations', 'sources'];
begin
  foreach t in array shared_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists shared_read on public.%I', t);
    execute format('create policy shared_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ── Kategorie C: rein operational, kein Policy fuer authenticated/anon ─────
-- pipeline_locks traegt keine Nutzerdaten (nur job_name/Sperrzeiten) und wird
-- von der App nicht ueber REST gelesen (Locks leben im helmut_store-Blob).
-- RLS bleibt aktiviert, aber bewusst OHNE jegliche Policy fuer authenticated/
-- anon -> impliziter Deny fuer alle ausser service_role. Kein Aenderungsbedarf
-- (bereits RLS-enabled, 0 Policies) — Zeile nur zur Dokumentation/Vollstaendigkeit.
-- (kein ALTER/CREATE POLICY noetig, Status quo ist bereits der Zielzustand)

commit;

-- ── Verifikations-Query (read-only, NACH Anwendung manuell ausfuehren) ─────
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies where schemaname = 'public' order by tablename, policyname;
-- Erwartung: 21 Tabellen mit Policies (15 tenant + llm_usage + profiles +
-- helmut_store-select + 5 shared_read) = 22 Policy-Zeilen (helmut_store hat
-- nur select, alle anderen tenant_isolation for-all zaehlen als 1 pg_policies-
-- Zeile mit cmd='ALL'); pipeline_locks bleibt mit 0 Policies (Status quo).
