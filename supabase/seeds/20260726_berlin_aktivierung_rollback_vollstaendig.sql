-- Helmut — Berlin-Aktivierung · Schritt 8 von 8 · Rollback vollstaendig · Block B UND Block A zurueck
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Stellt den gemessenen Ausgangszustand vom 2026-07-26 wieder her — inklusive des Befunds A-3.
-- Nur wenn die Umhaengung selbst Schaden angerichtet hat.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-landesfraktionen, rp-be-landesparlament, rp-be-landesregierung, rp-be-plenum, rp-be-regionale_leitmedien, rp-be-staatskanzlei, rp-rbb24-politik
-- Berührte Paketzuordnung (package_paths):    pkg-berlin-basis, pkg-die-linke-berlin
-- Berührter Paketstatus (source_packages):    berlin-basis
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- MUTATION ----
-- Setzt ALLE 7 Wege des Berliner Basispakets zurück, nicht nur das aktuelle
-- Aktivierungsset — sonst bliebe ein von einer früheren Fassung aktivierter Weg stehen.
update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'
  where id in ('rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik');
update public.source_packages set status = 'prepared' where key = 'berlin-basis';
-- Block A rückwärts (stellt den Befund A-3 wieder her):
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-berlin-basis', 'rp-be-partei_pilot'),
  ('pkg-berlin-basis', 'rp-be-fraktion_pilot'),
  ('pkg-berlin-basis', 'rp-be-person_pilot')
on conflict (package_id, retrieval_path_id) do nothing;
delete from public.package_paths where package_id = 'pkg-die-linke-berlin'
  and retrieval_path_id in ('rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot');

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesfraktionen', 'rp-be-landesparlament', 'rp-be-landesregierung', 'rp-be-plenum', 'rp-be-regionale_leitmedien', 'rp-be-staatskanzlei', 'rp-rbb24-politik')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (7) then
    raise exception 'NACHBEDINGUNG VERLETZT: Es ist noch ein Weg des Basispakets aktiv (needs_review/manual ist: %, erlaubt: 7)', ist;
  end if;
end $$;

do $$
declare ist text;
begin
  select status into ist from public.source_packages where key = 'berlin-basis';
  if ist is null or ist not in ('prepared') then
    raise exception 'NACHBEDINGUNG VERLETZT: Paketstatus ist nicht zurueck auf ''prepared'' (ist: %, erlaubt: prepared)', coalesce(ist, '<Paket fehlt>');
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-berlin-basis' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (3) then
    raise exception 'NACHBEDINGUNG VERLETZT: Die 3 Wege haengen nicht wieder am Basispaket (ist: %, erlaubt: 3)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.package_paths
   where package_id = 'pkg-die-linke-berlin' and retrieval_path_id in ('rp-be-fraktion_pilot', 'rp-be-partei_pilot', 'rp-be-person_pilot');
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Das Parteipaket traegt die 3 Wege noch (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
