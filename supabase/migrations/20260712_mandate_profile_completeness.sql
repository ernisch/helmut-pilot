-- Mehrmandantenfaehigkeit Phase 15 (Nachtrag): Profil-Vollstaendigkeit.
-- Schliesst die Luecke, dass einige Blob-Profilfelder in mandate_profiles keine
-- Entsprechung hatten und beim Aktivieren von HELMUT_PROFILE_DB_MODE verloren
-- gingen. Rein additiv (neue, defaultete Spalten). Siehe
-- docs/multitenancy-profil-vollstaendigkeit.md.
--
-- Strukturierte Spalten fuer die funktional genutzten Felder (Radar/Matching/Buero)
-- + eine profil_extras-JSONB-Spalte als VERLUSTFREIER Auffangbehaelter fuer alle
-- uebrigen und kuenftigen Blob-Felder (localMedia, mainQuestion, officeFormats,
-- outputNeeds, location, ...). Damit geht garantiert KEIN Feld verloren.
--
-- Idempotent (add column if not exists), rueckrollbar via
-- 20260712_mandate_profile_completeness_rollback.sql.

alter table public.mandate_profiles
  add column if not exists relevante_ministerien text[] not null default '{}',
  add column if not exists gegner text[] not null default '{}',
  add column if not exists monitoring_ziele text[] not null default '{}',
  add column if not exists regionale_interessen text[] not null default '{}',
  add column if not exists themen_prioritaeten jsonb not null default '{}'::jsonb,
  add column if not exists buero_uebergabe text,
  add column if not exists profil_extras jsonb not null default '{}'::jsonb;

comment on column public.mandate_profiles.relevante_ministerien is 'relevantMinistries: fuer Entity-/Radar-Erkennung (z.B. BMAS, BMG).';
comment on column public.mandate_profiles.gegner is 'opponents: politische Gegner fuer die Entity-Erkennung.';
comment on column public.mandate_profiles.monitoring_ziele is 'monitoringTargets: was das Mandat beobachten will.';
comment on column public.mandate_profiles.regionale_interessen is 'regionalInterests: regionale Begriffe (Orte/Betriebe) fuer Radar/Entity-Erkennung.';
comment on column public.mandate_profiles.themen_prioritaeten is 'topicPriorities: {Thema: 1..5} Gewichtung fuer die Themen-Priorisierung.';
comment on column public.mandate_profiles.buero_uebergabe is 'officeHandoffMethod: bevorzugter Uebergabeweg fuer Buero-Entwuerfe.';
comment on column public.mandate_profiles.profil_extras is 'Verlustfreier Auffangbehaelter fuer alle uebrigen/kuenftigen Blob-Felder (localMedia, mainQuestion, officeFormats, outputNeeds, location, ...). Garantiert kein Feldverlust beim DB-Pfad.';
