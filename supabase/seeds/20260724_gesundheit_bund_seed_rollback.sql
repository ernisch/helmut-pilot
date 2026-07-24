-- Rollback des GESUNDHEIT-(Bund)-PREPARED-Seeds. Loescht die eingefuegten gesundheit-bund-
-- Abrufwege + Zuordnungen (eindeutige Ids). NEUE Herausgeber/Entitaeten werden GUARDED
-- geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden.
-- Beruehrt KEINE Bestands-Herausgeber (bundesgesundheitsministerium.de/bundesrat.de/destatis.de),
-- keine Bestands-Entitaeten, keine anderen Pakete und das Paket pkg-gesundheit-bund selbst NICHT.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-gesbund-bmg-gesetzgebung', 'rp-gesbund-bundesrat-gesundheit', 'rp-gesbund-gba-beschluesse', 'rp-gesbund-rki-epidbull', 'rp-gesbund-destatis-genesis', 'rp-gesbund-gkv-spitzenverband', 'rp-gesbund-kbv-praxisnachrichten', 'rp-gesbund-dkg-positionen', 'rp-gesbund-svr-gutachten', 'rp-gesbund-bfarm-lieferengpaesse', 'rp-gesbund-pei-sicherheit', 'rp-gesbund-iqwig-berichte', 'rp-gesbund-baek-stellungnahmen', 'rp-gesbund-pflegerat-stellungnahmen');
delete from public.path_expected_levels where retrieval_path_id in ('rp-gesbund-bmg-gesetzgebung', 'rp-gesbund-bundesrat-gesundheit', 'rp-gesbund-gba-beschluesse', 'rp-gesbund-rki-epidbull', 'rp-gesbund-destatis-genesis', 'rp-gesbund-gkv-spitzenverband', 'rp-gesbund-kbv-praxisnachrichten', 'rp-gesbund-dkg-positionen', 'rp-gesbund-svr-gutachten', 'rp-gesbund-bfarm-lieferengpaesse', 'rp-gesbund-pei-sicherheit', 'rp-gesbund-iqwig-berichte', 'rp-gesbund-baek-stellungnahmen', 'rp-gesbund-pflegerat-stellungnahmen');
delete from public.package_paths where retrieval_path_id in ('rp-gesbund-bmg-gesetzgebung', 'rp-gesbund-bundesrat-gesundheit', 'rp-gesbund-gba-beschluesse', 'rp-gesbund-rki-epidbull', 'rp-gesbund-destatis-genesis', 'rp-gesbund-gkv-spitzenverband', 'rp-gesbund-kbv-praxisnachrichten', 'rp-gesbund-dkg-positionen', 'rp-gesbund-svr-gutachten', 'rp-gesbund-bfarm-lieferengpaesse', 'rp-gesbund-pei-sicherheit', 'rp-gesbund-iqwig-berichte', 'rp-gesbund-baek-stellungnahmen', 'rp-gesbund-pflegerat-stellungnahmen');
delete from public.retrieval_paths where id in ('rp-gesbund-bmg-gesetzgebung', 'rp-gesbund-bundesrat-gesundheit', 'rp-gesbund-gba-beschluesse', 'rp-gesbund-rki-epidbull', 'rp-gesbund-destatis-genesis', 'rp-gesbund-gkv-spitzenverband', 'rp-gesbund-kbv-praxisnachrichten', 'rp-gesbund-dkg-positionen', 'rp-gesbund-svr-gutachten', 'rp-gesbund-bfarm-lieferengpaesse', 'rp-gesbund-pei-sicherheit', 'rp-gesbund-iqwig-berichte', 'rp-gesbund-baek-stellungnahmen', 'rp-gesbund-pflegerat-stellungnahmen');
-- Neue Herausgeber nur loeschen, wenn KEIN Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-g-ba.de', 'publisher-rki.de', 'publisher-gkv-spitzenverband.de', 'publisher-kbv.de', 'publisher-dkgev.de', 'publisher-svr-gesundheit.de', 'publisher-bfarm.de', 'publisher-pei.de', 'publisher-iqwig.de', 'publisher-bundesaerztekammer.de', 'publisher-deutscher-pflegerat.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Neue Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('institution-g-ba', 'authority-rki', 'association-gkv-spitzenverband', 'association-kbv', 'association-dkg', 'institution-svr-gesundheit', 'authority-bfarm', 'authority-pei', 'institution-iqwig', 'association-bundesaerztekammer', 'association-deutscher-pflegerat')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
