-- Helmut — Neue Quellenarchitektur · Sprint 7: Kostenzuordnung je Quelle/Paket/Vorgang
-- ==============================================================================
-- Ergaenzt public.llm_usage ADDITIV um die Zuordnungsspalten source_id, package_id,
-- vorgang_id, knowledge_object_id. Damit werden KI-Kosten je Abrufweg/Paket/Vorgang
-- zuordenbar (Auftrag Sprint 7 §9). Spiegelt die additiven Felder in buildLlmUsageRecord
-- (lib/helmut/storage.js). Aendert KEINE bestehende Spalte und KEINE Daten; aeltere Zeilen
-- bleiben NULL (dann ist die Kosten-Zuordnung ehrlich "nicht zuordenbar" statt erfunden).
--
-- source_id ist ein WEICHER, wertbasierter Verweis (= v1Sources.id = raw_documents.source_id
-- = retrieval_paths.legacy_source_id), bewusst KEIN harter FK, damit diese Migration von der
-- Reihenfolge der Sprint-1-Migration entkoppelt bleibt (konsistent mit 20260715).
--
-- FREIGABEPFLICHTIG: NICHT automatisch auf Production angewendet. Idempotent.
-- Rollback: 20260716_llm_usage_source_attribution_rollback.sql.

alter table public.llm_usage add column if not exists source_id text;
alter table public.llm_usage add column if not exists package_id text;
alter table public.llm_usage add column if not exists vorgang_id text;
alter table public.llm_usage add column if not exists knowledge_object_id text;

-- Aggregation "Kosten je Quelle/Paket/Pipeline-Schritt im Zeitfenster" schnell halten.
create index if not exists llm_usage_source_created_idx on public.llm_usage (source_id, created_at);
create index if not exists llm_usage_package_created_idx on public.llm_usage (package_id, created_at);
create index if not exists llm_usage_step_created_idx on public.llm_usage (pipeline_step, created_at);
