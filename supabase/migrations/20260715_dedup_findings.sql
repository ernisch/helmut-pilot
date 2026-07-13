-- Helmut — Neue Quellenarchitektur · Sprint 3: globale Dedup + Fundstellenmodell
-- ==============================================================================
-- Ergaenzt raw_documents additiv um echte Dedup-Signale und fuehrt ein Fundstellenmodell
-- (document_findings) ein: ein Artikel ueber mehrere Suchwege -> EIN raw_document, mehrere
-- Fundstellen. Aendert KEINE bestehende Spalte/Daten.
--
-- Wichtige Trennung: content_hash (bestehend) ist ein URL/Titel-Hash. content_fingerprint
-- (neu) ist der echte Inhaltsfingerabdruck (bereinigter Titel+Kontext) -> beide getrennt.
-- publisher_id/retrieval_path_id sind WEICHE Verweise (text, kein harter FK), um diese
-- Migration von der Reihenfolge der Sprint-1-Migration zu entkoppeln.
--
-- FREIGABEPFLICHTIG: NICHT automatisch auf Production angewendet. Rollback:
-- 20260715_dedup_findings_rollback.sql. Idempotent.

begin;

-- 1) raw_documents additiv erweitern -----------------------------------------
alter table public.raw_documents
  add column if not exists content_fingerprint text,        -- echter Inhaltsfingerabdruck (getrennt von content_hash)
  add column if not exists publisher_id         text,        -- weicher Verweis auf public.publishers (Herausgeber)
  add column if not exists canonical_target_url text,        -- vom Ziel deklarierte Canonical (rel=canonical/og:url)
  add column if not exists finding_count        integer not null default 1; -- Anzahl Fundstellen (denormalisiert)

create index if not exists idx_raw_documents_content_fingerprint on public.raw_documents(content_fingerprint);
create index if not exists idx_raw_documents_publisher on public.raw_documents(publisher_id);

comment on column public.raw_documents.content_fingerprint is 'Echter Inhaltsfingerabdruck (bereinigter Titel+Kontext, tokensortiert) — getrennt vom URL/Titel-basierten content_hash.';
comment on column public.raw_documents.publisher_id is 'Weicher Verweis auf public.publishers (aufgeloeste Herausgeberdomain, NICHT Google News).';

-- 2) document_findings: Fundstellen (mehrere Suchwege je Dokument) ------------
create table if not exists public.document_findings (
  raw_document_id   text not null references public.raw_documents(id) on delete cascade,
  source_id         text not null,            -- Katalog-/Legacy-Quelle, ueber die gefunden wurde
  retrieval_path_id text,                      -- weicher Verweis auf public.retrieval_paths
  original_url      text not null default '',  -- konkrete Fund-URL (z. B. Google-News-Proxy)
  link_type         text,                      -- direct/publisher/google_proxy/missing
  found_at          timestamptz,
  created_at        timestamptz not null default now(),
  primary key (raw_document_id, source_id, original_url)
);
create index if not exists idx_document_findings_source on public.document_findings(source_id);
create index if not exists idx_document_findings_path on public.document_findings(retrieval_path_id);
comment on table public.document_findings is 'Global geteilte Fundstellen: derselbe Artikel ueber mehrere Suchwege -> 1 raw_document, N Fundstellen (Nachvollziehbarkeit der Suchwege, Auftrag §16).';

-- 3) RLS: global geteilt, service_role-only (konsistent mit Sprint-2-Verschaerfung) ---
do $$
begin
  execute 'alter table public.document_findings enable row level security';
  execute 'drop policy if exists document_findings_read on public.document_findings';
  -- BEWUSST KEINE for-select-Policy: interne/oeffentliche Fundstellen, nur service_role.
end $$;

commit;
