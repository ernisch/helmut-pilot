-- Rollback zu 20260721_security_advisor_hardening.sql.
-- Stellt den Zustand VOR der Härtung wieder her (read-only gegen Prod verifiziert
-- 2026-07-16): die 5 Funktionen ohne fixen search_path, helmut_ensure_profile mit
-- search_path=public (der vorherige, nicht public+pg_temp), und die PUBLIC-EXECUTE-
-- bzw. Default-CRUD-Grants zurück.
--
-- FREIGABEPFLICHTIG, manuell. Idempotent genug fürs erneute Einspielen.

begin;

-- 1) search_path zurücknehmen (die 5 waren vorher OHNE proconfig).
alter function public.helmut_set_updated_at() reset search_path;
alter function public.match_knowledge_objects(vector, integer, text[], text[], text[]) reset search_path;
alter function public.helmut_reserve_llm_call(text, text, integer) reset search_path;
alter function public.helmut_acquire_pipeline_lock(text, bigint) reset search_path;
alter function public.helmut_release_pipeline_lock(text, text) reset search_path;

-- 2) helmut_ensure_profile: vorheriger search_path war NUR 'public'; EXECUTE zurück.
alter function public.helmut_ensure_profile() set search_path = public;
grant execute on function public.helmut_ensure_profile() to public;

-- 3) match_knowledge_objects: PUBLIC EXECUTE zurück (SQL-Default für neue Funktionen).
grant execute on function public.match_knowledge_objects(vector, integer, text[], text[], text[]) to public;

-- 4) Default-CRUD-Grants der Telemetrie-Tabellen zurück (Supabase-Bootstrap-Zustand).
grant all on table public.gate_shadow_events to anon, authenticated;
grant all on table public.document_findings to anon, authenticated;

commit;
