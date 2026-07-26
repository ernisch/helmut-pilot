-- Helmut — Berlin-Aktivierung · Schritt 6 von 8 · Rollback Stufe 2 · nur die 2 Google-News-Wege
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Nimmt AUSSCHLIESSLICH Stufe 2 zurueck und laesst Stufe 1 ausdruecklich laufen (Rueckfall auf
-- den bewiesenen Zustand nach Stufe 1). Jederzeit ausfuehrbar.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-landesregierung, rp-be-staatskanzlei
-- Berührte Paketzuordnung (package_paths):    keine
-- Berührter Paketstatus (source_packages):    keiner
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- MUTATION ----
-- Setzt AUSSCHLIESSLICH die 2 Wege dieser Stufe zurück.
update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'
  where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei');

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 2 ist nicht vollstaendig zurueckgesetzt (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
