-- Rollback des PREPARED-Seeds 'bevoelkerungsschutz-katastrophenschutz-bund'.
-- Entfernt das Paket + die 7 neuen Wege + Zuordnungen (eindeutige Ids). Herausgeber/
-- Entitaeten werden GUARDED geloescht: NUR wenn danach kein Abrufweg/Herausgeber sie mehr
-- referenziert. Das schuetzt geteilte Bestandsobjekte (publisher-bundesrechnungshof.de,
-- ministry-bmi, authority-bundesrechnungshof) vor versehentlicher Loeschung.
-- Loescht NUR die Paket-Verknuepfungen dieses Pakets — bestehende Wege (rp-dip,
-- rp-committee-inneres) und ihre Zuordnung zu pkg-bund-basis bleiben unveraendert.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bevschutz-bmi-strategie', 'rp-bevschutz-bbk-strategie-risiko', 'rp-bevschutz-imk-beschluesse', 'rp-bevschutz-bbk-warnung', 'rp-bevschutz-thw-jahresbericht', 'rp-bevschutz-bbk-luekex', 'rp-bevschutz-brh-pruefungen');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bevschutz-bmi-strategie', 'rp-bevschutz-bbk-strategie-risiko', 'rp-bevschutz-imk-beschluesse', 'rp-bevschutz-bbk-warnung', 'rp-bevschutz-thw-jahresbericht', 'rp-bevschutz-bbk-luekex', 'rp-bevschutz-brh-pruefungen');
delete from public.package_paths where package_id = 'pkg-bevoelkerungsschutz-katastrophenschutz-bund';
delete from public.retrieval_paths where id in ('rp-bevschutz-bmi-strategie', 'rp-bevschutz-bbk-strategie-risiko', 'rp-bevschutz-imk-beschluesse', 'rp-bevschutz-bbk-warnung', 'rp-bevschutz-thw-jahresbericht', 'rp-bevschutz-bbk-luekex', 'rp-bevschutz-brh-pruefungen');
delete from public.source_packages where id = 'pkg-bevoelkerungsschutz-katastrophenschutz-bund';
-- Herausgeber nur loeschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmi.bund.de', 'publisher-bbk.bund.de', 'publisher-thw.de', 'publisher-innenministerkonferenz.de', 'publisher-bundesrechnungshof.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('authority-bbk', 'authority-thw', 'institution-imk')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
