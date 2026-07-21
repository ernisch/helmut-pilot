-- Helmut — Master Quellenkatalog · Sprint 3 · ROLLBACK
-- ============================================================================================
-- Setzt 20260722_master_source_catalog.sql vollstaendig zurueck. Rein additive Migration ->
-- der Rollback entfernt ausschliesslich die NEUEN Objekte; kein Bestandsobjekt wird beruehrt.
-- Idempotent (drop ... if exists). Reihenfolge respektiert die Fremdschluessel (abhaengige
-- Tabellen zuerst). NICHT automatisch ausgefuehrt — nur nach Freigabe.

begin;

-- Tenant-Policies zuerst entfernen (harmlos, falls nie erstellt).
do $$
declare t text;
begin
  foreach t in array array['tenant_source_relevance','tenant_source_overrides','tenant_private_sources'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
  end loop;
end $$;

-- Abhaengige/Verknuepfungstabellen zuerst.
drop table if exists public.catalog_source_audit;
drop table if exists public.catalog_source_health;
drop table if exists public.catalog_package_assignments;
drop table if exists public.catalog_source_regions;
drop table if exists public.catalog_source_topics;
drop table if exists public.catalog_source_committees;
drop table if exists public.catalog_source_paths;

-- Tenant-Tabellen.
drop table if exists public.tenant_source_relevance;
drop table if exists public.tenant_source_overrides;
drop table if exists public.tenant_private_sources;

-- Kern-Tabellen zuletzt (catalog_sources vor catalog_publishers wegen FK).
drop table if exists public.catalog_sources;
drop table if exists public.catalog_publishers;

commit;
