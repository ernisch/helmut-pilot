-- Rollback des Landesmodul-PREPARED-Seeds (Berlin/Brandenburg). Loescht die eingefuegten
-- BE/BB-Abrufwege + Zuordnungen (eindeutige Ids). Herausgeber/Entitaeten werden GUARDED
-- geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden.
-- Das schuetzt bereits vorher vorhandene, geteilte Herausgeber (z. B. publisher-tagesspiegel.de,
-- von Bundeswegen referenziert) vor versehentlicher Loeschung (on delete cascade!).
-- Beruehrt KEINE Bundeswege und keine Basis-Daten.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-bb-ausschuesse', 'rp-bb-landesfraktionen', 'rp-bb-landesparlament', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-partei_pilot', 'rp-bb-plenum', 'rp-bb-regionale_leitmedien', 'rp-be-fraktion_pilot', 'rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-partei_pilot', 'rp-be-person_pilot', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
delete from public.path_expected_levels where retrieval_path_id in ('rp-bb-ausschuesse', 'rp-bb-landesfraktionen', 'rp-bb-landesparlament', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-partei_pilot', 'rp-bb-plenum', 'rp-bb-regionale_leitmedien', 'rp-be-fraktion_pilot', 'rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-partei_pilot', 'rp-be-person_pilot', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
delete from public.package_paths where retrieval_path_id in ('rp-bb-ausschuesse', 'rp-bb-landesfraktionen', 'rp-bb-landesparlament', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-partei_pilot', 'rp-bb-plenum', 'rp-bb-regionale_leitmedien', 'rp-be-fraktion_pilot', 'rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-partei_pilot', 'rp-be-person_pilot', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
delete from public.retrieval_paths where id in ('rp-bb-ausschuesse', 'rp-bb-landesfraktionen', 'rp-bb-landesparlament', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-partei_pilot', 'rp-bb-plenum', 'rp-bb-regionale_leitmedien', 'rp-be-fraktion_pilot', 'rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-partei_pilot', 'rp-be-person_pilot', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
-- Herausgeber nur loeschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-berlin.de', 'publisher-brandenburg.de', 'publisher-dielinke-brandenburg.de', 'publisher-dielinke.berlin', 'publisher-landesregierung-brandenburg.de', 'publisher-landtag.brandenburg.de', 'publisher-linksfraktion.berlin', 'publisher-maz-online.de', 'publisher-parlament-berlin.de', 'publisher-parlamentsdokumentation.brandenburg.de', 'publisher-rbb24.de', 'publisher-stk.brandenburg.de', 'publisher-tagesspiegel.de', 'publisher-tobiasschulze.berlin')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('group-agh-linke', 'party-linke-berlin', 'party-linke-brandenburg', 'person-tobias-schulze')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
