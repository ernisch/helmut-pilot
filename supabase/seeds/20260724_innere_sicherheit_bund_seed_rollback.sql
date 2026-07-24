-- Rollback des PREPARED-Seeds "Innere Sicherheit (Bund)". Loescht NUR die neu
-- eingefuegten Objekte. Schuetzt bestehende, WIEDERVERWENDETE Daten:
--   - rp-dip / rp-committee-inneres werden NICHT geloescht (nur die package_paths-Referenz).
--   - ministry-bmi wird NICHT geloescht (bestehende Entitaet; nicht in der Loeschliste).
--   - Herausgeber/Entitaeten werden GUARDED geloescht (nur wenn nichts mehr sie referenziert).
-- Beruehrt KEINE Bundeswege und keine Basis-Daten.
begin;
delete from public.path_expected_entities where retrieval_path_id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte');
delete from public.path_expected_topics where retrieval_path_id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte');
delete from public.path_expected_levels where retrieval_path_id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte');
delete from public.package_paths where package_id = 'pkg-innere-sicherheit-bund';
delete from public.retrieval_paths where id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte');
delete from public.source_packages where id = 'pkg-innere-sicherheit-bund';
delete from public.publishers p where p.id in ('publisher-bmi.bund.de', 'publisher-bka.de', 'publisher-verfassungsschutz.de', 'publisher-bfdi.bund.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
delete from public.political_entities e where e.id in ('authority-bka', 'authority-bfv', 'authority-bfdi')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
