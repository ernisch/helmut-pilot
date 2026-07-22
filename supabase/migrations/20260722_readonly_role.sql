-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  ENTWURF (Sprint 11, Preview-Validierung) — NICHT AUF PRODUCTION ANWENDEN
--     OHNE AUSDRÜCKLICHE BETREIBER-FREIGABE. Analog zu 20260712_tenant_rls_
--     policies.sql wird diese Datei ausschließlich VORBEREITET und in einer
--     WEGWERFBAREN lokalen Preview-Postgres validiert (scripts/preview/).
--     In Sprint 11 wurde NICHTS an Production geändert.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ziel-Architektur-Baustein: dedizierte READ-ONLY-ROLLE `helmut_readonly`.
--
-- Motivation: Die Sprint-2-Policies laufen `TO authenticated`. Die Rolle
-- `authenticated` besitzt jedoch per Supabase-Default volle CRUD-GRANTS — RLS
-- ist dort die EINZIGE Barriere gegen Schreibzugriffe. Die Zielarchitektur
-- fügt eine zweite, grant-basierte Verteidigungslinie hinzu: eine Rolle, die
-- physisch nur SELECT darf (INSERT/UPDATE/DELETE grant-seitig unmöglich),
-- kein EXECUTE auf Funktionen (RPC gesperrt) und KEIN BYPASSRLS (keine
-- Eskalation). GoTrue-Tokens des Lese-Pfads tragen `role: helmut_readonly`.
--
-- Defense-in-Depth für den Secure Read Path:
--   Layer 1 (GRANT):  nur SELECT  → Schreibversuch = 42501 permission denied
--   Layer 2 (RLS):    SELECT tenant-gefiltert (user_id = helmut_current_tenant())
--   Layer 3 (ROLE):   NOBYPASSRLS → RLS wird immer ausgewertet
--   Layer 4 (RPC):    kein EXECUTE → RPC/Funktionsaufruf gesperrt
--
-- Additiv, idempotent, reversibel (20260722_readonly_role_rollback.sql).

begin;

-- ── 1. Rolle anlegen (NOLOGIN, NOINHERIT, NOBYPASSRLS) ──────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'helmut_readonly') then
    create role helmut_readonly nologin noinherit nobypassrls;
  else
    -- Härtung erzwingen, falls die Rolle bereits existiert.
    alter role helmut_readonly nologin noinherit nobypassrls;
  end if;
end $$;

-- PostgREST-Login-Rolle darf pro Request auf helmut_readonly wechseln.
-- (In Supabase heißt sie `authenticator`; falls vorhanden, Mitgliedschaft geben.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant helmut_readonly to authenticator';
  end if;
end $$;

-- ── 2. GRANTS: ausschließlich SELECT ────────────────────────────────────────
-- Schema-Nutzung, aber KEIN create.
grant usage on schema public to helmut_readonly;

-- BEFUND DER PREVIEW-VALIDIERUNG (Sprint 11): Die RLS-Policies rufen
-- public.helmut_current_tenant() → auth.jwt() auf. Eine benutzerdefinierte
-- Rolle braucht dafür USAGE auf dem auth-Schema und EXECUTE auf auth.jwt()
-- (Supabase gewährt das `authenticated` implizit; einer neuen Rolle NICHT).
-- Ohne diese Grants scheitert jeder SELECT mit „permission denied for schema
-- auth" — d. h. fail-closed, aber als Fehler statt als leere Menge.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'grant usage on schema auth to helmut_readonly';
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'auth' and p.proname = 'jwt'
    ) then
      execute 'grant execute on function auth.jwt() to helmut_readonly';
    end if;
  end if;
end $$;

-- Erst alle etwaigen Schreibrechte entziehen (Idempotenz/Härtung), dann nur
-- SELECT auf die für einen Endnutzer lesbaren Tabellen gewähren.
revoke insert, update, delete, truncate on all tables in schema public from helmut_readonly;

-- Tenant-Tabellen (Kategorie A) + Sonderfälle + geteilte Daten: SELECT.
grant select on
  public.decisions, public.matching_results, public.office_outputs,
  public.profile_embeddings, public.briefings, public.mandate_profiles,
  public.political_items, public.personalized_recommendations,
  public.daily_tasks, public.communication_drafts, public.user_notes,
  public.priority_changes, public.interactions, public.topic_memory,
  public.matching_weights, public.llm_usage, public.profiles,
  public.helmut_store, public.knowledge_objects, public.raw_documents,
  public.ko_document_links, public.ko_relations, public.sources
  to helmut_readonly;

-- pipeline_locks: KEIN Grant (operativ, keine Nutzerdaten).

-- ── 3. RPC hart sperren: kein EXECUTE auf öffentliche Funktionen ────────────
-- BEFUND DER PREVIEW-VALIDIERUNG (Sprint 11): `revoke ... from helmut_readonly`
-- allein GENÜGT NICHT. Postgres vergibt EXECUTE per Default an PUBLIC — die
-- Rolle behält den Aufruf also über die PUBLIC-Mitgliedschaft. Eine SECURITY
-- DEFINER-Funktion, die einem Superuser gehört, läuft dann MIT dessen Rechten
-- und UMGEHT RLS (verifiziert: rpc_canary_all_office lieferte alle Mandanten).
-- Korrekt ist daher der Entzug von PUBLIC, gefolgt von einer expliziten
-- Allowlist. (Fail-closed statt fail-open.)
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from helmut_readonly;

-- Die Tenant-Helper-Funktion muss von JEDER Rolle aufrufbar bleiben, deren
-- Policies sie auswerten (security invoker, keine Eskalation).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'helmut_current_tenant'
  ) then
    execute 'grant execute on function public.helmut_current_tenant() '
         || 'to helmut_readonly, authenticated, service_role';
  end if;
end $$;

-- WICHTIG für Production: Nach `revoke execute ... from public` müssen ALLE
-- legitim benötigten RPCs (z. B. match_knowledge_objects) explizit an die
-- Rollen re-granted werden, die sie brauchen — sonst brechen sie still. Diese
-- Allowlist ist deployment-spezifisch und hier bewusst NICHT hartcodiert
-- (Preview kennt nur den Kanarienvogel). helmut_readonly erhält KEINE RPC.

-- ── 4. RLS-Policies für helmut_readonly (SELECT-only, tenant-gefiltert) ──────
-- Eigenständige Policies statt Mitgliedschaft in `authenticated` — der
-- Lese-Pfad ist damit vollständig self-contained und explizit auditierbar.

-- Kategorie A: nur eigene Zeilen sichtbar.
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
    execute format('drop policy if exists tenant_ro_isolation on public.%I', t);
    execute format(
      'create policy tenant_ro_isolation on public.%I for select to helmut_readonly ' ||
      'using (user_id = public.helmut_current_tenant())',
      t
    );
  end loop;
end $$;

-- llm_usage: user_id ODER politician_id.
alter table public.llm_usage enable row level security;
drop policy if exists tenant_ro_isolation on public.llm_usage;
create policy tenant_ro_isolation on public.llm_usage for select to helmut_readonly
  using (
    user_id = public.helmut_current_tenant()
    or politician_id = public.helmut_current_tenant()
  );

-- profiles: Selbstzugriff (id IST der Mandant).
alter table public.profiles enable row level security;
drop policy if exists tenant_ro_isolation on public.profiles;
create policy tenant_ro_isolation on public.profiles for select to helmut_readonly
  using (id = public.helmut_current_tenant());

-- helmut_store: nur die eigene main-p-<tenant>-Zeile.
alter table public.helmut_store enable row level security;
drop policy if exists tenant_ro_isolation_select on public.helmut_store;
create policy tenant_ro_isolation_select on public.helmut_store for select to helmut_readonly
  using (id = 'main-p-' || public.helmut_current_tenant());

-- Geteilte Daten: alle Zeilen lesbar (mandantenlos), aber nur für die Rolle.
do $$
declare
  t text;
  shared_tables text[] := array['knowledge_objects', 'raw_documents', 'ko_document_links', 'ko_relations', 'sources'];
begin
  foreach t in array shared_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists shared_ro_read on public.%I', t);
    execute format('create policy shared_ro_read on public.%I for select to helmut_readonly using (true)', t);
  end loop;
end $$;

commit;

-- ── Verifikation (read-only, nach Anwendung) ────────────────────────────────
-- select rolname, rolbypassrls, rolcanlogin from pg_roles where rolname='helmut_readonly';
--   Erwartung: rolbypassrls=f, rolcanlogin=f
-- select count(*) from information_schema.role_table_grants
--   where grantee='helmut_readonly' and privilege_type in ('INSERT','UPDATE','DELETE');
--   Erwartung: 0
-- select count(*) from pg_policies where 'helmut_readonly' = any(roles); Erwartung: 23
--   (15 tenant_ro_isolation + llm_usage + profiles + helmut_store-select + 5 shared_ro_read)
