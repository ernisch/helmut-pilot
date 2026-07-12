-- Mehrmandantenfaehigkeit Phase 2: fehlende Felder auf mandate_profiles ergaenzen.
-- Rein additiv (neue, nullable/defaultete Spalten). Betrifft eine heute leere
-- (0 Zeilen), im Code noch nicht angebundene Tabelle -> kein Risiko fuer
-- bestehende Daten. Siehe docs/multitenancy-profildatenkarte.md (Phase 1) und
-- docs/multitenancy-profilmodell.md (Phase 2) fuer die vollstaendige Begruendung
-- je Feld.
--
-- Idempotent (if not exists / add column if not exists), rueckrollbar via
-- 20260712_mandate_profile_fields_rollback.sql.

alter table public.mandate_profiles
  add column if not exists namensvarianten text[] not null default '{}',
  add column if not exists stellvertretende_ausschuesse text[] not null default '{}',
  add column if not exists regionale_themen text[] not null default '{}',
  add column if not exists regierungsrolle text,
  add column if not exists aktiv boolean not null default true,
  add column if not exists onboarding_status text not null default 'neu',
  add column if not exists ki_budget_taeglich_cent integer,
  add column if not exists ki_budget_monatlich_cent integer,
  add column if not exists datenschutz_bestaetigt_at timestamptz,
  add column if not exists geloescht_at timestamptz;

-- Enum-artige Guards ueber CHECK statt echtem SQL-ENUM (leichter erweiterbar/
-- rueckrollbar, kein ALTER TYPE noetig). NULL bleibt erlaubt (unvollstaendiges
-- Profil ist ein gueltiger Zwischenzustand, siehe Phase 5).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mandate_profiles_politische_ebene_check'
  ) then
    alter table public.mandate_profiles
      add constraint mandate_profiles_politische_ebene_check
      check (politische_ebene is null or politische_ebene in ('bundestag', 'landtag'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mandate_profiles_regierungsrolle_check'
  ) then
    alter table public.mandate_profiles
      add constraint mandate_profiles_regierungsrolle_check
      check (regierungsrolle is null or regierungsrolle in ('regierung', 'opposition', 'unbekannt'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mandate_profiles_onboarding_status_check'
  ) then
    alter table public.mandate_profiles
      add constraint mandate_profiles_onboarding_status_check
      check (onboarding_status in ('neu', 'in_bearbeitung', 'abgeschlossen'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mandate_profiles_ki_budget_taeglich_check'
  ) then
    alter table public.mandate_profiles
      add constraint mandate_profiles_ki_budget_taeglich_check
      check (ki_budget_taeglich_cent is null or ki_budget_taeglich_cent > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mandate_profiles_ki_budget_monatlich_check'
  ) then
    alter table public.mandate_profiles
      add constraint mandate_profiles_ki_budget_monatlich_check
      check (ki_budget_monatlich_cent is null or ki_budget_monatlich_cent > 0);
  end if;
end $$;

comment on column public.mandate_profiles.namensvarianten is 'Kurz-/Titelformen fuer Radar-Personentreffer, z.B. Nachname allein.';
comment on column public.mandate_profiles.stellvertretende_ausschuesse is 'Ausschuesse mit stellvertretender statt voller Mitgliedschaft.';
comment on column public.mandate_profiles.regionale_themen is 'Lokale/regionale Themenbegriffe fuer die Entity-/Radar-Erkennung, getrennt von fachpolitische_schwerpunkte.';
comment on column public.mandate_profiles.regierungsrolle is 'regierung | opposition | unbekannt. Reine Anzeige, kein Matching-Gewicht.';
comment on column public.mandate_profiles.aktiv is 'Profil-Ebene (unabhaengig vom Account-Login): steuert Job-/Cron-Teilnahme (Crawl-Matching/Briefing) fuer dieses Mandat.';
comment on column public.mandate_profiles.onboarding_status is 'neu | in_bearbeitung | abgeschlossen. Admin-UX, keine Matching-Wirkung.';
comment on column public.mandate_profiles.ki_budget_taeglich_cent is 'Taegliches KI-Kostenlimit in Cent fuer dieses Mandat. NULL = Systemdefault greift (fail-closed, siehe Phase 10).';
comment on column public.mandate_profiles.ki_budget_monatlich_cent is 'Monatliches KI-Kostenlimit in Cent fuer dieses Mandat. NULL = Systemdefault greift.';
comment on column public.mandate_profiles.datenschutz_bestaetigt_at is 'Zeitpunkt der Datenschutz-Bestaetigung durch das Mandat. NULL = noch ungeklaert.';
comment on column public.mandate_profiles.geloescht_at is 'Soft-Delete-Zeitpunkt vor der endgueltigen Loeschung (DSGVO-Loeschprozess). NULL = aktiv.';
