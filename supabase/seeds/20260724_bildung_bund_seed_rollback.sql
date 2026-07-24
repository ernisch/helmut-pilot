-- Rollback des bildung-bund-PREPARED-Seeds. Loescht NUR die neu eingefuegten Bildungs-
-- Wege/-Herausgeber/-Entitaeten + das Paket + Zuordnungen (eindeutige Ids). Der
-- WIEDERVERWENDETE Weg rp-committee-bildung und die geteilten Herausgeber/Entitaeten
-- (destatis/arbeitsagentur/bundesrat/oecd, committee-bt-bildung, ...) werden NICHT geloescht:
-- die package_paths-Zeile des geteilten Wegs wird gezielt nur fuer pkg-bildung-bund entfernt,
-- Herausgeber/Entitaeten nur GUARDED (nur wenn danach unreferenziert). Beruehrt keine aktiven Quellen.
begin;
delete from public.package_paths where package_id = 'pkg-bildung-bund';
delete from public.path_expected_topics where retrieval_path_id in ('rp-bildung-bmbfsfj', 'rp-bildung-kmk', 'rp-bildung-bibb', 'rp-bildung-destatis', 'rp-bildung-bildungsbericht', 'rp-bildung-swk', 'rp-bildung-iqb', 'rp-bildung-oecd', 'rp-bildung-dzhw', 'rp-bildung-ba-ausbildungsmarkt', 'rp-bildung-bundesrat');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bildung-bmbfsfj', 'rp-bildung-kmk', 'rp-bildung-bibb', 'rp-bildung-destatis', 'rp-bildung-bildungsbericht', 'rp-bildung-swk', 'rp-bildung-iqb', 'rp-bildung-oecd', 'rp-bildung-dzhw', 'rp-bildung-ba-ausbildungsmarkt', 'rp-bildung-bundesrat');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bildung-bmbfsfj', 'rp-bildung-kmk', 'rp-bildung-bibb', 'rp-bildung-destatis', 'rp-bildung-bildungsbericht', 'rp-bildung-swk', 'rp-bildung-iqb', 'rp-bildung-oecd', 'rp-bildung-dzhw', 'rp-bildung-ba-ausbildungsmarkt', 'rp-bildung-bundesrat');
delete from public.retrieval_paths where id in ('rp-bildung-bmbfsfj', 'rp-bildung-kmk', 'rp-bildung-bibb', 'rp-bildung-destatis', 'rp-bildung-bildungsbericht', 'rp-bildung-swk', 'rp-bildung-iqb', 'rp-bildung-oecd', 'rp-bildung-dzhw', 'rp-bildung-ba-ausbildungsmarkt', 'rp-bildung-bundesrat');
delete from public.source_packages where id = 'pkg-bildung-bund';
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmbfsfj.bund.de', 'publisher-kmk.org', 'publisher-bibb.de', 'publisher-bildungsbericht.de', 'publisher-swk-bildung.org', 'publisher-iqb.hu-berlin.de', 'publisher-dzhw.eu')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmbfsfj', 'institution-kmk', 'authority-bibb', 'institution-dipf', 'institution-swk', 'institution-iqb', 'institution-dzhw')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
