-- Helmut — Neue Quellenarchitektur · Sprint 2: Knowledge-Object-Klassifikation
-- ==============================================================================
-- Ergaenzt knowledge_objects additiv um die strukturierte Klassifikation
-- (Entscheidungsebene, verwandte Ebenen, Geografie, Entitaeten, Ereignistyp,
-- dimensionierte Konfidenz). Aendert KEINE bestehende Spalte/Daten.
--
-- Die vorhandene Spalte political_level (text) bleibt und wird ab Sprint 2 mit
-- decision_level gespiegelt (Rueckwaertskompatibilitaet fuer Matching/Read).
-- Die vorhandene Spalte embedding (vector) bleibt; sie wird ab Sprint 2 write-time
-- befuellt (Assembler) statt read-time berechnet.
--
-- FREIGABEPFLICHTIG: NICHT automatisch auf Production angewendet. Rollback:
-- 20260714_ko_classification_rollback.sql. Idempotent (add column if not exists).

begin;

alter table public.knowledge_objects
  add column if not exists decision_level            text,
  add column if not exists related_levels            text[]  not null default '{}',
  add column if not exists event_type                text,
  add column if not exists affected_geographies       jsonb   not null default '[]',
  add column if not exists mentioned_geographies      jsonb   not null default '[]',
  add column if not exists decision_entities          jsonb   not null default '[]',
  add column if not exists related_entities           jsonb   not null default '[]',
  add column if not exists classification_confidence  jsonb   not null default '{}';

-- Index fuer die haeufige Ebenen-Filterung (Bund vs. Land) im Matching/Admin.
create index if not exists idx_knowledge_objects_decision_level on public.knowledge_objects(decision_level);

comment on column public.knowledge_objects.decision_level is 'Politische Entscheidungsebene (international/eu/bund/land/kommune). Ab Sprint 2 nie leer (Deriver). Spiegelt sich auf political_level.';
comment on column public.knowledge_objects.affected_geographies is 'jsonb: [{name, level, geography_id}] — betroffene Geografien (aufgeloest gegen public.geographies).';
comment on column public.knowledge_objects.decision_entities is 'jsonb: [{name, type, entity_id}] — handelnde Institutionen (aufgeloest gegen public.political_entities).';

commit;
