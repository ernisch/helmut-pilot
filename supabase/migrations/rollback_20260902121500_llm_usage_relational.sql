-- Rollback zu 20260902121500_llm_usage_relational.sql
-- ==============================================================================
-- Nimmt die ADDITIVE Erweiterung von `public.llm_usage` vollständig zurück. Der
-- Code fällt dann fail-safe auf den Auth-Store-Blob zurück (Flag
-- `HELMUT_LLM_USAGE_RELATIONAL` zusätzlich auf off setzen bzw. entfernen).
--
-- ACHTUNG — WAS DABEI VERLOREN GEHT: die Inhalte der fünf hier entfernten
-- Spalten (tenant_id, profile_id, run_id, pipeline_step, kein_aufruf) für ALLE
-- Zeilen. Im Dual-Write (Phase 2) steht derselbe Eintrag zusätzlich im
-- Blob-Spiegel; ab Phase 3/4 wäre er es NICHT mehr. Dieses Rollback ist deshalb
-- ausdrücklich nur für Phase 2 vorgesehen.
--
-- Die TABELLE selbst wird NICHT gelöscht: sie existierte lange vor dieser
-- Migration und trägt Spalten aus 20260716. Ein `drop table` wäre hier kein
-- Rollback, sondern ein Datenverlust jenseits dieser Migration.
-- Idempotent.

begin;

drop index if exists public.llm_usage_keinaufruf_created_idx;
drop index if exists public.llm_usage_calltype_created_idx;
drop index if exists public.llm_usage_created_idx;

alter table public.llm_usage drop column if exists kein_aufruf;
alter table public.llm_usage drop column if exists pipeline_step;
alter table public.llm_usage drop column if exists run_id;
alter table public.llm_usage drop column if exists profile_id;
alter table public.llm_usage drop column if exists tenant_id;

comment on table public.llm_usage is null;

notify pgrst, 'reload schema';

commit;
