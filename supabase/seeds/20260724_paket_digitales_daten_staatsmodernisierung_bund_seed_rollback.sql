-- Rollback des PREPARED-Seeds 'digitales-daten-staatsmodernisierung-bund'.
-- Löscht NUR die neu eingefügten Objekte. Wiederverwendete Bestandswege (rp-dip,
-- rp-committee-digitales) und deren Herausgeber/Entitäten bleiben unangetastet:
-- es werden nur DEREN package_paths-VERKNÜPFUNGEN zu diesem Paket entfernt.
-- Herausgeber/Entitäten GUARDED (nur löschen, wenn nichts sie mehr referenziert) —
-- schützt geteilte Bestandsdaten vor on-delete-cascade.
begin;
-- a) Erwartete Dimensionen der neuen Wege
delete from public.path_expected_topics where retrieval_path_id in ('rp-bmds-presse', 'rp-it-planungsrat-beschluesse', 'rp-bundesrechnungshof-digital', 'rp-nkr-veroeffentlichungen', 'rp-bfdi-veroeffentlichungen');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bmds-presse', 'rp-it-planungsrat-beschluesse', 'rp-bundesrechnungshof-digital', 'rp-nkr-veroeffentlichungen', 'rp-bfdi-veroeffentlichungen');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bmds-presse', 'rp-it-planungsrat-beschluesse', 'rp-bundesrechnungshof-digital', 'rp-nkr-veroeffentlichungen', 'rp-bfdi-veroeffentlichungen');
-- b) ALLE Paketverknüpfungen dieses Pakets (neue + wiederverwendete Links)
delete from public.package_paths where package_id = 'pkg-digitales-daten-staatsmodernisierung-bund';
-- c) Die 5 neuen Abrufwege (nur diese IDs)
delete from public.retrieval_paths where id in ('rp-bmds-presse', 'rp-it-planungsrat-beschluesse', 'rp-bundesrechnungshof-digital', 'rp-nkr-veroeffentlichungen', 'rp-bfdi-veroeffentlichungen');
-- d) Das Paket (Verknüpfungen sind in b) bereits entfernt)
delete from public.source_packages where id = 'pkg-digitales-daten-staatsmodernisierung-bund';
-- e) Neue Herausgeber nur löschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmds.bund.de', 'publisher-it-planungsrat.de', 'publisher-normenkontrollrat.bund.de', 'publisher-bfdi.bund.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- f) Neue Entitäten nur löschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmds', 'institution-it-planungsrat', 'institution-nkr', 'authority-bfdi')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
