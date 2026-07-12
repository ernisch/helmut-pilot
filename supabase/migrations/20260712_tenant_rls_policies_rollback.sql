-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK für 20260712_tenant_rls_policies.sql — NUR anwenden, falls die
-- zugehörige Migration bereits angewendet wurde und rückgängig gemacht werden
-- soll. Entfernt ausschliesslich die dort erzeugten Policies + Helper-Funktion.
-- Rein additiv rückgängig gemacht: KEINE Datenlöschung, KEINE Spaltenänderung.
-- RLS bleibt auf allen 24 Tabellen aktiviert (Status quo vor UND nach diesem
-- Rollback: RLS enabled, 0 Policies — exakt der heute (2026-07-12) verifizierte
-- Ausgangszustand).
--
-- Ergebnis nach Rollback: identisch zum Zustand vor der Migration. Da die App
-- weiterhin ausschliesslich service_role nutzt (RLS-Bypass), ist auch dieser
-- Rollback-Schritt FUNKTIONAL wirkungslos für den laufenden Betrieb.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  t text;
  tenant_tables text[] := array[
    'decisions', 'matching_results', 'office_outputs', 'profile_embeddings', 'briefings',
    'mandate_profiles', 'political_items', 'personalized_recommendations', 'daily_tasks',
    'communication_drafts', 'user_notes', 'priority_changes', 'interactions',
    'topic_memory', 'matching_weights', 'llm_usage', 'profiles'
  ];
  shared_tables text[] := array['knowledge_objects', 'raw_documents', 'ko_document_links', 'ko_relations', 'sources'];
begin
  foreach t in array tenant_tables loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
  end loop;

  foreach t in array shared_tables loop
    execute format('drop policy if exists shared_read on public.%I', t);
  end loop;
end $$;

drop policy if exists tenant_isolation_select on public.helmut_store;

drop function if exists public.helmut_current_tenant();

commit;

-- ── Verifikations-Query (read-only, NACH Rollback manuell ausfuehren) ──────
-- select count(*) from pg_policies where schemaname = 'public';
-- Erwartung: 0 (identisch zum verifizierten Ausgangszustand vor der Migration).
