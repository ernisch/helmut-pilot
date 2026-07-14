-- Helmut — Neue Quellenarchitektur · Sprint 1: Rollback
-- =====================================================
-- Macht 20260713_source_architecture.sql vollstaendig rueckgaengig. Da die Migration
-- rein additiv ist (keine bestehende Tabelle/Spalte/Daten angefasst), ist der Rollback
-- risikofrei: er entfernt ausschliesslich die neu angelegten Objekte.
--
-- Reihenfolge: abhaengige (FK-)Tabellen zuerst. drop ... if exists + cascade fuer
-- Wiederholbarkeit.

begin;

-- Assoziationen zuerst
drop table if exists public.path_expected_entities cascade;
drop table if exists public.path_expected_topics cascade;
drop table if exists public.path_expected_geographies cascade;
drop table if exists public.path_expected_levels cascade;

-- m:n + Pakete
drop table if exists public.package_paths cascade;
drop table if exists public.source_packages cascade;

-- Abrufwege + Herausgeber
drop table if exists public.retrieval_paths cascade;
drop table if exists public.publishers cascade;

-- Entitaeten + Wahlkreise + Geografie (Geografie zuletzt, da referenziert)
drop table if exists public.political_entities cascade;
drop table if exists public.electoral_districts cascade;
drop table if exists public.geographies cascade;

commit;
