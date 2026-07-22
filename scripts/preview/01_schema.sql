-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 11 — Preview-Schema: minimal-treue Nachbildung der 24 relevanten
-- Tabellen (nur die von den RLS-Policies referenzierten Spalten). NUR PREVIEW.
--
-- pgvector wird bewusst NICHT verwendet (Embedding-Spalten als text) — für die
-- Row-Level-Sichtbarkeit irrelevant, exakt wie in der früheren Isolationsverif.
-- (docs/rls-isolation-test-results.md §4).
--
-- Wichtig: Nach dem Anlegen erhalten anon UND authenticated volle CRUD-Grants —
-- das reproduziert den in Sprint 2 verifizierten Supabase-Default-Bootstrap
-- (information_schema.role_table_grants). Damit ist beweisbar, dass NICHT die
-- Grants, sondern RLS die einzige wirksame Barriere für authenticated ist.
-- ═══════════════════════════════════════════════════════════════════════════

-- Kategorie A — tenant-scoped (user_id)
create table if not exists public.decisions                    (id text primary key, user_id text, payload text);
create table if not exists public.matching_results             (id text primary key, user_id text, payload text);
create table if not exists public.office_outputs               (id text primary key, user_id text, payload text);
create table if not exists public.profile_embeddings           (user_id text primary key, embedding text);
create table if not exists public.briefings                    (id text primary key, user_id text, payload text);
create table if not exists public.mandate_profiles             (user_id text primary key, payload text);
create table if not exists public.political_items              (id text primary key, user_id text);
create table if not exists public.personalized_recommendations (id text primary key, user_id text);
create table if not exists public.daily_tasks                  (id text primary key, user_id text);
create table if not exists public.communication_drafts         (id text primary key, user_id text);
create table if not exists public.user_notes                   (id text primary key, user_id text);
create table if not exists public.priority_changes             (id text primary key, user_id text);
create table if not exists public.interactions                 (id text primary key, user_id text);
create table if not exists public.topic_memory                 (id text primary key, user_id text);
create table if not exists public.matching_weights             (user_id text primary key, weights text);

-- Sonderfall — llm_usage (zwei mögliche Tenant-Spalten)
create table if not exists public.llm_usage                    (id text primary key, user_id text, politician_id text, cost numeric);

-- Sonderfall — profiles (id IST der Mandant)
create table if not exists public.profiles                     (id text primary key, name text);

-- Sonderfall — helmut_store (Tenant im id-Präfix 'main-p-<id>')
create table if not exists public.helmut_store                 (id text primary key, data text);

-- Kategorie B — geteilte/mandantenlose Daten
create table if not exists public.knowledge_objects            (id text primary key, title text);
create table if not exists public.raw_documents               (id text primary key, url text);
create table if not exists public.ko_document_links            (id text primary key, ko_id text, doc_id text);
create table if not exists public.ko_relations                 (id text primary key, from_id text, to_id text);
create table if not exists public.sources                      (id text primary key, name text);

-- Kategorie C — operational (keine Policy)
create table if not exists public.pipeline_locks               (job_name text primary key, locked_at timestamptz);
-- Production-Baseline: RLS ist auf ALLEN 24 Tabellen aktiv. pipeline_locks trägt
-- bewusst KEINE Policy (impliziter Deny für alle außer service_role). Die
-- 20260712-Migration setzt das voraus („Status quo ist bereits der Zielzustand"),
-- daher hier explizit hergestellt.
alter table public.pipeline_locks enable row level security;

-- ── RPC-Kanarienvogel ───────────────────────────────────────────────────────
-- Eine (bewusst „gefährliche") SECURITY DEFINER-Funktion, die RLS umgehen würde,
-- wenn eine Rolle sie aufrufen dürfte. Dient dem Nachweis, dass die Read-only-
-- Rolle KEIN EXECUTE erhält (Aufgabe 3: „keine RPC").
create or replace function public.rpc_canary_all_office()
returns setof public.office_outputs
language sql
security definer
set search_path = public, pg_temp
as $$ select * from public.office_outputs $$;

-- ── Supabase-Default-Bootstrap: volle CRUD-Grants für anon + authenticated ──
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
-- authenticated darf die RPC (per Default PUBLIC=EXECUTE) — Kontrastprobe zu
-- helmut_readonly, dem die Read-only-Migration EXECUTE explizit entzieht.
grant execute on function public.rpc_canary_all_office() to anon, authenticated;
