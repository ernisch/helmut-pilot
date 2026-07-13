-- Helmut — Neue Quellenarchitektur · Sprint 1: relationales Fundament
-- ====================================================================
-- Fuehrt die getrennten Ebenen Herausgeber / Abrufweg / Quellenpaket + zentrale
-- Geografie- und Entitaetsschicht additiv ein. Aendert NICHTS an bestehenden
-- Tabellen/Spalten/Daten (Auftrag §34: alte Architektur bleibt funktionsfaehig).
--
-- SICHERHEIT / MANDANTEN (Auftrag §38): Alle Tabellen sind GLOBAL GETEILT — sie
-- enthalten ausschliesslich oeffentliche Quellendefinitionen, KEINE mandanten- oder
-- personenbezogenen Daten, daher KEINE tenant/user_id-Spalte. RLS ist aktiviert mit
-- Lesezugriff fuer angemeldete Nutzer; Schreibzugriff ausschliesslich ueber service_role
-- (interne Systemjobs/Admin) — konsistent mit dem bestehenden Muster.
--
-- FREIGABEPFLICHTIG: Diese Migration wird NICHT automatisch auf Production angewendet.
-- Ausfuehrung erst nach ausdruecklicher Freigabe (Auftrag §4). Rollback:
-- 20260713_source_architecture_rollback.sql.
--
-- Idempotent (create ... if not exists), damit ein Teil-Rollout gefahrlos wiederholbar ist.

begin;

-- 1) GEOGRAFIE-HIERARCHIE (Deutschland / Land / Bezirk|Kreis / Kommune) -------
create table if not exists public.geographies (
  id          text primary key,
  level       text not null check (level in ('bund','land','bezirk','kreis','kommune')),
  name        text not null,
  parent_id   text references public.geographies(id) on delete set null,
  ags         text,                    -- amtlicher Gemeindeschluessel (optional)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_geographies_parent on public.geographies(parent_id);
create index if not exists idx_geographies_level on public.geographies(level);
comment on table public.geographies is 'Global geteilte geografische Hierarchie. Region/Wahlkreis ist KEINE politische Ebene (siehe electoral_districts).';

-- 2) WAHLKREISE (separate Struktur, keine Entscheidungsebene) -----------------
create table if not exists public.electoral_districts (
  id            text primary key,
  kind          text not null check (kind in ('bundestagswahlkreis','landtagswahlkreis')),
  number        integer,
  name          text not null,
  geography_id  text references public.geographies(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_electoral_districts_geo on public.electoral_districts(geography_id);
comment on table public.electoral_districts is 'Wahlkreise als persoenlicher Verantwortungsraum, getrennt von der politischen Entscheidungsebene.';

-- 3) POLITISCHE ENTITAETEN (typisierte zentrale Schicht) ----------------------
create table if not exists public.political_entities (
  id            text primary key,
  entity_type   text not null check (entity_type in (
                  'person','party','parliamentary_group','committee','ministry','parliament',
                  'government','association','union','authority','statistical_office','other_institution')),
  name          text not null,
  canonical_key text,                   -- normalisierter Schluessel (matching.js-kompatibel)
  level         text check (level in ('international','eu','bund','land','kommune')),
  geography_id  text references public.geographies(id) on delete set null,
  aliases       text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_political_entities_type on public.political_entities(entity_type);
create index if not exists idx_political_entities_geo on public.political_entities(geography_id);
create index if not exists idx_political_entities_key on public.political_entities(canonical_key);
comment on table public.political_entities is 'Global geteilte typisierte Entitaetsschicht (Parteien/Fraktionen/Ausschuesse/Ministerien/Parlamente/Regierungen/Verbaende/Behoerden/Personen).';

-- 4) HERAUSGEBER (existiert einmal je Organisation) ---------------------------
create table if not exists public.publishers (
  id               text primary key,
  name             text not null,
  canonical_domain text,
  publisher_type   text not null,        -- person/party/.../media/aggregator/other
  evidence_role    text not null check (evidence_role in (
                     'official_primary','direct_interest','journalistic','data_source','aggregator')),
  trust            text not null default 'unbekannt' check (trust in ('hoch','mittel','niedrig','blockiert','unbekannt')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','paused','archived')),
  entity_id        text references public.political_entities(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists uq_publishers_domain on public.publishers(canonical_domain) where canonical_domain is not null;
create index if not exists idx_publishers_type on public.publishers(publisher_type);
create index if not exists idx_publishers_entity on public.publishers(entity_id);
comment on table public.publishers is 'Global geteilte Herausgeber-Registry. Ein Herausgeber existiert genau einmal (Dedup ueber canonical_domain). Google News ist ein Aggregator-Herausgeber, kein Inhaltsherausgeber.';

-- 5) ABRUFWEGE (technische Methode, N je Herausgeber) -------------------------
create table if not exists public.retrieval_paths (
  id               text primary key,
  publisher_id     text not null references public.publishers(id) on delete cascade,
  legacy_source_id text,                 -- Mapping auf v1Sources.id (Migrations-/Kompat-Bruecke)
  name             text,
  method           text not null check (method in ('rss','api','html','googlenews_search','structured_download')),
  url              text,
  query            text,                 -- Suchdefinition bei googlenews_search
  parser           text,
  expected_frequency text,               -- daily/weekly/...
  priority         integer not null default 60,
  status           text not null default 'needs_review' check (status in (
                     'healthy','degraded','broken','needs_review','paused','archived')),
  activation_mode  text not null default 'auto' check (activation_mode in ('auto','always_on','dev_only','manual')),
  is_critical      boolean not null default false,
  max_items        integer,
  last_success_at  timestamptz,
  last_error       text,
  error_streak     integer not null default 0,
  represents_type  text,                 -- bei Aggregator-Suchen: welcher Zieltyp gemeint ist
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_retrieval_paths_publisher on public.retrieval_paths(publisher_id);
create index if not exists idx_retrieval_paths_status on public.retrieval_paths(status);
create index if not exists idx_retrieval_paths_method on public.retrieval_paths(method);
create index if not exists idx_retrieval_paths_legacy on public.retrieval_paths(legacy_source_id);
comment on table public.retrieval_paths is 'Global geteilte Abrufwege. Ein Abrufweg wird global genau einmal gecrawlt (Referenzzaehlung ueber package_paths + Paketstatus).';

-- 6) QUELLENPAKETE (buendeln Abrufwege je Produktzweck) -----------------------
create table if not exists public.source_packages (
  id              text primary key,
  key             text not null unique,
  name            text not null,
  purpose         text,
  status          text not null default 'draft' check (status in ('draft','prepared','active','paused','archived')),
  is_base         boolean not null default false,
  always_on       boolean not null default false,
  political_level text check (political_level in ('international','eu','bund','land','kommune')),
  geography_id    text references public.geographies(id) on delete set null,
  required_classes text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_source_packages_status on public.source_packages(status);
create index if not exists idx_source_packages_geo on public.source_packages(geography_id);
comment on table public.source_packages is 'Global geteilte Quellenpakete. is_base = Pflicht-Basispaket (Bundestag: Bund Basis; Landtag: Bund Basis + Landespaket).';

-- 7) PAKET <-> ABRUFWEG (m:n) -------------------------------------------------
create table if not exists public.package_paths (
  package_id        text not null references public.source_packages(id) on delete cascade,
  retrieval_path_id text not null references public.retrieval_paths(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (package_id, retrieval_path_id)
);
create index if not exists idx_package_paths_path on public.package_paths(retrieval_path_id);
comment on table public.package_paths is 'm:n Paket<->Abrufweg. Ein Abrufweg kann mehrere Pakete versorgen, wird aber nur einmal gecrawlt.';

-- 8) ERWARTETE DIMENSIONEN JE ABRUFWEG (Ebene/Geografie/Thema/Entitaet) -------
create table if not exists public.path_expected_levels (
  retrieval_path_id text not null references public.retrieval_paths(id) on delete cascade,
  level             text not null check (level in ('international','eu','bund','land','kommune')),
  primary key (retrieval_path_id, level)
);
create table if not exists public.path_expected_geographies (
  retrieval_path_id text not null references public.retrieval_paths(id) on delete cascade,
  geography_id      text not null references public.geographies(id) on delete cascade,
  primary key (retrieval_path_id, geography_id)
);
create table if not exists public.path_expected_topics (
  retrieval_path_id text not null references public.retrieval_paths(id) on delete cascade,
  topic             text not null,
  primary key (retrieval_path_id, topic)
);
create table if not exists public.path_expected_entities (
  retrieval_path_id text not null references public.retrieval_paths(id) on delete cascade,
  entity_id         text not null references public.political_entities(id) on delete cascade,
  primary key (retrieval_path_id, entity_id)
);
comment on table public.path_expected_levels is 'Erwartete politische Ebenen je Abrufweg (Grundlage fuer Ebenen-Erkennung/Qualitaetspruefung).';

-- 9) updated_at-Trigger (nutzt vorhandene public.helmut_set_updated_at) -------
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'helmut_set_updated_at') then
    foreach t in array array[
      'geographies','electoral_districts','political_entities','publishers',
      'retrieval_paths','source_packages'
    ] loop
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.helmut_set_updated_at()', t);
    end loop;
  end if;
end $$;

-- 10) RLS: global geteilt, aber REIN INTERN — Zugriff ausschliesslich ueber service_role.
--     Kritische Pruefung (Sprint 2): Brauchen normale angemeldete Nutzer direkten
--     Lesezugriff auf diese Tabellen? NEIN. Der gesamte produktive DB-Zugriff laeuft
--     ueber den App-Server mit service_role; der authenticated/JWT-Pfad ist stillgelegt
--     (storage.tenantJwtModeEnabled=false). Die Quellendefinitionen werden nur intern
--     (Crawl/Understanding/Matching) und im Betreiber-Admin gebraucht, NIE direkt vom
--     Abgeordneten-Frontend ueber die REST-API. Daher die restriktivste sichere Variante:
--     RLS aktiviert + KEINE permissive Policy => deny fuer anon/authenticated,
--     service_role (BYPASSRLS) liest/schreibt. Konsistent mit public.pipeline_locks.
--     (Der Linter meldet dazu 'rls_enabled_no_policy' als INFO — bewusst so gewaehlt:
--     kein Grund, oeffentliche Quellendefinitionen ueber die Endnutzer-API zu oeffnen.
--     Sollte spaeter echtes Supabase-Auth eingefuehrt werden UND ein Admin ueber
--     authenticated lesen, wird gezielt eine Rollen-Policy ergaenzt — separat + freigabepflichtig.)
do $$
declare t text;
begin
  foreach t in array array[
    'geographies','electoral_districts','political_entities','publishers',
    'retrieval_paths','source_packages','package_paths',
    'path_expected_levels','path_expected_geographies','path_expected_topics','path_expected_entities'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Fruehere permissive authenticated-Leserichtlinie entfernt (Sprint-2-Verschaerfung):
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    -- BEWUSST KEINE for-select-Policy: interne Tabelle, nur service_role.
  end loop;
end $$;

commit;
