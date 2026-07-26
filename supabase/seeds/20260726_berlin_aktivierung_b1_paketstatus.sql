-- Helmut — Berlin-Aktivierung · Schritt 2 von 8 · Block B1 · Paketstatus berlin-basis prepared -> active
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Macht die Referenzzaehlung eines Berliner Landtagsprofils erst wirksam
-- (computeGlobalActivation). Schaltet KEINEN Abrufweg scharf.
--
-- Berührte Abrufwege (retrieval_paths):       keine
-- Berührte Paketzuordnung (package_paths):    keine
-- Berührter Paketstatus (source_packages):    berlin-basis
-- Danach: 20260726_berlin_aktivierung_b2_stufe1.sql
-- Rollback dieses Schritts: 20260726_berlin_aktivierung_rollback.sql
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
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Block A ist nicht ausgefuehrt — das Pflichtpaket ist nicht neutral (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist text;
begin
  select status into ist from public.source_packages where key = 'berlin-basis';
  if ist is null or ist not in ('prepared', 'active') then
    raise exception 'VORBEDINGUNG VERLETZT: Unerwarteter Paketstatus (erwartet prepared oder bereits active) (ist: %, erlaubt: prepared/active)', coalesce(ist, '<Paket fehlt>');
  end if;
end $$;

-- ---- MUTATION ----
-- Paketstatus: prepared -> active. Erst dadurch zählt die Referenz eines
-- Berliner Landtagsprofils (computeGlobalActivation).
update public.source_packages set status = 'active' where key = 'berlin-basis' and status = 'prepared';

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist text;
begin
  select status into ist from public.source_packages where key = 'berlin-basis';
  if ist is null or ist not in ('active') then
    raise exception 'NACHBEDINGUNG VERLETZT: Paketstatus ist nicht ''active'' (ist: %, erlaubt: active)', coalesce(ist, '<Paket fehlt>');
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
