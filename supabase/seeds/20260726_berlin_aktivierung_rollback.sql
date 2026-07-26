-- Helmut — Berlin-Aktivierung · Schritt 7 von 8 · Rollback alle Stufen · Block B zurueck (Betriebs-Abbruch)
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Stoppt die Berliner Versorgung vollstaendig: alle Wege des Basispakets zurueck auf
-- needs_review/manual, Paket zurueck auf 'prepared'. Block A bleibt bestehen.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-landesfraktionen, rp-be-landesparlament, rp-be-landesregierung, rp-be-plenum, rp-be-regionale_leitmedien, rp-be-staatskanzlei, rp-rbb24-politik
-- Berührte Paketzuordnung (package_paths):    keine
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

commit;
notify pgrst, 'reload schema';
