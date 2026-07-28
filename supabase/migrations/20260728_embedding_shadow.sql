-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint 22C1) — NICHT ANWENDEN OHNE AUSDRÜCKLICHE
--     BETREIBERFREIGABE (CLAUDE.md §5). Dieses Repo spielt Migrationen NICHT
--     automatisch ein; Anwendung ausschließlich manuell durch einen Menschen
--     (psql / Supabase-Dashboard / MCP apply_migration).
--     Rollback: 20260728_embedding_shadow_rollback.sql (gleiches Verzeichnis).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Additive Shadow-Struktur für SEMANTISCHE Text-Embeddings je Wissensobjekt —
-- getrennt von der bestehenden Spalte knowledge_objects.embedding (die ein
-- deterministischer Merkmalsvektor ist und von dieser Struktur NIE
-- überschrieben, verändert oder gelesen wird). Kanonische Doku:
-- docs/embedding-architektur.md (§5/§6, Sprint 22C1 §14).
--
-- Grundsätze:
--  * ADDITIV: keine bestehende Tabelle, Spalte, Funktion oder Policy wird
--    verändert. Das produktive Matching (match_knowledge_objects) bleibt
--    unberührt; die Anwendung liest diese Tabelle in Sprint 22C1 NICHT.
--  * mandantenlos (kein user_id) — derselbe Vektor gilt für Bund, Berlin,
--    Brandenburg und künftige Länder; Profil-Personalisierung bleibt in
--    profile_embeddings.
--  * vollständiger Datenvertrag: Art, Modell(-familie), Modellversion,
--    Provider, Deployment, API-Version, Dimension, Rezeptversion, Input-Hash,
--    Tokenmenge, Zeiten, Status, Fehler- und Versuchsdaten.
--  * Dimension bewusst NICHT im Spaltentyp fixiert (vector ohne Klammern),
--    damit ein Modellvergleich ohne Schemaänderung möglich ist; die
--    Pflichtprüfung der Dimension läuft über die Spalte dim + App-Validierung
--    (lib/helmut/embedding-contract.js::validateVector) vor jedem Schreiben.
--  * Modellwechsel bleiben möglich: der Primärschlüssel erlaubt je Objekt
--    mehrere (Modell, Dimension, Rezept)-Generationen nebeneinander; die
--    Teilindex-Eindeutigkeit unten erzwingt, dass davon höchstens EINE als
--    aktiv markiert ist.
--  * KEIN ivfflat/HNSW-Index: bei der aktuellen Größenordnung (<2 000 Zeilen)
--    ist exakte Suche ausreichend; ein approximativer Index wird erst bei
--    gemessenem Bedarf ergänzt.
-- DSGVO: Inhalt sind mandantenlose Verstehens-Metadaten + Vektor — keine
-- Nutzer-, Mandats- oder Prioritätsdaten (testgesichert im Datenvertrag).

begin;

create table if not exists public.knowledge_object_embeddings (
  knowledge_object_id text not null
    references public.knowledge_objects(id) on delete cascade,
  embedding_kind text not null default 'semantic_text'
    check (embedding_kind in ('semantic_text')),
  model text not null,                    -- Modellfamilie/-name, z. B. text-embedding-3-small
  model_version text,                     -- Modellversion, soweit der Provider sie zuverlässig liefert (Azure: nicht je Antwort → null ist ehrlich)
  provider text not null,                 -- z. B. azure-openai
  deployment text,                        -- Azure-Deploymentname; bei anderen Providern null
  api_version text,                       -- z. B. 2024-10-21
  dim integer not null check (dim > 0),
  recipe_version text not null,           -- z. B. ko-kanon-1
  input_hash text not null,
  input_tokens integer,                   -- Tokenmenge des Eingangs (deterministische Schätzung ~4 Zeichen/Token, identisch zur Limit-Prüfung; die providergemeldete Gesamt-Tokenmenge je Lauf steht im Laufprotokoll)
  embedding vector,                       -- null solange status <> 'aktuell'
  is_active boolean not null default true,
  status text not null default 'ausstehend'
    check (status in ('ausstehend', 'aktuell', 'fehlgeschlagen')),
  last_error text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (knowledge_object_id, embedding_kind, model, dim, recipe_version)
);

-- Genau EINE aktive Repräsentation je Wissensobjekt und Art — durch die
-- Datenbank erzwungen. Ein Modellwechsel muss die alte Generation zuerst
-- ausdrücklich deaktivieren (is_active=false), sonst schlägt der Insert laut
-- fehl; alte Modellversionen bleiben nachvollziehbar erhalten.
create unique index if not exists knowledge_object_embeddings_active_uidx
  on public.knowledge_object_embeddings (knowledge_object_id, embedding_kind)
  where is_active;

-- Statusabfragen des Backfills (ausstehend/fehlgeschlagen zuerst) ohne Vollscan.
create index if not exists knowledge_object_embeddings_status_idx
  on public.knowledge_object_embeddings (status);

-- updated_at-Pflege über die bestehende Konvention (helmut_set_updated_at,
-- search_path bereits per 20260721 gehärtet).
create or replace trigger set_updated_at
  before update on public.knowledge_object_embeddings
  for each row execute function public.helmut_set_updated_at();

comment on table public.knowledge_object_embeddings is
  'Shadow-Tabelle für semantische Text-Embeddings (Sprint 22C1). Mandantenlos. Ersetzt NICHT knowledge_objects.embedding (deterministischer Merkmalsvektor). Wird von der Anwendung in 22C1 nicht gelesen.';
comment on column public.knowledge_object_embeddings.input_hash is
  'sha256 über Rezeptversion + kanonischen Eingangstext (lib/helmut/embedding-contract.js). Weicht der Hash vom aktuellen Objekt ab, ist das Embedding veraltet.';
comment on column public.knowledge_object_embeddings.is_active is
  'Genau eine aktive (Modell, Dimension, Rezept)-Generation je Objekt+Art (Teilindex knowledge_object_embeddings_active_uidx). Alte Generationen: is_active=false.';

-- Zugriffsschutz wie bei den übrigen mandantenlosen Wissenstabellen:
-- RLS aktiv, KEINE Policies (kein anon/authenticated-Zugriff, keine
-- öffentliche Schreibpolicy); nur service_role (BYPASSRLS) schreibt
-- kontrolliert über die Backfill-Pipeline. Zusätzlich Default-Grants
-- explizit entziehen (Belt-and-suspenders, Konvention 20260721).
alter table public.knowledge_object_embeddings enable row level security;
revoke all on table public.knowledge_object_embeddings from public, anon, authenticated;

-- ── Lock-Erneuerung (additiv, Familie 20260719) ─────────────────────────────
-- Der Embedding-Backfill hält einen EIGENEN Pipeline-Lock
-- (job_name 'semantic_embedding_backfill' — nie der Crawl-/Understanding-Lock)
-- und muss ihn zwischen Batches verlängern können, ohne ihn freizugeben.
-- Verlängert NUR der Token-Halter; ein abgelaufener und von einem fremden
-- Lauf übernommener Lock kann nicht "zurückerneuert" werden (Token weicht ab).
create or replace function public.helmut_renew_pipeline_lock(p_job text, p_token text, p_ttl_ms bigint)
returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  update public.pipeline_locks
     set expires_at = now() + (p_ttl_ms * interval '1 millisecond')
   where job_name = p_job
     and token = p_token
     and expires_at > now();          -- ein bereits abgelaufener Lock ist nicht erneuerbar
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

alter function public.helmut_renew_pipeline_lock(text, text, bigint) set search_path = public, pg_temp;
revoke all on function public.helmut_renew_pipeline_lock(text, text, bigint) from public, anon, authenticated;

comment on function public.helmut_renew_pipeline_lock(text, text, bigint) is
  'Verlängert einen gehaltenen Pipeline-Lock — nur der Token-Halter, nur solange er nicht abgelaufen ist. Ergänzt helmut_acquire/release_pipeline_lock (20260719) für lange Backfill-Läufe.';

commit;
