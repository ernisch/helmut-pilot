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
    'topicMemory', '[]'::jsonb
  )
)
on conflict (id) do nothing;
