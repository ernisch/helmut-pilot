-- Rollback des PREPARED-Seeds 'verkehr-infrastruktur-bund'. Loescht die eingefuegten NEUEN
-- Wege + Paket-Zuordnungen + das Paket; Herausgeber/Entitaeten werden GUARDED geloescht
-- (nur wenn danach von KEINEM Weg/Herausgeber mehr referenziert). Bestehende, geteilte
-- Herausgeber/Entitaeten (Destatis/BDI/…) und der Bestandsweg rp-committee-verkehr bleiben
-- unberuehrt. Beruehrt KEINE Bestandsquelle.
begin;
delete from public.path_expected_topics where retrieval_path_id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi');
delete from public.path_expected_entities where retrieval_path_id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi');
delete from public.path_expected_geographies where retrieval_path_id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi');
delete from public.path_expected_levels where retrieval_path_id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi');
delete from public.package_paths where package_id = 'pkg-verkehr-infrastruktur-bund';
delete from public.retrieval_paths where id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi');
delete from public.source_packages where id = 'pkg-verkehr-infrastruktur-bund';
-- Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers pu where pu.id in ('publisher-bmv.de', 'publisher-mobilitaet-in-deutschland.de', 'publisher-deutschebahn.com', 'publisher-eba.bund.de', 'publisher-dzsf.bund.de', 'publisher-autobahn.de', 'publisher-bast.de', 'publisher-gdws.wsv.bund.de', 'publisher-baw.de', 'publisher-bfu-web.de', 'publisher-kba.de', 'publisher-umweltbundesamt.de', 'publisher-balm.bund.de', 'publisher-dlr.de', 'publisher-diw.de', 'publisher-vdv.de', 'publisher-allianz-pro-schiene.de', 'publisher-adac.de', 'publisher-staedtetag.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = pu.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('ministry-bmv', 'company-db-infrago', 'company-autobahn-gmbh', 'authority-eba', 'authority-bast', 'authority-baw', 'authority-gdws', 'authority-bfu', 'authority-dzsf', 'authority-kba', 'authority-uba', 'authority-balm', 'institute-dlr-vf', 'institute-diw', 'association-vdv', 'association-allianz-pro-schiene', 'association-adac', 'association-staedtetag')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
