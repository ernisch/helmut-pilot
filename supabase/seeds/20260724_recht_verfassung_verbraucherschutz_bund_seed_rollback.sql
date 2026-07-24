-- Rollback des PREPARED-Seeds 'recht-verfassung-und-verbraucherschutz-bund'.
-- Referenzsicher: Kinder vor Eltern. Loescht NUR die neu eingefuegten Objekte +
-- ausschliesslich die Paketverknuepfungen DIESES Pakets. Wiederverwendete Wege
-- (rp-dip, rp-bundesregierung) werden NIE geloescht — nur ihre Verknuepfung zu
-- diesem Paket faellt weg (delete ... where package_id = <dieses Paket>).
-- Herausgeber/Entitaeten werden GUARDED geloescht: nur wenn danach von KEINEM
-- Abrufweg/Herausgeber mehr referenziert (schuetzt geteilte Objekte vor Cascade).
-- Beruehrt KEINE Basis-Daten und keine anderen Pakete.
begin;
delete from public.path_expected_entities where retrieval_path_id in ('rp-bmjv-recht', 'rp-bmjv-verbraucher', 'rp-bverfg-presse', 'rp-bfdi', 'rp-ausschuss-recht-verbraucherschutz');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bmjv-recht', 'rp-bmjv-verbraucher', 'rp-bverfg-presse', 'rp-bfdi', 'rp-ausschuss-recht-verbraucherschutz');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bmjv-recht', 'rp-bmjv-verbraucher', 'rp-bverfg-presse', 'rp-bfdi', 'rp-ausschuss-recht-verbraucherschutz');
-- NUR die package_paths DIESES Pakets (entfernt auch die 2 wiederverwendeten Links,
-- OHNE die wiederverwendeten Wege selbst zu loeschen):
delete from public.package_paths where package_id = 'pkg-recht-verfassung-und-verbraucherschutz-bund';
-- Nur die NEUEN Abrufwege loeschen (rp-dip/rp-bundesregierung sind NICHT in dieser Liste):
delete from public.retrieval_paths where id in ('rp-bmjv-recht', 'rp-bmjv-verbraucher', 'rp-bverfg-presse', 'rp-bfdi', 'rp-ausschuss-recht-verbraucherschutz');
delete from public.source_packages where id = 'pkg-recht-verfassung-und-verbraucherschutz-bund';
-- Herausgeber nur loeschen, wenn KEIN (auch kein anderer) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmjv.de', 'publisher-bundesverfassungsgericht.de', 'publisher-bfdi.bund.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmjv', 'institution-bverfg', 'authority-bfdi')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
