-- Helmut — Berlin-Aktivierung · ROLLBACK Stufe 1 (nur Block B)
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14 NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Stoppt die Berliner Versorgung und lässt die Neutralisierung (Block A) bestehen.
-- SCHNELLER Weg ohne DB-Schreibzugriff: HELMUT_LANDESMODULE leeren (Stufe 0).
-- Bereits erzeugte Berliner Dokumente werden NICHT gelöscht (Audit-Spur bleibt).
--
-- Setzt ALLE 7 Wege des Berliner Basispakets zurück, nicht nur das aktuelle
-- Aktivierungsset — sonst bliebe ein von einer früheren Fassung aktivierter Weg stehen.
begin;
update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'
  where id in ('rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
update public.source_packages set status = 'prepared' where key = 'berlin-basis';
commit;
notify pgrst, 'reload schema';

-- Prüfung: 0 Zeilen erwartet.
-- select id, status, activation_mode from public.retrieval_paths where id in ('rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
