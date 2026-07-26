-- Helmut — Berlin-Aktivierung (Phase-1-Punkt 14)
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14 NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Block A: Neutralisierung von berlin-basis (P0-2 / Befund A-3).
-- Block B: Aktivierung von berlin-basis + 4 Abrufwegen.

-- ============================ BLOCK A · NEUTRALISIERUNG ============================
-- Vorher (erwartet 3 Zeilen), nachher (erwartet 0 Zeilen):
--   select retrieval_path_id from public.package_paths where package_id = 'pkg-berlin-basis'
--     and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');
begin;

-- A1) Zielzuordnung anlegen (idempotent).
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-die-linke-berlin', 'rp-be-partei_pilot'),
  ('pkg-die-linke-berlin', 'rp-be-fraktion_pilot'),
  ('pkg-die-linke-berlin', 'rp-be-person_pilot')
on conflict (package_id, retrieval_path_id) do nothing;

-- A2) Alte Zuordnung am Pflicht-Basispaket entfernen (eng begrenzt auf diese 3 Wege).
delete from public.package_paths where package_id = 'pkg-berlin-basis'
  and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');

commit;

-- ============================ BLOCK B · AKTIVIERUNG ===============================
-- Erst ausführen, wenn Block A verifiziert ist und alle Voraussetzungen erfüllt sind.
begin;

-- B1) Paketstatus: prepared -> active. Erst dadurch zählt die Referenz eines
--     Berliner Landtagsprofils (computeGlobalActivation).
update public.source_packages set status = 'active' where key = 'berlin-basis' and status = 'prepared';

-- B2) Die 4 liefernden Abrufwege scharfschalten — GESTAFFELT.
--     ALLE anderen Berliner Wege bleiben unverändert (needs_review + manual):
--     rp-be-plenum (PARDOK, strukturell 0 Items), rp-be-landesparlament und
--     rp-be-landesfraktionen (bei der Neuverifikation 2026-07-26 veraltet) sowie die
--     3 Wege aus Block A.
--
--     WICHTIG: die Stufen sind EINZELN auszuführen, nicht zusammen. Zwischen Stufe 1
--     und Stufe 2 liegt mindestens ein vollständiger Crawl-Zyklus.

-- B2.1) Direktfeeds (Tagesspiegel, rbb24) — 0 Google-Requests, beide juengstes Item 0 Tage.
--       Weiter zur nächsten Stufe erst nach einem vollen Crawl-Zyklus (mind. 2 Laeufe) ohne neue Fehler.
update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'
  where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
    and status = 'needs_review' and activation_mode = 'manual';

-- B2.2) Amtliche Ebene ueber Google News — bringt die Google-Last, deshalb nach Stufe 1.
update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'
  where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
    and status = 'needs_review' and activation_mode = 'manual';

commit;
notify pgrst, 'reload schema';

-- ============================ SELBSTPRÜFUNG (read-only) ===========================
-- 1) genau 4 aktive Berliner Wege:
--    select count(*) from public.retrieval_paths where id in ('rp-be-landesregierung', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik')
--      and status = 'healthy' and activation_mode = 'auto';
-- 2) 0 Partei-/Fraktions-/Personenwege im Pflicht-Basispaket:
--    select count(*) from public.package_paths where package_id = 'pkg-berlin-basis'
--      and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');
-- 3) 0 aktive Brandenburg-Wege (Nachweis der Nicht-Berührung):
--    select count(*) from public.retrieval_paths where id like 'rp-bb-%'
--      and (status <> 'needs_review' or activation_mode <> 'manual');
-- 4) brandenburg-basis unverändert 'prepared':
--    select status from public.source_packages where key = 'brandenburg-basis';
