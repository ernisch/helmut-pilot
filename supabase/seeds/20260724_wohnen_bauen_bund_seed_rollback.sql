-- Rollback des Wohnen/Bauen-PREPARED-Seeds. Löscht die eingefügten Wege + Zuordnungen +
-- das Paket. Herausgeber/Entitäten werden GUARDED gelöscht: NUR wenn danach von KEINEM
-- Abrufweg/Herausgeber mehr referenziert. Die WIEDERVERWENDETEN Bestands-Herausgeber
-- (publisher-destatis.de, publisher-bundesrat.de) werden GAR NICHT angefasst.
-- Berührt KEINE Bundeswege, KEINE Landesmodule, KEINE Basis-Daten.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-wbs-bmwsb-steuerung', 'rp-wbs-bbsr-forschung', 'rp-wbs-destatis-bau-wohnen', 'rp-wbs-bundesrat-staedtebau', 'rp-wbs-uba-nachhaltiges-bauen', 'rp-wbs-bib-demografie', 'rp-wbs-kfw-foerderung', 'rp-wbs-staedtetag-kommunal', 'rp-wbs-landkreistag-laendlich', 'rp-wbs-difu-stadtforschung');
delete from public.path_expected_levels where retrieval_path_id in ('rp-wbs-bmwsb-steuerung', 'rp-wbs-bbsr-forschung', 'rp-wbs-destatis-bau-wohnen', 'rp-wbs-bundesrat-staedtebau', 'rp-wbs-uba-nachhaltiges-bauen', 'rp-wbs-bib-demografie', 'rp-wbs-kfw-foerderung', 'rp-wbs-staedtetag-kommunal', 'rp-wbs-landkreistag-laendlich', 'rp-wbs-difu-stadtforschung');
delete from public.package_paths where retrieval_path_id in ('rp-wbs-bmwsb-steuerung', 'rp-wbs-bbsr-forschung', 'rp-wbs-destatis-bau-wohnen', 'rp-wbs-bundesrat-staedtebau', 'rp-wbs-uba-nachhaltiges-bauen', 'rp-wbs-bib-demografie', 'rp-wbs-kfw-foerderung', 'rp-wbs-staedtetag-kommunal', 'rp-wbs-landkreistag-laendlich', 'rp-wbs-difu-stadtforschung');
delete from public.retrieval_paths where id in ('rp-wbs-bmwsb-steuerung', 'rp-wbs-bbsr-forschung', 'rp-wbs-destatis-bau-wohnen', 'rp-wbs-bundesrat-staedtebau', 'rp-wbs-uba-nachhaltiges-bauen', 'rp-wbs-bib-demografie', 'rp-wbs-kfw-foerderung', 'rp-wbs-staedtetag-kommunal', 'rp-wbs-landkreistag-laendlich', 'rp-wbs-difu-stadtforschung');
delete from public.source_packages where id = 'pkg-wohnen-bauen-stadtentwicklung-bund';
-- NUR neu angelegte Herausgeber (nicht die wiederverwendeten) — und nur, wenn verwaist:
delete from public.publishers p where p.id in ('publisher-bmwsb.bund.de', 'publisher-bbsr.bund.de', 'publisher-umweltbundesamt.de', 'publisher-bib.bund.de', 'publisher-kfw.de', 'publisher-staedtetag.de', 'publisher-landkreistag.de', 'publisher-difu.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmwsb', 'authority-bbsr', 'authority-uba', 'authority-bib', 'authority-kfw', 'association-difu', 'association-staedtetag', 'association-landkreistag')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
