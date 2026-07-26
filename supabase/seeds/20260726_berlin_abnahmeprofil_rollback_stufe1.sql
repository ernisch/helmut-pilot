-- Helmut — Berliner Abnahmeprofil · Schritt 3 von 4 · Rueckweg Stufe 1 · zusaetzlich als geloescht markieren
-- Generiert von scripts/generate-berlin-abnahmeprofil-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14B NICHT ausgeführt.
-- Einordnung: Schritt 5 der Reihenfolge in docs/betrieb/berlin-aktivierung.md §9 — nach
-- Block A (Neutralisierung), vor Block B1 (Paketstatus) und vor dem Freigabeflag.
--
-- Setzt zusaetzlich `geloescht_at`. Damit ist das Profil auch dann nicht mehr berechtigt, wenn
-- jemand `aktiv` wieder auf true setzt (isActivationEligible prueft geloescht_at unabhaengig
-- von validateProfile). Weiterhin ohne Datenverlust.
--
-- Mandats-Id (Testmandat, KEINE reale Person): helmut-abnahme-berlin
-- Berührte Tabellen:                           mandate_profiles
-- Berührte Abrufwege / Pakete / Zuordnungen:   keine
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin';
  if ist not in (1) then
    raise exception 'VORBEDINGUNG VERLETZT: Es gibt keine Mandatszeile unter dieser Id (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- Zusätzlich als gelöscht markieren: wirkt unabhängig von `aktiv` und von validateProfile.
update public.mandate_profiles
   set aktiv = false, geloescht_at = coalesce(geloescht_at, now()), updated_at = now()
  where user_id = 'helmut-abnahme-berlin';

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin' and mp.geloescht_at is not null;
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: geloescht_at ist nicht gesetzt (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin' and mp.aktiv = false;
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: Die Mandatszeile ist nicht deaktiviert (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            left join public.profiles p on p.id = mp.user_id
           where mp.politische_ebene = 'landtag'
             and lower(coalesce(mp.bundesland, '')) = 'berlin'
             and coalesce(mp.aktiv, true) and mp.geloescht_at is null
             and (coalesce(trim(mp.partei), '') <> '' or coalesce(trim(p.name), '') <> '')
             and (coalesce(trim(mp.wahlkreis), '') <> '' or coalesce(trim(mp.bundesland), '') <> '')
             and (array_length(mp.fachpolitische_schwerpunkte, 1) > 0 or array_length(mp.ausschuesse, 1) > 0);
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Es gibt weiterhin ein aktivierungsberechtigtes Berliner Landtagsmandat (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
