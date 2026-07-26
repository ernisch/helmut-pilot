-- Helmut — Berlin-Aktivierung · Schritt 3 von 8 · Stufe 1 · 2 Direktfeeds scharfschalten
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Direktfeeds (Tagesspiegel, rbb24) — 0 Google-Requests, beide juengstes Item 0 Tage.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-regionale_leitmedien, rp-rbb24-politik
-- Berührte Paketzuordnung (package_paths):    keine
-- Berührter Paketstatus (source_packages):    keiner
-- Danach: 20260726_berlin_aktivierung_b2_stufe2.sql — aber erst nach einem vollen Crawl-Zyklus (mind. 2 Laeufe) ohne neue Fehler
-- Rollback dieses Schritts: 20260726_berlin_aktivierung_b2_stufe1_rollback.sql
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
    raise exception 'VORBEDINGUNG VERLETZT: Block A ist nicht ausgefuehrt (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist text;
begin
  select status into ist from public.source_packages where key = 'berlin-basis';
  if ist is null or ist not in ('active') then
    raise exception 'VORBEDINGUNG VERLETZT: Block B1 ist nicht ausgefuehrt (Paket nicht ''active'') (ist: %, erlaubt: active)', coalesce(ist, '<Paket fehlt>');
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 2 ist nicht mehr vollstaendig gesperrt — die Reihenfolge waere vertauscht (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- Genau 2 Wege dieser Stufe scharfschalten. Kein Weg einer anderen Stufe
-- wird hier genannt — die Trennung ist die Datei, nicht ein Kommentar.
update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'
  where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
    and status = 'needs_review' and activation_mode = 'manual';

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
     and status = 'healthy' and activation_mode = 'auto';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 1 ist nur teilweise aktiv (Teilausfuehrung) (healthy/auto ist: %, erlaubt: 2)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'needs_review' and activation_mode = 'manual';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 2 wurde mitaktiviert — genau das darf nie passieren (needs_review/manual ist: %, erlaubt: 2)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
