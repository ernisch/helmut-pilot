-- Rollback des PREPARED-Seeds 'Kultur, Medien und Sport (Bund)'. Entfernt ausschliesslich
-- die NEUEN Objekte (5 Wege, 3 Entitaeten, 2 Herausgeber, 1 Paket) + die Paketzuordnungen.
-- WICHTIG: Wiederverwendete Wege (rp-dip, rp-committee-*) und Herausgeber
-- (publisher-bundesregierung.de, publisher-destatis.de) sowie die Entitaet statoffice-destatis
-- werden NICHT geloescht — nur ihre Verknuepfung zum neuen Paket wird entfernt (guarded).
begin;
delete from public.path_expected_entities where retrieval_path_id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht');
delete from public.path_expected_topics where retrieval_path_id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht');
delete from public.package_paths where package_id = 'pkg-kultur-medien-und-sport-bund';
delete from public.retrieval_paths where id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht');
delete from public.source_packages where id = 'pkg-kultur-medien-und-sport-bund';
delete from public.publishers p where p.id in ('publisher-kulturstaatsminister.de', 'publisher-nada.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
delete from public.political_entities e where e.id in ('ministry-bkm', 'government-sport-ehrenamt-bk', 'institution-nada')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id)
  and not exists (select 1 from public.path_expected_entities pe where pe.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
