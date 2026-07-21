-- Helmut — Sprint 1 "Universelles Mandatsregister" · VORBEREITETE Schemaänderung
-- ==============================================================================
-- ⚠️  NICHT ANGEWENDET. Dieses Verzeichnis (supabase/migrations/prepared/) liegt
--     BEWUSST AUSSERHALB des regulaeren Migrationspfads (supabase/migrations/*.sql)
--     und wird von keinem Runner/Registry-Schritt eingespielt. Anwendung ist ein
--     eigener, ausdruecklich freigabepflichtiger Schritt (Founder + Backup/PITR
--     vorher, OP-01). Siehe README.md in diesem Verzeichnis.
--
-- ZWECK: Das Mandatsregister (lib/helmut/mandate-register.js) leitet aus einem
-- Mandatsprofil eine kanonische, universelle Projektion ab (Identitaet, Partei/
-- Fraktion, Ausschuesse, Politikfelder/Themen, Versorgungsstatus). Diese Migration
-- gibt dieser Projektion einen persistenten Platz — als ABGELEITETE, jederzeit neu
-- berechenbare Sicht neben `mandate_profiles`; das Rohprofil bleibt unangetastet.
--
-- ZWEI Tabellen:
--   1. mandate_register        — 1:1-Projektion je Mandat (resolveMandate()-Ergebnis,
--                                verdichtet auf stabile, abfragbare Spalten).
--   2. mandate_external_ids    — stabile externe Personen-IDs (Bundestag /
--                                abgeordnetenwatch / Wahlkreis-Nr). Die UNIQUE-
--                                Bedingung erzwingt Personen-Eindeutigkeit auf
--                                DB-Ebene (Dubletten-Schutz), den der Resolver
--                                heute nur in-memory leisten kann.
--
-- EIGENSCHAFTEN: additiv (keine bestehende Tabelle geaendert), idempotent
-- (IF NOT EXISTS), service_role-only (RLS an, keine Policies — konsistent mit
-- source_crawl_telemetry/gate_shadow_events). KEINE PII ueber das hinaus, was in
-- `mandate_profiles` ohnehin steht (Name/Partei/Ausschuss = oeffentliche Mandatsdaten).
--
-- Rollback: prepared/20260722_mandate_register_rollback.sql.

begin;

-- 1) Kanonische Mandatsprojektion ---------------------------------------------
create table if not exists public.mandate_register (
  profile_id            text primary key,        -- = mandate_profiles.id / profiles.id (soft ref, s. u.)
  register_version      text not null,           -- Registry-Version, mit der aufgeloest wurde (Reproduzierbarkeit)
  resolved_at           timestamptz not null default now(),

  -- Identitaet
  canonical_person_key  text,                    -- ext:<quelle>:<id> ODER name:<slug>
  identity_confidence   text,                    -- stable | name | weak | none
  display_name          text,                    -- Klarname (oeffentlich)
  disambiguation_key    text,                    -- name:<slug>|<partei>|<wahlkreis> (Namensvetter-Trennung)

  -- Partei / Fraktion (kanonische Registry-Schluessel)
  party_key             text,                    -- normalizeParty(...)  z. B. cdu/spd/gruene/linke/afd/fdp/bsw/csu/ssw
  party_entity_id       text,                    -- seeds/entities.js
  party_known           boolean,
  fraction_key          text,                    -- cdu-csu/spd/gruene/linke/afd/fdp/bsw/ssw
  fraction_entity_id    text,

  -- Ausschuesse / Politikfelder / Themen (datengetrieben abgeleitet)
  committee_keys        text[] not null default '{}',
  policy_fields         text[] not null default '{}',
  derived_theme_terms   text[] not null default '{}',
  relevant_ministries   text[] not null default '{}',
  function_keys         text[] not null default '{}',

  -- Verbindlicher Versorgungsstatus
  parliament_type       text,                    -- Bundestag | Landtag
  coverage_status       text not null,           -- vollstaendig | unvollstaendig | blockiert | review
  register_ready        boolean not null default false, -- Datenreife (Sprint 1)
  source_ready          boolean not null default false, -- Quellenpakete vorhanden (Sprint 2)
  missing_required      text[] not null default '{}',
  review_flags          text[] not null default '{}',
  blockers              text[] not null default '{}',

  -- Quellen-Ausblick (Sprint-2-Bauliste je Mandat)
  required_packages     text[] not null default '{}',
  source_gaps           text[] not null default '{}',

  constraint mandate_register_coverage_status_chk
    check (coverage_status in ('vollstaendig','unvollstaendig','blockiert','review')),
  constraint mandate_register_identity_confidence_chk
    check (identity_confidence is null or identity_confidence in ('stable','name','weak','none'))
);

-- Optionaler harter FK auf das Rohprofil — bewusst AUSKOMMENTIERT, weil die reale
-- Ziel-Tabelle/Spalte (mandate_profiles.id vs. profiles.id) beim Anwenden zu
-- verifizieren ist. Vor Aktivierung EINE der Varianten einkommentieren:
-- alter table public.mandate_register
--   add constraint mandate_register_profile_fk
--   foreign key (profile_id) references public.mandate_profiles(id) on delete cascade;

create index if not exists idx_mandate_register_party on public.mandate_register(party_key);
create index if not exists idx_mandate_register_coverage on public.mandate_register(coverage_status);
create index if not exists idx_mandate_register_person on public.mandate_register(canonical_person_key);

comment on table public.mandate_register is
  'Sprint 1 Universelles Mandatsregister: kanonische, neu berechenbare Projektion je Mandat (resolveMandate). Additiv, service_role-only. Keine PII ueber mandate_profiles hinaus.';

-- 2) Stabile externe Personen-IDs (DB-seitiger Dubletten-Schutz) --------------
create table if not exists public.mandate_external_ids (
  id            bigint generated always as identity primary key,
  profile_id    text not null,
  id_source     text not null,   -- bundestag | abgeordnetenwatch | wahlkreis_nr | internal
  external_id   text not null,
  created_at    timestamptz not null default now(),
  constraint mandate_external_ids_source_chk
    check (id_source in ('bundestag','abgeordnetenwatch','wahlkreis_nr','internal')),
  -- Personen-Eindeutigkeit: EINE externe ID gehoert zu genau EINEM Mandat.
  constraint mandate_external_ids_unique unique (id_source, external_id)
);

create index if not exists idx_mandate_external_ids_profile on public.mandate_external_ids(profile_id);

comment on table public.mandate_external_ids is
  'Stabile externe Personen-IDs (Bundestag/abgeordnetenwatch/Wahlkreis-Nr). UNIQUE(id_source, external_id) erzwingt Personen-Eindeutigkeit auf DB-Ebene (Dubletten-Schutz).';

-- 3) Zugriff: NUR service_role (wie alle Backend-/Cron-Pfade) -----------------
revoke all on table public.mandate_register    from public, anon, authenticated;
revoke all on table public.mandate_external_ids from public, anon, authenticated;

-- RLS an, BEWUSST KEINE Policies (service_role umgeht RLS; alle anderen sehen nichts).
do $$
begin
  execute 'alter table public.mandate_register    enable row level security';
  execute 'alter table public.mandate_external_ids enable row level security';
end $$;

commit;
