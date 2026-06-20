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
