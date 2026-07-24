-- Rollback des PREPARED-Seeds "verteidigung-bund". Loescht ausschliesslich die neu
-- eingefuegten Zeilen (eindeutige Ids). WICHTIG:
--  * rp-dip wird NICHT geloescht (nur die Paketverknuepfung ueber package_id).
--  * Bestehende Herausgeber/Entitaeten (publisher-bundestag.de, publisher-bundesregierung.de,
--    parliament-bundestag, government-bund, committee-bt-verteidigung) werden NIE angefasst.
--  * Neue Herausgeber/Entitaeten werden GUARDED geloescht: nur wenn nichts mehr sie referenziert.
begin;
delete from public.path_expected_entities where retrieval_path_id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit');
delete from public.path_expected_topics where retrieval_path_id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit');
delete from public.path_expected_levels where retrieval_path_id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit');
-- Alle Paketzuordnungen des Pakets loesen (auch die rp-dip-Verknuepfung) — rp-dip selbst bleibt:
delete from public.package_paths where package_id = 'pkg-verteidigung-bund';
delete from public.retrieval_paths where id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit');
delete from public.source_packages where id = 'pkg-verteidigung-bund';
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmvg.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber und KEINE erwartete-Entitaet-Zeile sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmvg', 'institution-bundeswehr', 'institution-wehrbeauftragter')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id)
  and not exists (select 1 from public.path_expected_entities pe where pe.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
