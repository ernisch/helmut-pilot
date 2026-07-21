-- Helmut — Master Quellenkatalog · Sprint 3 · relationales Fundament (VORBEREITET)
-- ============================================================================================
-- Fuehrt den GLOBALEN Master Quellenkatalog additiv ein und trennt die acht Belange sauber:
--   1 globale Quelle          -> public.catalog_sources           (kanonischer Record, EINMAL)
--   2 technischer Abrufweg    -> public.catalog_source_paths      (1:n je Quelle)
--   3 inhaltliche Klassifik.  -> catalog_sources.* + catalog_source_{committees,topics,regions}
--   4 mandatsbezogene Zuweis. -> public.catalog_package_assignments (Referenzen, KEINE Kopien)
--   5 Laufzeitgesundheit      -> public.catalog_source_health      (aus source_crawl_telemetry)
--   6 mandantenspez. Relevanz -> public.tenant_source_relevance    (tenant_id, RLS)
--   7 manuelle Korrekturen    -> public.tenant_source_overrides    (tenant_id, RLS)
--   +  private Kundenquellen  -> public.tenant_private_sources     (tenant_id, RLS)
--   8 Audit und Herkunft      -> catalog_sources.discovery_* + public.catalog_source_audit
--
-- ZENTRALE ARCHITEKTURENTSCHEIDUNG: der Katalog ist GLOBAL. Eine Quelle wird nur EINMAL
-- kanonisch gespeichert (catalog_sources, unique canonical_key). Mandanten erhalten KEINE
-- kopierten Quellenlisten, sondern nachvollziehbare Zuweisungen/Relevanzen/Korrekturen. Eine
-- Aenderung fuer einen Mandanten (tenant_*) kann per Konstruktion keinen anderen Mandanten
-- beeinflussen (tenant_id + RLS).
--
-- SICHERHEIT / MANDANTEN:
--   * Globale catalog_*-Tabellen enthalten AUSSCHLIESSLICH oeffentliche Quellendefinitionen —
--     KEINE mandanten-/personenbezogenen Daten, daher KEINE tenant/user-Spalte. RLS aktiviert,
--     BEWUSST OHNE Policy (nur service_role liest/schreibt; Muster wie pipeline_locks /
--     source_crawl_telemetry).
--   * tenant_*-Tabellen tragen tenant_id (= mandate_profiles.user_id) und eine tenant_isolation-
--     RLS-Policy (Muster wie die bestehenden Category-A-Tabellen: helmut_current_tenant()).
--
-- FREIGABEPFLICHTIG: Diese Migration wird NICHT automatisch auf Production angewendet. Ausfuehrung
-- erst nach ausdruecklicher Freigabe. Rollback: 20260722_master_source_catalog_rollback.sql.
-- Idempotent (create ... if not exists); rein additiv — aendert KEINE bestehende Tabelle/Spalte.

begin;

-- ============================================================================================
-- BELANG 1: kanonischer Herausgeber (ein Herausgeber existiert genau EINMAL je Domain)
-- ============================================================================================
create table if not exists public.catalog_publishers (
  id               text primary key,
  name             text not null,
  canonical_domain text,
  publisher_type   text not null,
  evidence_role    text not null check (evidence_role in ('official_primary','direct_interest','journalistic','data_source','aggregator')),
  trust            text not null default 'unbekannt' check (trust in ('hoch','mittel','niedrig','blockiert','unbekannt')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','paused','archived')),
  entity_id        text,   -- Verweis auf political_entities(id); FK bewusst weich (Seed-Reihenfolge)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists uq_catalog_publishers_domain on public.catalog_publishers(canonical_domain) where canonical_domain is not null;

-- ============================================================================================
-- BELANG 1 + 3 + 8: die globale kanonische Quelle mit den 20 Pflichtattributen (Phase 4)
-- ============================================================================================
create table if not exists public.catalog_sources (
  id                text primary key,
  canonical_key     text not null unique,                 -- Dedup-Schluessel (idempotenter Import)
  -- 1..2 Herausgeber + kanonische URL
  publisher_id      text not null references public.catalog_publishers(id) on delete restrict,
  canonical_url     text,
  -- 4..5 Quellentyp + politische Ebene
  source_type       text not null,                        -- Taxonomie (26 Kategorien + suchanbieter)
  political_level   text check (political_level in ('international','eu','bund','land','kommune')),
  -- 6..7 Institution / Partei / Fraktion
  institution_id    text,
  party_id          text,
  group_id          text,
  -- 11 Sprache
  language          text not null default 'de',
  content_stance    text check (content_stance in ('fact','position','journalistic','analysis')),
  -- 12..14 Herkunft / Datum Entdeckung / letzte Pruefung (Belang 8)
  discovery_origin  text not null check (discovery_origin in ('official_directory','structured_dataset','legacy_catalog','manual_curation','search_discovery')),
  evidence_url      text,                                 -- Herkunftsbeleg (Phase 6: keine erfundenen URLs)
  discovered_at     date not null,
  last_checked_at   timestamptz,
  -- 15..17 Bewertung
  trust             text not null default 'unbekannt' check (trust in ('hoch','mittel','niedrig','blockiert','unbekannt')),
  license_status    text not null default 'unbewertet' check (license_status in ('unbewertet','offen_erlaubt','presse_erlaubt','eingeschraenkt','unklar','untersagt')),
  privacy_status    text not null default 'unbewertet' check (privacy_status in ('unbewertet','unbedenklich','oeffentliche_mandatsdaten','pruefung_noetig','unzulaessig')),
  -- 18 Pruefstatus (Importstrecke, 12 Zustaende, Phase 5) — keine Quelle springt direkt auf 'active'
  review_status     text not null default 'discovered' check (review_status in (
                      'discovered','normalized','duplicate_candidate','technically_checked','classified',
                      'legally_checked','released','active','restricted','quarantined','superseded','archived')),
  -- 19 Freigabestatus
  release_status    text not null default 'unfreigegeben' check (release_status in ('unfreigegeben','auto_freigegeben','manuell_freigegeben','zurueckgezogen')),
  -- 20 verantwortliche Regel ODER Rolle (NIE eine Privatperson — DSGVO/Datenminimierung)
  responsible       text,
  legacy_source_id  text,                                 -- Bruecke zum Altbestand (rein lesend)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_catalog_sources_publisher on public.catalog_sources(publisher_id);
create index if not exists idx_catalog_sources_type on public.catalog_sources(source_type);
create index if not exists idx_catalog_sources_review on public.catalog_sources(review_status);
create index if not exists idx_catalog_sources_party on public.catalog_sources(party_id);
create index if not exists idx_catalog_sources_group on public.catalog_sources(group_id);
create index if not exists idx_catalog_sources_level on public.catalog_sources(political_level);

-- ============================================================================================
-- BELANG 2: technischer Abrufweg (1:n je Quelle) — getrennt von der inhaltlichen Quelle
-- ============================================================================================
create table if not exists public.catalog_source_paths (
  id                text primary key,
  source_id         text not null references public.catalog_sources(id) on delete cascade,
  method            text not null check (method in ('rss','api','html','googlenews_search','structured_download','sitemap')),
  url               text,
  query             text,
  parser            text,
  expected_frequency text,
  priority          integer not null default 60,
  status            text not null default 'needs_review' check (status in ('healthy','degraded','broken','needs_review','paused','archived')),
  activation_mode   text not null default 'auto' check (activation_mode in ('auto','always_on','dev_only','manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_catalog_source_paths_source on public.catalog_source_paths(source_id);

-- ============================================================================================
-- BELANG 3: inhaltliche Klassifikation als m:n-Verknuepfungen (Ausschuesse/Themen/Regionen)
-- ============================================================================================
create table if not exists public.catalog_source_committees (
  source_id    text not null references public.catalog_sources(id) on delete cascade,
  committee_id text not null,
  primary key (source_id, committee_id)
);
create table if not exists public.catalog_source_topics (
  source_id text not null references public.catalog_sources(id) on delete cascade,
  topic     text not null,
  primary key (source_id, topic)
);
create table if not exists public.catalog_source_regions (
  source_id   text not null references public.catalog_sources(id) on delete cascade,
  geography_id text not null,
  primary key (source_id, geography_id)
);

-- ============================================================================================
-- BELANG 4: mandatsbezogene Zuweisung (Paket -> Quelle als REFERENZ, keine kopierte Liste)
-- ============================================================================================
create table if not exists public.catalog_package_assignments (
  package_key text not null,
  source_id   text not null references public.catalog_sources(id) on delete cascade,
  assigned_by text,                    -- Regel-ID der datengetriebenen Zuweisung (Nachvollzieh.)
  created_at  timestamptz not null default now(),
  primary key (package_key, source_id)
);
create index if not exists idx_catalog_pkg_assign_source on public.catalog_package_assignments(source_id);

-- ============================================================================================
-- BELANG 5: Laufzeitgesundheit (globaler Snapshot, abgeleitet aus source_crawl_telemetry)
-- ============================================================================================
create table if not exists public.catalog_source_health (
  source_id       text primary key references public.catalog_sources(id) on delete cascade,
  health          text not null default 'unknown' check (health in ('healthy','degraded','broken','unknown')),
  success_rate    numeric,
  observations    integer not null default 0,
  error_streak    integer not null default 0,
  last_observed_at timestamptz,
  last_error      text,               -- klassifizierter Fehlercode (kein Rohtext/PII)
  computed_at     timestamptz not null default now()
);

-- ============================================================================================
-- BELANG 8: Audit / Herkunft (append-only Nachvollziehbarkeit der Zustandswechsel)
-- ============================================================================================
create table if not exists public.catalog_source_audit (
  id          bigint generated always as identity primary key,
  source_id   text not null references public.catalog_sources(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text,                   -- Regel-ID ODER Rolle (NIE Privatperson)
  action      text not null,          -- z. B. 'ingest','promote','quarantine','supersede'
  from_state  text,
  to_state    text,
  note        text
);
create index if not exists idx_catalog_source_audit_source on public.catalog_source_audit(source_id, at);

-- ============================================================================================
-- BELANG 6: mandantenspezifische Relevanz (tenant_id, RLS-isoliert)
-- ============================================================================================
create table if not exists public.tenant_source_relevance (
  tenant_id  text not null,           -- = mandate_profiles.user_id
  source_id  text not null references public.catalog_sources(id) on delete cascade,
  relevance  integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source_id)
);
create index if not exists idx_tenant_source_relevance_tenant on public.tenant_source_relevance(tenant_id);

-- ============================================================================================
-- BELANG 7: mandantenspezifische manuelle Korrekturen (tenant_id, RLS-isoliert)
-- ============================================================================================
create table if not exists public.tenant_source_overrides (
  tenant_id             text not null,
  source_id             text not null,   -- kann catalog_sources ODER tenant_private_sources referenzieren
  action                text not null check (action in ('pin','mute','boost','demote','replace')),
  replacement_source_id text,
  note                  text,
  updated_at            timestamptz not null default now(),
  primary key (tenant_id, source_id, action)
);
create index if not exists idx_tenant_source_overrides_tenant on public.tenant_source_overrides(tenant_id);

-- ============================================================================================
-- Private, kundenspezifische Quellen (fuer andere Mandanten weder sichtbar noch abrufbar)
-- ============================================================================================
create table if not exists public.tenant_private_sources (
  id               text not null,
  tenant_id        text not null,
  canonical_url    text,
  source_type      text not null,
  political_level  text,
  language         text not null default 'de',
  discovery_origin text not null default 'manual_curation',
  evidence_url     text,
  license_status   text not null default 'unbewertet',
  privacy_status   text not null default 'unbewertet',
  review_status    text not null default 'discovered',
  responsible      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, id)          -- id nur INNERHALB des Mandanten eindeutig
);
create index if not exists idx_tenant_private_sources_tenant on public.tenant_private_sources(tenant_id);

-- ============================================================================================
-- updated_at-Trigger (nutzt die vorhandene public.helmut_set_updated_at, falls vorhanden)
-- ============================================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'helmut_set_updated_at') then
    foreach t in array array[
      'catalog_publishers','catalog_sources','catalog_source_paths',
      'tenant_source_relevance','tenant_source_overrides','tenant_private_sources'
    ] loop
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.helmut_set_updated_at()', t);
    end loop;
  end if;
end $$;

-- ============================================================================================
-- RLS: GLOBALE catalog_*-Tabellen = intern, NUR service_role (RLS an, KEINE Policy).
-- ============================================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'catalog_publishers','catalog_sources','catalog_source_paths',
    'catalog_source_committees','catalog_source_topics','catalog_source_regions',
    'catalog_package_assignments','catalog_source_health','catalog_source_audit'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    -- BEWUSST KEINE for-select-Policy: oeffentliche Quellendefinitionen, aber nur service_role
    -- greift produktiv zu (Muster pipeline_locks / source_crawl_telemetry).
  end loop;
end $$;

-- ============================================================================================
-- RLS: TENANT-Tabellen = strikte Mandantentrennung ueber tenant_id (Muster Category A).
-- Policy nur, wenn der Bestands-Helfer public.helmut_current_tenant() existiert (aus
-- 20260712_tenant_rls_policies). Sonst bleibt RLS an OHNE Policy (deny) — fail-closed.
-- ============================================================================================
do $$
declare t text;
begin
  foreach t in array array['tenant_source_relevance','tenant_source_overrides','tenant_private_sources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    if exists (select 1 from pg_proc where proname = 'helmut_current_tenant') then
      execute format(
        'create policy tenant_isolation on public.%I for all to authenticated using (tenant_id = public.helmut_current_tenant()) with check (tenant_id = public.helmut_current_tenant())', t);
    end if;
  end loop;
end $$;

-- ============================================================================================
-- Dokumentierende Kommentare (Belang-Zuordnung)
-- ============================================================================================
comment on table public.catalog_sources is 'Master Quellenkatalog (Belang 1/3/8): kanonische globale Quelle, EINMAL je canonical_key. Enthaelt Herkunft + Prüf-/Freigabestatus. Keine mandanten-/personenbezogenen Daten.';
comment on table public.catalog_source_paths is 'Belang 2: technischer Abrufweg (1:n je Quelle), getrennt von der inhaltlichen Quelle.';
comment on table public.catalog_package_assignments is 'Belang 4: mandatsbezogene Zuweisung als REFERENZ (Paket->Quelle), keine kopierte Quellenliste.';
comment on table public.catalog_source_health is 'Belang 5: globale Laufzeitgesundheit, abgeleitet aus source_crawl_telemetry (nur technische Zaehler).';
comment on table public.tenant_source_relevance is 'Belang 6: mandantenspezifische Relevanz. RLS-isoliert ueber tenant_id (= mandate_profiles.user_id).';
comment on table public.tenant_source_overrides is 'Belang 7: mandantenspezifische manuelle Korrekturen (pin/mute/boost/demote/replace). RLS-isoliert.';
comment on table public.tenant_private_sources is 'Private, kundenspezifische Quellen. RLS-isoliert; fuer andere Mandanten weder sichtbar noch abrufbar.';
comment on table public.catalog_source_audit is 'Belang 8: append-only Audit der Zustandswechsel (actor = Regel/Rolle, nie Privatperson).';

commit;
