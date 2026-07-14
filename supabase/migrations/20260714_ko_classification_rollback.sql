-- Helmut — Neue Quellenarchitektur · Sprint 2: Rollback der KO-Klassifikation
-- ============================================================================
-- Entfernt ausschliesslich die in 20260714_ko_classification.sql NEU angelegten
-- Spalten + Index. Bestehende Spalten (political_level, embedding, ...) bleiben
-- unangetastet. Risikofrei (rein additive Migration wird zurueckgenommen).

begin;

drop index if exists public.idx_knowledge_objects_decision_level;

alter table public.knowledge_objects
  drop column if exists decision_level,
  drop column if exists related_levels,
  drop column if exists event_type,
  drop column if exists affected_geographies,
  drop column if exists mentioned_geographies,
  drop column if exists decision_entities,
  drop column if exists related_entities,
  drop column if exists classification_confidence;

commit;
