-- Helmut — Berlin-Aktivierung · Schritt 1 von 8 · Block A · Neutralisierung von berlin-basis
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Die 3 Partei-/Fraktions-/Personenwege vom is_base-Pflichtpaket an das optionale Parteipaket
-- umhaengen (P0-2 / Befund A-3). Aktiviert NICHTS.
--
-- Berührte Abrufwege (retrieval_paths):       keine
-- Berührte Paketzuordnung (package_paths):    pkg-berlin-basis, pkg-die-linke-berlin
-- Berührter Paketstatus (source_packages):    keiner
-- Danach: 20260726_berlin_aktivierung_b1_paketstatus.sql
-- Rollback dieses Schritts: 20260726_berlin_aktivierung_rollback_vollstaendig.sql
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-berlin-basis' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (0, 3) then
    raise exception 'VORBEDINGUNG VERLETZT: Teilzuordnung am Pflicht-Basispaket: erwartet 3 (Ausgangszustand) oder 0 (bereits umgehaengt) (ist: %, erlaubt: 0/3)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-die-linke-berlin' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (0, 3) then
    raise exception 'VORBEDINGUNG VERLETZT: Teilzuordnung am Parteipaket: erwartet 0 (Ausgangszustand) oder 3 (bereits umgehaengt) (ist: %, erlaubt: 0/3)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- A1) Zielzuordnung anlegen (idempotent).
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-die-linke-berlin', 'rp-be-partei_pilot'),
  ('pkg-die-linke-berlin', 'rp-be-fraktion_pilot'),
  ('pkg-die-linke-berlin', 'rp-be-person_pilot')
on conflict (package_id, retrieval_path_id) do nothing;

-- A2) Alte Zuordnung am Pflicht-Basispaket entfernen (eng begrenzt auf diese 3 Wege).
delete from public.package_paths where package_id = 'pkg-berlin-basis'
  and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-berlin-basis' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Pflicht-Basispaket traegt weiterhin Partei-/Fraktions-/Personenwege (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-die-linke-berlin' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (3) then
    raise exception 'NACHBEDINGUNG VERLETZT: Parteipaket hat nicht alle 3 Wege uebernommen (ist: %, erlaubt: 3)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
