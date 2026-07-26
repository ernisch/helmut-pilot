-- Helmut — Berlin-Aktivierung · Schritt 4 von 8 · Stufe 2 · 2 Google-News-Wege scharfschalten
-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.
-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): V1-neutralisierung · V2-live-verifikation · V3-landtagsprofil · V4-freigabeflag · V5-paketstatus · V6-sicherung
--
-- Amtliche Ebene ueber Google News — bringt die Google-Last, deshalb nach Stufe 1.
--
-- Berührte Abrufwege (retrieval_paths):       rp-be-landesregierung, rp-be-staatskanzlei
-- Berührte Paketzuordnung (package_paths):    keine
-- Berührter Paketstatus (source_packages):    keiner
-- Rollback dieses Schritts: 20260726_berlin_aktivierung_b2_stufe2_rollback.sql
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist text;
begin
  select status into ist from public.source_packages where key = 'berlin-basis';
  if ist is null or ist not in ('active') then
    raise exception 'VORBEDINGUNG VERLETZT: Paket ist nicht ''active'' (ist: %, erlaubt: active)', coalesce(ist, '<Paket fehlt>');
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
     and status = 'healthy' and activation_mode = 'auto';
  if ist not in (2) then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 1 ist nicht vollstaendig aktiv — Stufe 2 darf nur nach erfolgreicher Stufe 1 laufen (healthy/auto ist: %, erlaubt: 2)', ist;
  end if;
end $$;

do $$
declare fehlend text;
begin
  select string_agg(x.quelle || '=' || x.laeufe, ', ' order by x.quelle) into fehlend from (
    select s.quelle, (select count(distinct t.run_id) from public.source_crawl_telemetry t
             where t.source_id = s.quelle and t.status = 'ok') as laeufe
      from (values ('be-regionale_leitmedien'), ('rbb24-politik')) as s(quelle)
  ) x where x.laeufe < 2;
  if fehlend is not null then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 1 ist nicht belegt gelaufen: je Weg mindestens 2 erfolgreiche Crawl-Laeufe (source_crawl_telemetry, status=''ok'') sind Voraussetzung — nach einem vollen Crawl-Zyklus (mind. 2 Laeufe) ohne neue Fehler (Laeufe je Quelle: %)', fehlend;
  end if;
end $$;

-- ---- MUTATION ----
-- Genau 2 Wege dieser Stufe scharfschalten. Kein Weg einer anderen Stufe
-- wird hier genannt — die Trennung ist die Datei, nicht ein Kommentar.
update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'
  where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
    and status = 'needs_review' and activation_mode = 'manual';

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-landesregierung', 'rp-be-staatskanzlei')
     and status = 'healthy' and activation_mode = 'auto';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 2 ist nur teilweise aktiv (Teilausfuehrung) (healthy/auto ist: %, erlaubt: 2)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.retrieval_paths
   where id in ('rp-be-regionale_leitmedien', 'rp-rbb24-politik')
     and status = 'healthy' and activation_mode = 'auto';
  if ist not in (2) then
    raise exception 'NACHBEDINGUNG VERLETZT: Stufe 1 wurde durch Stufe 2 veraendert (healthy/auto ist: %, erlaubt: 2)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
