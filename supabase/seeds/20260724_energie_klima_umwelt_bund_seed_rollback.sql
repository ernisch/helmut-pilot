-- Rollback des PREPARED-Seeds energie-klima-umwelt-bund. Loescht die eingefuegten
-- Bund-Abrufwege + Zuordnungen + das Paket (eindeutige Ids). Herausgeber/Entitaeten
-- werden GUARDED geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr
-- referenziert werden. Das schuetzt bereits vorhandene, geteilte Herausgeber/Entitaeten
-- (z. B. publisher-destatis.de / statoffice-destatis, von Bestandswegen referenziert)
-- vor versehentlicher Loeschung. Beruehrt KEINE anderen Wege/Pakete/Basis-Daten.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bmwe', 'rp-bmukn', 'rp-bnetza-monitoring', 'rp-umweltbundesamt', 'rp-expertenrat-klima', 'rp-sru-umweltgutachten', 'rp-uenb-netzentwicklungsplan', 'rp-destatis-energie-umwelt', 'rp-bafa-foerderung');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bmwe', 'rp-bmukn', 'rp-bnetza-monitoring', 'rp-umweltbundesamt', 'rp-expertenrat-klima', 'rp-sru-umweltgutachten', 'rp-uenb-netzentwicklungsplan', 'rp-destatis-energie-umwelt', 'rp-bafa-foerderung');
delete from public.package_paths where retrieval_path_id in ('rp-bmwe', 'rp-bmukn', 'rp-bnetza-monitoring', 'rp-umweltbundesamt', 'rp-expertenrat-klima', 'rp-sru-umweltgutachten', 'rp-uenb-netzentwicklungsplan', 'rp-destatis-energie-umwelt', 'rp-bafa-foerderung');
delete from public.retrieval_paths where id in ('rp-bmwe', 'rp-bmukn', 'rp-bnetza-monitoring', 'rp-umweltbundesamt', 'rp-expertenrat-klima', 'rp-sru-umweltgutachten', 'rp-uenb-netzentwicklungsplan', 'rp-destatis-energie-umwelt', 'rp-bafa-foerderung');
-- Paket nur loeschen, wenn KEIN package_paths mehr darauf zeigt:
delete from public.source_packages sp where sp.id = 'pkg-energie-klima-umwelt-bund'
  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers pu where pu.id in ('publisher-bundeswirtschaftsministerium.de', 'publisher-bundesumweltministerium.de', 'publisher-bundesnetzagentur.de', 'publisher-umweltbundesamt.de', 'publisher-expertenrat-klima.de', 'publisher-umweltrat.de', 'publisher-netzentwicklungsplan.de', 'publisher-bafa.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = pu.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmwe', 'ministry-bmukn', 'authority-bnetza', 'authority-umweltbundesamt', 'other_institution-expertenrat-klima', 'other_institution-sru', 'other_institution-uenb-verbund', 'authority-bafa')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
