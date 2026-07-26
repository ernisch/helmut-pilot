-- Helmut — Berliner Abnahmeprofil · Schritt 1 von 4 · Abnahmeprofil anlegen (zwei Zeilen, eine Transaktion)
-- Generiert von scripts/generate-berlin-abnahmeprofil-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14B NICHT ausgeführt.
-- Einordnung: Schritt 5 der Reihenfolge in docs/betrieb/berlin-aktivierung.md §9 — nach
-- Block A (Neutralisierung), vor Block B1 (Paketstatus) und vor dem Freigabeflag.
--
-- Legt das Berliner Landtags-Testmandat an. Erst dadurch zaehlt die Referenz auf Berlin; ohne
-- dieses Profil aktiviert HELMUT_LANDESMODULE=berlin nachweislich 0 Wege (Befund aus dem 2.
-- Production-Anlauf). Schaltet KEINEN Abrufweg scharf und setzt KEIN Flag.
--
-- Mandats-Id (Testmandat, KEINE reale Person): helmut-abnahme-berlin
-- Berührte Tabellen:                           profiles, mandate_profiles
-- Berührte Abrufwege / Pakete / Zuordnungen:   keine
-- Danach: 20260726_berlin_aktivierung_b1_paketstatus.sql
-- Rollback dieses Schritts: 20260726_berlin_abnahmeprofil_rollback_stufe0.sql
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.profiles p where p.id = 'helmut-abnahme-berlin' and p.name is distinct from 'Testmandat Berlin (Helmut-Abnahme)';
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Unter dieser Id existiert bereits ein FREMDER Datensatz — Abbruch statt Ueberschreiben (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            where mp.user_id = 'helmut-abnahme-berlin'
              and not coalesce(mp.politische_ebene = 'landtag'
                and mp.bundesland = 'Berlin'
                and mp.partei = 'Fraktionslos'
                and mp.wahlkreis = 'Berlin (Landesebene, Abnahmeprofil)'
                and mp.fachpolitische_schwerpunkte = array['Landespolitik Berlin']::text[]
                and mp.regionale_interessen = array['Berlin']::text[], false);
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Unter dieser Id existiert bereits eine abweichende Mandatszeile — Abbruch statt Ueberschreiben (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            where mp.user_id <> 'helmut-abnahme-berlin'
              and mp.politische_ebene = 'landtag'
              and coalesce(mp.aktiv, true) and mp.geloescht_at is null;
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Es gibt bereits ein anderes aktives Landtagsprofil — der Rueckweg ''Profil deaktivieren'' waere dann nicht mehr allein hinreichend, um Berlin zu stoppen (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            where mp.user_id <> 'helmut-abnahme-berlin'
              and mp.politische_ebene = 'landtag'
              and coalesce(mp.aktiv, true) and mp.geloescht_at is null
              and lower(coalesce(mp.bundesland, '')) = 'brandenburg';
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Es existiert ein Brandenburger Landtagsmandat — Brandenburg wuerde dadurch bemandatiert (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- P1) profiles-Zeile: liefert `fullName` (Befund P-2). Ohne sie bliebe der Radar stumm.
--     `do nothing` ist hier sicher, weil die Vorbedingung einen fremden Datensatz
--     unter dieser Id bereits ausgeschlossen hat.
insert into public.profiles (id, name) values
  ('helmut-abnahme-berlin', 'Testmandat Berlin (Helmut-Abnahme)')
on conflict (id) do nothing;

-- P2) mandate_profiles-Zeile: `politische_ebene='landtag'` + `bundesland='Berlin'`
--     erzeugen die Referenz auf berlin-basis. `partei='Fraktionslos'` bindet das
--     Testmandat an KEIN Parteipaket. Keine E-Mail, kein Klarname, keine reale Person.
insert into public.mandate_profiles
  (user_id, politische_ebene, bundesland, partei, wahlkreis,
   fachpolitische_schwerpunkte, regionale_interessen, aktiv, onboarding_status) values
  ('helmut-abnahme-berlin', 'landtag', 'Berlin', 'Fraktionslos', 'Berlin (Landesebene, Abnahmeprofil)',
   array['Landespolitik Berlin']::text[], array['Berlin']::text[], true, 'neu')
on conflict (user_id) do nothing;

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.profiles p where p.id = 'helmut-abnahme-berlin' and p.name = 'Testmandat Berlin (Helmut-Abnahme)';
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: profiles-Zeile fehlt oder traegt nicht den Sollnamen (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            where mp.user_id = 'helmut-abnahme-berlin'
              and mp.politische_ebene = 'landtag'
                and mp.bundesland = 'Berlin'
                and mp.partei = 'Fraktionslos'
                and mp.wahlkreis = 'Berlin (Landesebene, Abnahmeprofil)'
                and mp.fachpolitische_schwerpunkte = array['Landespolitik Berlin']::text[]
                and mp.regionale_interessen = array['Berlin']::text[];
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: mandate_profiles-Zeile fehlt oder traegt nicht alle Sollfelder (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin' and coalesce(mp.aktiv, true) and mp.geloescht_at is null;
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: Die Mandatszeile ist nicht aktiv (aktiv=false oder geloescht) (ist: %, erlaubt: 1)', ist;
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
  if ist not in (1) then
    raise exception 'NACHBEDINGUNG VERLETZT: Genau EIN aktivierungsberechtigtes Berliner Landtagsmandat erwartet (Befund P-1: Zeilen zaehlen genuegt nicht) (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp
            where mp.user_id <> 'helmut-abnahme-berlin'
              and mp.politische_ebene = 'landtag'
              and coalesce(mp.aktiv, true) and mp.geloescht_at is null
              and lower(coalesce(mp.bundesland, '')) = 'brandenburg';
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Brandenburg ist nach dem Schritt bemandatiert (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
