-- Rollback des Fachpaket-PREPARED-Seeds 'Wissenschaft und Forschung (Bund)'.
-- Löscht die eingefügten Abrufwege + Zuordnungen (eindeutige Ids). Herausgeber/Entitäten
-- werden GUARDED gelöscht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr
-- referenziert werden. Das schützt bereits vorhandene, geteilte Herausgeber
-- (publisher-destatis.de/publisher-oecd.org werden NIE angefasst — sie stehen nicht in der Id-Liste).
-- Berührt KEINE aktiven Bund-Basis-/Fachwege und keine Basis-Daten.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-wf-bmftr-politik', 'rp-wf-bmftr-bufi', 'rp-wf-gwk-beschluesse', 'rp-wf-wissenschaftsrat', 'rp-wf-dfg-strategie', 'rp-wf-efi-gutachten', 'rp-wf-destatis-hochschulforschung', 'rp-wf-dzhw', 'rp-wf-eu-forschung', 'rp-wf-oecd-sti', 'rp-wf-bmftr-raumfahrt', 'rp-wf-hrk');
delete from public.path_expected_levels where retrieval_path_id in ('rp-wf-bmftr-politik', 'rp-wf-bmftr-bufi', 'rp-wf-gwk-beschluesse', 'rp-wf-wissenschaftsrat', 'rp-wf-dfg-strategie', 'rp-wf-efi-gutachten', 'rp-wf-destatis-hochschulforschung', 'rp-wf-dzhw', 'rp-wf-eu-forschung', 'rp-wf-oecd-sti', 'rp-wf-bmftr-raumfahrt', 'rp-wf-hrk');
delete from public.package_paths where retrieval_path_id in ('rp-wf-bmftr-politik', 'rp-wf-bmftr-bufi', 'rp-wf-gwk-beschluesse', 'rp-wf-wissenschaftsrat', 'rp-wf-dfg-strategie', 'rp-wf-efi-gutachten', 'rp-wf-destatis-hochschulforschung', 'rp-wf-dzhw', 'rp-wf-eu-forschung', 'rp-wf-oecd-sti', 'rp-wf-bmftr-raumfahrt', 'rp-wf-hrk');
delete from public.retrieval_paths where id in ('rp-wf-bmftr-politik', 'rp-wf-bmftr-bufi', 'rp-wf-gwk-beschluesse', 'rp-wf-wissenschaftsrat', 'rp-wf-dfg-strategie', 'rp-wf-efi-gutachten', 'rp-wf-destatis-hochschulforschung', 'rp-wf-dzhw', 'rp-wf-eu-forschung', 'rp-wf-oecd-sti', 'rp-wf-bmftr-raumfahrt', 'rp-wf-hrk');
-- Paket nur löschen, wenn keine Zuordnung mehr darauf zeigt (nach obigem Delete erfüllt):
delete from public.source_packages sp where sp.id = 'pkg-wissenschaft-forschung-bund'
  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);
-- Herausgeber nur löschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmftr.bund.de', 'publisher-gwk-bonn.de', 'publisher-wissenschaftsrat.de', 'publisher-dfg.de', 'publisher-e-fi.de', 'publisher-dzhw.eu', 'publisher-research-and-innovation.ec.europa.eu', 'publisher-hrk.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitäten nur löschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmftr', 'institution-gwk', 'institution-wissenschaftsrat', 'institution-dfg', 'institution-efi', 'institution-dzhw', 'institution-eu-kommission-rtd', 'association-hrk')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
