create table if not exists public.helmut_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.helmut_store enable row level security;

create or replace function public.helmut_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists helmut_store_set_updated_at on public.helmut_store;

create trigger helmut_store_set_updated_at
before update on public.helmut_store
for each row
execute function public.helmut_set_updated_at();

insert into public.helmut_store (id, data)
values (
  'main',
  jsonb_build_object(
    'sources', '[]'::jsonb,
    'profiles', '{}'::jsonb,
    'rawItems', '[]'::jsonb,
    'briefings', '[]'::jsonb,
    'crawlRuns', '[]'::jsonb,
    'tasks', '[]'::jsonb,
    'interactions', '[]'::jsonb,
    'topicMemory', '[]'::jsonb,
    'mandateProfiles', '{}'::jsonb,
    'politicalItems', '[]'::jsonb,
    'personalizedRecommendations', '[]'::jsonb,
    'dailyTasks', '[]'::jsonb,
    'communicationDrafts', '[]'::jsonb,
    'userNotes', '[]'::jsonb,
    'priorityChanges', '[]'::jsonb
  )
)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id text primary key,
  email text,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mandate_profiles (
  user_id text primary key references public.profiles(id) on delete cascade,
  partei text,
  fraktion text,
  rolle text,
  politische_ebene text,
  wahlkreis text,
  bundesland text,
  ausschuesse text[] not null default '{}',
  berichterstatter_themen text[] not null default '{}',
  fachpolitische_schwerpunkte text[] not null default '{}',
  aktuelle_kampagnen text[] not null default '{}',
  oeffentliche_positionen text[] not null default '{}',
  wichtige_zielgruppen text[] not null default '{}',
  kommunikationsstil text,
  risiko_themen text[] not null default '{}',
  chancen_themen text[] not null default '{}',
  no_go_themen text[] not null default '{}',
  bevorzugte_kanaele text[] not null default '{}',
  naechste_termine jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.political_items (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  title text not null,
  summary text,
  topic text,
  source_count integer not null default 0,
  confidence text not null default 'medium',
  source_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personalized_recommendations (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  political_item_id text references public.political_items(id) on delete cascade,
  relevance_score integer not null default 0,
  priority text not null,
  personal_relevance_explanation text not null,
  recommended_action text not null,
  action_type text not null,
  urgency text,
  deadline timestamptz,
  estimated_effort_minutes integer not null default 0,
  consequence_if_ignored text,
  possible_upside text,
  communication_recommendation text,
  previous_priority text,
  current_priority text,
  change_reason text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_tasks (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  recommendation_id text references public.personalized_recommendations(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium',
  due_date timestamptz,
  assignee text,
  status text not null default 'open',
  political_benefit text,
  risk_if_ignored text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_drafts (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  recommendation_id text references public.personalized_recommendations(id) on delete set null,
  channel text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notes (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  recommendation_id text references public.personalized_recommendations(id) on delete set null,
  political_item_id text references public.political_items(id) on delete set null,
  type text not null default 'note',
  text text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.priority_changes (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  recommendation_id text references public.personalized_recommendations(id) on delete cascade,
  previous_priority text,
  current_priority text,
  status_change text,
  change_reason text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.mandate_profiles enable row level security;
alter table public.political_items enable row level security;
alter table public.personalized_recommendations enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.communication_drafts enable row level security;
alter table public.user_notes enable row level security;
alter table public.priority_changes enable row level security;

-- =============================================================================
-- Helmut Core V3 — Datenmodell (C4)
-- =============================================================================
-- Rein ADDITIV. Loescht nichts, aendert keine bestehende Tabelle, laesst den
-- Blob-Store (helmut_store) unangetastet. Alles `create table if not exists`
-- (idempotent). RLS ist auf allen Tabellen aktiv (deny-by-default); der Server
-- nutzt den Service-Role-Key und umgeht RLS — identische Sicherheitshaltung wie
-- bei den bestehenden Tabellen oben. Genutzt wird das erst, wenn HELMUT_V3_STORE
-- aktiv ist; solange bleibt dieser Teil ungenutzt.
--
-- Kern: "einmal verstehen (global, KI) -> mehrfach bewerten (pro Nutzer, 0 KI)".
-- knowledge_objects speichert die EINMALIGE, mandantenlose KI-Analyse eines
-- politischen VORGANGS und wird von allen Nutzern wiederverwendet.

-- --- GLOBAL (mandantenlos) ---------------------------------------------------

-- Quellenkonfiguration als Daten (neues Mandat/neue Quelle = Datenzeile, kein Deploy).
create table if not exists public.sources (
  id text primary key,
  name text not null,
  type text,
  url text,
  query text,
  topic_filter text[] not null default '{}',
  priority integer not null default 0,
  trust text,
  max_items integer,
  active boolean not null default true,
  last_crawled_at timestamptz,
  circuit_state text not null default 'closed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rohdokumente, kanonisch dedupliziert. `raw` haelt das eingefrorene
-- normalizeRawItem-Feldset; content_hash traegt die Dedup-Identitaet.
create table if not exists public.raw_documents (
  id text primary key,
  canonical_url text,
  content_hash text,
  cluster_id text,
  title text,
  summary text,
  url text,
  source_name text,
  source_id text,
  source_type text,
  confidence text,
  link_type text,
  published_at timestamptz,
  retrieved_at timestamptz,
  document_type text,
  wahlperiode text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists raw_documents_content_hash_key
  on public.raw_documents (content_hash) where content_hash is not null;
create index if not exists raw_documents_cluster_id_idx on public.raw_documents (cluster_id);

-- DER KERN: die einmalige, mandantenlose KI-Analyse eines politischen Vorgangs.
-- Wird 1x pro NEUEM Vorgang durch die Intelligence Engine befuellt und danach von
-- der Matching Engine (0 KI) fuer alle Nutzer gelesen.
create table if not exists public.knowledge_objects (
  id text primary key,
  vorgang_id text not null,
  ko_version integer not null default 1,
  headline text,
  -- Von der Intelligence Engine befuellte Pflicht-Analyse:
  was_ist_passiert text,
  warum_wichtig text,
  wer_ist_betroffen text,
  parteien text[] not null default '{}',
  ausschuesse text[] not null default '{}',
  ministerien text[] not null default '{}',
  risiken text[] not null default '{}',
  chancen text[] not null default '{}',
  zeitdruck text,
  handlungsempfehlung text,
  confidence_score integer,
  source_document_count integer not null default 0,
  status text not null default 'neu',
  -- Radar-Erwaehnungen: EINMAL global befuellt, danach ohne KI-Kosten fuer das
  -- personenscharfe Matching (z. B. "wird mein MdB/meine Partei erwaehnt?").
  mentioned_people text[] not null default '{}',
  mentioned_mps text[] not null default '{}',
  mentioned_parties text[] not null default '{}',
  mentioned_committees text[] not null default '{}',
  mentioned_ministries text[] not null default '{}',
  mentioned_locations text[] not null default '{}',
  mentioned_organizations text[] not null default '{}',
  -- Struktur-/Verlaufsfelder fuer spaetere Engines (Radar, Event, Ranking):
  policy_field text[] not null default '{}',
  political_level text,
  instrument text,
  stage text,
  tags text[] not null default '{}',
  deadline timestamptz,
  best_source_url text,
  best_link_type text,
  source_trust text,
  understanding_model text,
  understanding_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_objects_vorgang_id_idx on public.knowledge_objects (vorgang_id);
create index if not exists knowledge_objects_status_idx on public.knowledge_objects (status);

-- KO <-> Rohdokument (N:M): "70 Artikel -> 1 Vorgang".
create table if not exists public.ko_document_links (
  knowledge_object_id text not null references public.knowledge_objects(id) on delete cascade,
  raw_document_id text not null references public.raw_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (knowledge_object_id, raw_document_id)
);

-- KO <-> KO (related / supersedes / part_of) fuer Verlauf & spaetere Event Engine.
create table if not exists public.ko_relations (
  from_ko_id text not null references public.knowledge_objects(id) on delete cascade,
  to_ko_id text not null references public.knowledge_objects(id) on delete cascade,
  relation_type text not null,
  created_at timestamptz not null default now(),
  primary key (from_ko_id, to_ko_id, relation_type)
);

-- KI-Nutzung/Kosten aus dem JSON-Blob in eine echte Tabelle (fail-closed-tauglich).
create table if not exists public.llm_usage (
  id text primary key,
  politician_id text,
  user_id text,
  model text,
  call_type text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost numeric,
  duration_ms integer,
  success boolean,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists llm_usage_politician_created_idx on public.llm_usage (politician_id, created_at);

-- Globaler Understanding-Lock (mandantenlos) — Zeilen-Backing fuer den Lock aus C1.
create table if not exists public.pipeline_locks (
  job_name text primary key,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- --- PRO NUTZER (RLS) --------------------------------------------------------

-- Matching-Gewichte pro Mandat (Gewichte aus dem Code heraus in Daten).
create table if not exists public.matching_weights (
  user_id text primary key references public.profiles(id) on delete cascade,
  weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pro Nutzer x KO: die deterministische Bewertung + Entscheidung (ersetzt spaeter
-- personalized_recommendations; wird ADDITIV daneben angelegt, nichts geloescht).
create table if not exists public.decisions (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete cascade,
  score integer not null default 0,
  decision text,
  priority_type text,
  matched_features jsonb not null default '[]'::jsonb,
  chance text,
  risk text,
  status_change text,
  deadline timestamptz,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decisions_user_ko_idx on public.decisions (user_id, knowledge_object_id);

-- Themengedaechtnis pro Nutzer, an den stabilen Vorgang gebunden (nicht an Strings).
create table if not exists public.topic_memory (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  vorgang_id text,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lern-Events pro Nutzer (fuettern das Zeit-Decay-Lernen).
create table if not exists public.interactions (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  decision_id text references public.decisions(id) on delete set null,
  type text,
  value text,
  created_at timestamptz not null default now()
);

-- Buero-Engine-Ergebnisse (alle Kanaele; ersetzt spaeter communication_drafts).
create table if not exists public.office_outputs (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  decision_id text references public.decisions(id) on delete set null,
  channel text not null,
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

-- Gerenderte Briefings pro Nutzer/Slot (morgens/mittags/abends).
create table if not exists public.briefings (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  slot text,
  generated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS auf allen V3-Tabellen aktivieren (deny-by-default; Service-Role umgeht RLS).
alter table public.sources enable row level security;
alter table public.raw_documents enable row level security;
alter table public.knowledge_objects enable row level security;
alter table public.ko_document_links enable row level security;
alter table public.ko_relations enable row level security;
alter table public.llm_usage enable row level security;
alter table public.pipeline_locks enable row level security;
alter table public.matching_weights enable row level security;
alter table public.decisions enable row level security;
alter table public.topic_memory enable row level security;
alter table public.interactions enable row level security;
alter table public.office_outputs enable row level security;
alter table public.briefings enable row level security;

-- =============================================================================
-- Helmut Core V3 — C7a: Matching Engine (pgvector, KEINE KI)
-- =============================================================================
-- Rein ADDITIV und idempotent. Aktiv erst, wenn HELMUT_V3_MATCHING (und
-- HELMUT_V3_STORE) gesetzt sind; solange bleibt dieser Teil ungenutzt.
--
-- "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)":
-- Das Matching ist deterministisch. Die Embeddings werden NICHT von einer KI,
-- sondern regelbasiert aus oeffentlichen Merkmalen (Partei/Ausschuss/Themen/
-- Wahlkreis) berechnet (siehe lib/helmut/matching.js) -> 100% reproduzierbar,
-- kein Netzwerk, kein Modell. pgvector traegt nur die Aehnlichkeitssuche.
--
-- DSGVO: knowledge_objects/embedding bleiben mandantenlos (kein user_id).
-- profile_embeddings/matching_results sind pro Nutzer und RLS-geschuetzt; sie
-- speichern KEINE Freitext-PII, nur Merkmalsvektoren, Scores und die erklaerenden
-- matched_features (kurze oeffentliche Labels wie 'partei:SPD', 'ausschuss:...').

create extension if not exists vector;

-- Deterministischer Merkmalsvektor des Vorgangs (mandantenlos, global 1x befuellt).
-- Dimension muss zu EMBEDDING_DIM in lib/helmut/matching.js passen (Default 256).
alter table public.knowledge_objects add column if not exists embedding vector(256);
create index if not exists knowledge_objects_embedding_idx
  on public.knowledge_objects using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Merkmalsvektor des Nutzerprofils — EINMALIG gespeichert, bei Profiländerung neu
-- berechnet (profile_hash erkennt Änderungen). Kein Freitext, nur Vektor + Hash.
create table if not exists public.profile_embeddings (
  user_id text primary key references public.profiles(id) on delete cascade,
  embedding vector(256),
  profile_hash text,
  dim integer not null default 256,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ergebnis der deterministischen Aehnlichkeitssuche pro Nutzer x Vorgang.
-- matched_features = erklaerbare Treffer (welcher Filter/welches Merkmal, warum).
create table if not exists public.matching_results (
  id text primary key,
  user_id text references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete cascade,
  vorgang_id text,
  similarity numeric,
  rank integer,
  matched_features jsonb not null default '[]'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists matching_results_user_idx on public.matching_results (user_id, created_at);
create index if not exists matching_results_ko_idx on public.matching_results (knowledge_object_id);

alter table public.profile_embeddings enable row level security;
alter table public.matching_results enable row level security;

-- pgvector-Suche als RPC (PostgREST kann '<=>' nicht ordnen). Deterministische
-- Kosinus-Aehnlichkeit + harte Merkmalsfilter (Partei/Ausschuss/Wahlkreis) via
-- Array-Overlap. Pending-KOs (status='pending', noch nicht verstanden) sind
-- ausgeschlossen. Nur SELECT, security invoker -> RLS bleibt wirksam.
create or replace function public.match_knowledge_objects(
  query_embedding vector(256),
  match_count integer default 20,
  filter_parties text[] default null,
  filter_committees text[] default null,
  filter_regions text[] default null
)
returns table (id text, vorgang_id text, similarity double precision)
language sql
stable
as $$
  select ko.id,
         ko.vorgang_id,
         1 - (ko.embedding <=> query_embedding) as similarity
  from public.knowledge_objects ko
  where ko.embedding is not null
    and ko.status <> 'pending'
    and (filter_parties is null or ko.parteien && filter_parties or ko.mentioned_parties && filter_parties)
    and (filter_committees is null or ko.ausschuesse && filter_committees or ko.mentioned_committees && filter_committees)
    and (filter_regions is null or ko.tags && filter_regions or ko.mentioned_locations && filter_regions)
  order by ko.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;
