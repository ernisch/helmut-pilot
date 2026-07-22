-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback zu 20260722_readonly_role.sql (Sprint 11, Preview).
-- Entfernt ausschließlich die neu erzeugten Policies, Grants und die Rolle.
-- Zustand danach identisch zum Stand vor der Read-only-Rollen-Migration.
-- NUR PREVIEW / freigabepflichtig für Production (dort ohnehin nicht angewendet).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Policies entfernen ───────────────────────────────────────────────────
do $$
declare
  t text;
  tenant_tables text[] := array[
    'decisions', 'matching_results', 'office_outputs', 'profile_embeddings', 'briefings',
    'mandate_profiles', 'political_items', 'personalized_recommendations', 'daily_tasks',
    'communication_drafts', 'user_notes', 'priority_changes', 'interactions',
    'topic_memory', 'matching_weights', 'llm_usage', 'profiles'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('drop policy if exists tenant_ro_isolation on public.%I', t);
  end loop;
end $$;

drop policy if exists tenant_ro_isolation_select on public.helmut_store;

do $$
declare
  t text;
  shared_tables text[] := array['knowledge_objects', 'raw_documents', 'ko_document_links', 'ko_relations', 'sources'];
begin
  foreach t in array shared_tables loop
    execute format('drop policy if exists shared_ro_read on public.%I', t);
  end loop;
end $$;

-- ── 1b. PUBLIC-EXECUTE-Default wiederherstellen ─────────────────────────────
-- Die Vorwärts-Migration entzog PUBLIC das EXECUTE auf alle public-Funktionen.
-- Rollback stellt den Postgres-Default (PUBLIC=EXECUTE) wieder her.
grant execute on all functions in schema public to public;

-- ── 2. Rolle entprivilegieren und löschen ───────────────────────────────────
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'helmut_readonly') then
    -- Alle Objektrechte der Rolle entziehen, sonst schlägt DROP ROLE fehl.
    execute 'revoke all on all tables in schema public from helmut_readonly';
    execute 'revoke all on all functions in schema public from helmut_readonly';
    execute 'revoke all on schema public from helmut_readonly';
    -- auch die in der Vorwärts-Migration gewährten auth-Schema-Rechte (Befund
    -- der Preview-Validierung: sonst „role ... cannot be dropped, depends on
    -- privileges for schema auth / function auth.jwt()").
    if exists (select 1 from pg_namespace where nspname = 'auth') then
      execute 'revoke all on all functions in schema auth from helmut_readonly';
      execute 'revoke all on schema auth from helmut_readonly';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticator') then
      execute 'revoke helmut_readonly from authenticator';
    end if;
    execute 'drop role helmut_readonly';
  end if;
end $$;

commit;
