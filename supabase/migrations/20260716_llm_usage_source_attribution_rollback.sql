-- Rollback zu 20260716_llm_usage_source_attribution.sql
-- ==============================================================================
-- Entfernt ausschliesslich die vier additiv angelegten Zuordnungsspalten und ihre Indizes.
-- Da die Migration rein additiv ist (keine bestehende Spalte/Daten veraendert), ist der
-- Rollback risikofrei. Idempotent.

begin;

drop index if exists public.llm_usage_source_created_idx;
drop index if exists public.llm_usage_package_created_idx;
-- (llm_usage_step_created_idx entfällt: der pipeline_step-Index wurde in der Migration entfernt,
--  da die Spalte im realen llm_usage-Schema nicht existiert — Sprint-10-Preflight.)

alter table public.llm_usage drop column if exists source_id;
alter table public.llm_usage drop column if exists package_id;
alter table public.llm_usage drop column if exists vorgang_id;
alter table public.llm_usage drop column if exists knowledge_object_id;

notify pgrst, 'reload schema';

commit;
