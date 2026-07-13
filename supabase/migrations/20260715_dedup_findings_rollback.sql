-- Helmut — Neue Quellenarchitektur · Sprint 3: Rollback (Dedup + Fundstellen)
-- ===========================================================================
-- Entfernt ausschliesslich die in 20260715_dedup_findings.sql NEU angelegten Objekte
-- (Tabelle document_findings + additive raw_documents-Spalten + Indizes). Bestehende
-- Spalten/Daten in raw_documents bleiben unangetastet. Risikofrei (rein additiv).

begin;

drop table if exists public.document_findings cascade;

drop index if exists public.idx_raw_documents_content_fingerprint;
drop index if exists public.idx_raw_documents_publisher;

alter table public.raw_documents
  drop column if exists content_fingerprint,
  drop column if exists publisher_id,
  drop column if exists canonical_target_url,
  drop column if exists finding_count;

commit;
