-- Rollback des PREPARED-Seeds `familie-jugend-integration-und-teilhabe`. GUARDED + NICHT-destruktiv
-- gegenüber Bestand: löscht NUR die eigenen neuen Wege/Zuordnungen; Herausgeber/Entitäten werden
-- nur gelöscht, wenn sie danach von KEINEM Weg/Herausgeber mehr referenziert werden. Das schützt
-- Bestand (publisher-destatis.de, rp-dip, ministry-bmfsfj, statoffice-destatis) vor Cascade-Löschung.
-- Das Paket wird nur gelöscht, solange es 'prepared' ist (versehentlich aktiviertes Paket bleibt).
begin;
delete from public.path_expected_topics where retrieval_path_id in ('rp-fjit-bmbfsfj-vorhaben', 'rp-fjit-bmbfsfj-berichte', 'rp-fjit-destatis-bevoelkerung-familie', 'rp-fjit-destatis-gleichstellung', 'rp-fjit-ads-antidiskriminierung', 'rp-fjit-ubskm-kinderschutz', 'rp-fjit-integration', 'rp-fjit-teilhabe');
delete from public.path_expected_levels where retrieval_path_id in ('rp-fjit-bmbfsfj-vorhaben', 'rp-fjit-bmbfsfj-berichte', 'rp-fjit-destatis-bevoelkerung-familie', 'rp-fjit-destatis-gleichstellung', 'rp-fjit-ads-antidiskriminierung', 'rp-fjit-ubskm-kinderschutz', 'rp-fjit-integration', 'rp-fjit-teilhabe');
delete from public.package_paths where package_id = 'pkg-familie-jugend-integration-und-teilhabe';
delete from public.retrieval_paths where id in ('rp-fjit-bmbfsfj-vorhaben', 'rp-fjit-bmbfsfj-berichte', 'rp-fjit-destatis-bevoelkerung-familie', 'rp-fjit-destatis-gleichstellung', 'rp-fjit-ads-antidiskriminierung', 'rp-fjit-ubskm-kinderschutz', 'rp-fjit-integration', 'rp-fjit-teilhabe');
-- Paket nur löschen, wenn noch 'prepared' und keine Zuordnung mehr hängt:
delete from public.source_packages sp where sp.id = 'pkg-familie-jugend-integration-und-teilhabe' and sp.status = 'prepared'
  and not exists (select 1 from public.package_paths pp where pp.package_id = sp.id);
-- Herausgeber nur löschen, wenn KEIN (auch kein Bestands-) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-bmbfsfj.bund.de', 'publisher-antidiskriminierungsstelle.de', 'publisher-beauftragte-missbrauch.de', 'publisher-integrationsbeauftragte.de', 'publisher-behindertenbeauftragter.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitäten nur löschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('authority-antidiskriminierungsstelle', 'authority-ubskm', 'authority-integrationsbeauftragte', 'authority-behindertenbeauftragter')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
