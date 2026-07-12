-- Rollback fuer 20260712_mandate_profile_fields.sql. Rein additiv rueckgaengig
-- gemacht: entfernt ausschliesslich die dort neu hinzugefuegten Spalten/Constraints.
-- Keine anderen Tabellen betroffen. Sicher auch dann, wenn die Tabelle inzwischen
-- befuellt wurde (DROP COLUMN verwirft nur die betroffenen Spaltenwerte, nicht
-- die restliche Zeile).

alter table public.mandate_profiles
  drop constraint if exists mandate_profiles_politische_ebene_check,
  drop constraint if exists mandate_profiles_regierungsrolle_check,
  drop constraint if exists mandate_profiles_onboarding_status_check,
  drop constraint if exists mandate_profiles_ki_budget_taeglich_check,
  drop constraint if exists mandate_profiles_ki_budget_monatlich_check;

alter table public.mandate_profiles
  drop column if exists namensvarianten,
  drop column if exists stellvertretende_ausschuesse,
  drop column if exists regionale_themen,
  drop column if exists regierungsrolle,
  drop column if exists aktiv,
  drop column if exists onboarding_status,
  drop column if exists ki_budget_taeglich_cent,
  drop column if exists ki_budget_monatlich_cent,
  drop column if exists datenschutz_bestaetigt_at,
  drop column if exists geloescht_at;
