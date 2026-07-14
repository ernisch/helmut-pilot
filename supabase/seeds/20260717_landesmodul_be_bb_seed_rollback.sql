-- Rollback des Landesmodul-PREPARED-Seeds (Berlin/Brandenburg). Loescht die eingefuegten
-- BE/BB-Abrufwege + Zuordnungen (eindeutige Ids). Herausgeber/Entitaeten werden GUARDED
-- geloescht: NUR wenn sie danach von KEINEM Abrufweg/Herausgeber mehr referenziert werden.
-- Das schuetzt bereits vorher vorhandene, geteilte Herausgeber (z. B. publisher-tagesspiegel.de,
-- von Bundeswegen referenziert) vor versehentlicher Loeschung (on delete cascade!).
-- Beruehrt KEINE Bundeswege und keine Basis-Daten.
begin;
delete from public.path_expected_geographies where retrieval_path_id in ('rp-be-landesparlament', 'rp-be-plenum', 'rp-be-landesregierung', 'rp-be-staatskanzlei', 'rp-be-landesfraktionen', 'rp-be-regionale_leitmedien', 'rp-rbb24-politik', 'rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot', 'rp-bb-landesparlament', 'rp-bb-plenum', 'rp-bb-ausschuesse', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-landesfraktionen', 'rp-bb-regionale_leitmedien', 'rp-bb-partei_pilot');
delete from public.path_expected_levels where retrieval_path_id in ('rp-be-landesparlament', 'rp-be-plenum', 'rp-be-landesregierung', 'rp-be-staatskanzlei', 'rp-be-landesfraktionen', 'rp-be-regionale_leitmedien', 'rp-rbb24-politik', 'rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot', 'rp-bb-landesparlament', 'rp-bb-plenum', 'rp-bb-ausschuesse', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-landesfraktionen', 'rp-bb-regionale_leitmedien', 'rp-bb-partei_pilot');
delete from public.package_paths where retrieval_path_id in ('rp-be-landesparlament', 'rp-be-plenum', 'rp-be-landesregierung', 'rp-be-staatskanzlei', 'rp-be-landesfraktionen', 'rp-be-regionale_leitmedien', 'rp-rbb24-politik', 'rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot', 'rp-bb-landesparlament', 'rp-bb-plenum', 'rp-bb-ausschuesse', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-landesfraktionen', 'rp-bb-regionale_leitmedien', 'rp-bb-partei_pilot');
delete from public.retrieval_paths where id in ('rp-be-landesparlament', 'rp-be-plenum', 'rp-be-landesregierung', 'rp-be-staatskanzlei', 'rp-be-landesfraktionen', 'rp-be-regionale_leitmedien', 'rp-rbb24-politik', 'rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot', 'rp-bb-landesparlament', 'rp-bb-plenum', 'rp-bb-ausschuesse', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-landesfraktionen', 'rp-bb-regionale_leitmedien', 'rp-bb-partei_pilot');
-- Herausgeber nur loeschen, wenn KEIN (auch kein Bundes-) Abrufweg sie mehr referenziert:
delete from public.publishers p where p.id in ('publisher-parlament-berlin.de', 'publisher-berlin.de', 'publisher-tagesspiegel.de', 'publisher-rbb24.de', 'publisher-dielinke.berlin', 'publisher-linksfraktion.berlin', 'publisher-tobiasschulze.berlin', 'publisher-landtag.brandenburg.de', 'publisher-parlamentsdokumentation.brandenburg.de', 'publisher-landesregierung-brandenburg.de', 'publisher-stk.brandenburg.de', 'publisher-brandenburg.de', 'publisher-maz-online.de', 'publisher-dielinke-brandenburg.de')
  and not exists (select 1 from public.retrieval_paths rp where rp.publisher_id = p.id);
-- Entitaeten nur loeschen, wenn KEIN Herausgeber sie mehr referenziert:
delete from public.political_entities e where e.id in ('party-linke-berlin', 'group-agh-linke', 'person-tobias-schulze', 'party-linke-brandenburg')
  and not exists (select 1 from public.publishers pu where pu.entity_id = e.id);
commit;
notify pgrst, 'reload schema';
