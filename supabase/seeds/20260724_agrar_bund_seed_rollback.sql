-- Rollback des PREPARED-Seeds 'landwirtschaft-ernaehrung-und-laendliche-raeume-bund'.
-- Loescht die 7 NEUEN Abrufwege + deren Dimensionen + ALLE Paketverknuepfungen dieses Pakets
-- (auch die additiven Links zu den wiederverwendeten Bestandswegen rp-dip / rp-committee-landwirtschaft).
-- Herausgeber/Entitaeten/Paket werden GUARDED geloescht: nur, wenn danach nichts mehr referenziert.
-- Beruehrt KEINE Bestandswege (rp-dip, rp-committee-landwirtschaft bleiben), KEINEN Destatis-Herausgeber,
-- KEINE Basis-Daten und keine bund-basis-Verknuepfungen.
begin;
delete from public.path_expected_topics where retrieval_path_id in ('rp-agrar-bmleh-gesetzgebung', 'rp-agrar-bmleh-veroeffentlichungen', 'rp-agrar-bmleh-gap', 'rp-agrar-bmleh-gak-laendliche-raeume', 'rp-agrar-destatis-agrarstatistik', 'rp-agrar-ble-publikationen', 'rp-agrar-bvl-monitoring');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-agrar-bmleh-gesetzgebung', 'rp-agrar-bmleh-veroeffentlichungen', 'rp-agrar-bmleh-gap', 'rp-agrar-bmleh-gak-laendliche-raeume', 'rp-agrar-destatis-agrarstatistik', 'rp-agrar-ble-publikationen', 'rp-agrar-bvl-monitoring');
delete from public.path_expected_levels where retrieval_path_id in ('rp-agrar-bmleh-gesetzgebung', 'rp-agrar-bmleh-veroeffentlichungen', 'rp-agrar-bmleh-gap', 'rp-agrar-bmleh-gak-laendliche-raeume', 'rp-agrar-destatis-agrarstatistik', 'rp-agrar-ble-publikationen', 'rp-agrar-bvl-monitoring');
-- ALLE Verknuepfungen dieses Pakets loesen (7 neue + 2 wiederverwendete Bestandswege):
delete from public.package_paths where package_id = 'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund';
-- Nur die 7 NEUEN Abrufwege loeschen (Bestandswege sind NICHT in dieser Liste):
delete from public.retrieval_paths where id in ('rp-agrar-bmleh-gesetzgebung', 'rp-agrar-bmleh-veroeffentlichungen', 'rp-agrar-bmleh-gap', 'rp-agrar-bmleh-gak-laendliche-raeume', 'rp-agrar-destatis-agrarstatistik', 'rp-agrar-ble-publikationen', 'rp-agrar-bvl-monitoring');
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert (schuetzt geteilte/Bestands-Herausgeber):
delete from public.publishers p where p.id in ('publisher-bmleh.de', 'publisher-ble.de', 'publisher-bvl.bund.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmleh', 'authority-ble', 'authority-bvl')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
-- Paket nur loeschen, wenn KEIN package_paths-Eintrag es mehr referenziert (nach obigem Loeschen: 0):
delete from public.source_packages sp where sp.id = 'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund'
  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);
commit;
notify pgrst, 'reload schema';
