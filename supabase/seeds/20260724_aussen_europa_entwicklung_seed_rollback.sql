-- Rollback des PREPARED-Seeds `aussen-europa-und-entwicklung-bund`. Löscht die eingefügten
-- NEUEN Objekte (eindeutige Ids). WIEDERVERWENDETE Wege (rp-dip, rp-bundesregierung) und ihre
-- bestehenden bund-basis-Verknüpfungen bleiben UNBERÜHRT — es werden nur die package_paths
-- DIESES Pakets (per package_id) entfernt. Herausgeber/Entitaeten werden GUARDED gelöscht:
-- NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden (schützt die
-- wiederverwendete Entity ministry-auswaertiges-amt und alle Basis-Daten). Beruehrt KEINE
-- bestehenden Bundes-/Basis-Wege.
begin;
delete from public.path_expected_entities where retrieval_path_id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil');
delete from public.path_expected_topics where retrieval_path_id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil');
delete from public.path_expected_levels where retrieval_path_id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil');
-- nur die Verknüpfungen DIESES Pakets entfernen (rp-dip/rp-bundesregierung bleiben bund-basis erhalten):
delete from public.package_paths where package_id = 'pkg-aussen-europa-und-entwicklung-bund';
delete from public.retrieval_paths where id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil');
delete from public.source_packages where id = 'pkg-aussen-europa-und-entwicklung-bund';
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-auswaertiges-amt.de', 'publisher-bmz.de', 'publisher-commission.europa.eu', 'publisher-consilium.europa.eu', 'publisher-europarl.europa.eu')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmz', 'eu-commission', 'eu-council-of-the-eu', 'eu-european-council', 'eu-parliament')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
