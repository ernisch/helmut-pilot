-- Rollback fuer 20260712_mandate_profile_completeness.sql.
-- Entfernt ausschliesslich die dort neu hinzugefuegten Spalten. Keine andere
-- Tabelle/Spalte betroffen.

alter table public.mandate_profiles
  drop column if exists relevante_ministerien,
  drop column if exists gegner,
  drop column if exists monitoring_ziele,
  drop column if exists regionale_interessen,
  drop column if exists themen_prioritaeten,
  drop column if exists buero_uebergabe,
  drop column if exists profil_extras;
