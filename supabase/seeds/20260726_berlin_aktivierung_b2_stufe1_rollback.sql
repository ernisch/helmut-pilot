-- Helmut — Berlin-Aktivierung · Schritt 5 von 8 · Rollback Stufe 1 · nur die 2 Direktfeeds
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Nimmt AUSSCHLIESSLICH Stufe 1 zurueck. Stufe 2 bleibt unveraendert gesperrt; Block A und der
-- Paketstatus bleiben bestehen.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-regionale_leitmedien, rp-rbb24-politik
-- Berührte Paketzuordnung (package_paths):    keine
-- Berührter Paketstatus (source_packages):    keiner
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 2 ist aktiv: zuerst 20260726_berlin_aktivierung_b2_stufe2_rollback.sql ausfuehren, oder 20260726_berlin_aktivierung_rollback.sql fuer alle Stufen (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- Setzt AUSSCHLIESSLICH die 2 Wege dieser Stufe zurück.
update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'
  where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik');

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 1 ist nicht vollstaendig zurueckgesetzt (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 2 ist nicht mehr gesperrt (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
