-- Helmut — Berlin-Aktivierung · ROLLBACK Stufe 2 (Block B + Block A)
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14 NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Stellt den Zustand VOR der Aktivierung vollständig wieder her — inklusive des
-- Befunds A-3 (Partei-/Fraktions-/Personenwege am Pflicht-Basispaket). Nur nutzen,
-- wenn die Umhängung selbst Schaden angerichtet hat; sonst genügt Stufe 1.
begin;
-- B rückwärts:
update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'
  where id in ('rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
update public.source_packages set status = 'prepared' where key = 'berlin-basis';
-- A rückwärts:
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-berlin-basis', 'rp-be-partei_pilot'),
  ('pkg-berlin-basis', 'rp-be-fraktion_pilot'),
  ('pkg-berlin-basis', 'rp-be-person_pilot')
on conflict (package_id, retrieval_path_id) do nothing;
delete from public.package_paths where package_id = 'pkg-die-linke-berlin'
  and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');
commit;
notify pgrst, 'reload schema';
