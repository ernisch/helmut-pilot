-- Helmut — Berliner Abnahmeprofil · Schritt 4 von 4 · Rueckweg Stufe 2 · Zeilen entfernen (NUR nach Stufe 0/1, NUR ohne erzeugte Daten)
-- Generiert von scripts/generate-berlin-abnahmeprofil-sql.js. NICHT von Hand editieren.
-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14B NICHT ausgeführt.
-- Einordnung: Schritt 5 der Reihenfolge in docs/betrieb/berlin-aktivierung.md §9 — nach
-- Block A (Neutralisierung), vor Block B1 (Paketstatus) und vor dem Freigabeflag.
--
-- Entfernt beide Zeilen vollstaendig. `profiles` traegt ON DELETE CASCADE auf 14 weitere
-- Tabellen — ein Loeschen erzeugt also keine Waisen, sondern LOESCHT erzeugte Daten mit.
-- Deshalb bricht die Datei ab, sobald auch nur eine abhaengige Zeile existiert. Fuer den
-- Regelfall genuegt Stufe 0.
--
-- Mandats-Id (Testmandat, KEINE reale Person): helmut-abnahme-berlin
-- Berührte Tabellen:                           mandate_profiles, profiles
-- Berührte Abrufwege / Pakete / Zuordnungen:   keine
--
-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese
-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.

begin;

-- ---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin' and mp.aktiv = false;
  if ist not in (1) then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 0 wurde nicht ausgefuehrt — erst deaktivieren, dann loeschen (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin' and mp.geloescht_at is not null;
  if ist not in (1) then
    raise exception 'VORBEDINGUNG VERLETZT: Stufe 1 wurde nicht ausgefuehrt — erst als geloescht markieren, dann loeschen (ist: %, erlaubt: 1)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select 0
             + (select count(*) from public.briefings t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.communication_drafts t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.daily_tasks t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.decisions t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.interactions t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.matching_results t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.matching_weights t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.office_outputs t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.personalized_recommendations t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.political_items t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.priority_changes t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.profile_embeddings t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.topic_memory t where t.user_id = 'helmut-abnahme-berlin')
             + (select count(*) from public.user_notes t where t.user_id = 'helmut-abnahme-berlin')
            into ist;
  if ist not in (0) then
    raise exception 'VORBEDINGUNG VERLETZT: Es haengen erzeugte Daten an diesem Profil; ein delete wuerde sie per ON DELETE CASCADE mitloeschen (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

-- ---- MUTATION ----
-- Reihenfolge: Kind vor Eltern. Der zweite `delete` würde die erste Zeile ohnehin per
-- ON DELETE CASCADE mitnehmen — ausgeschrieben, damit die Wirkung sichtbar ist.
delete from public.mandate_profiles where user_id = 'helmut-abnahme-berlin';
delete from public.profiles where id = 'helmut-abnahme-berlin';

-- ---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----
do $$
declare ist int;
begin
  select count(*) into ist from public.mandate_profiles mp where mp.user_id = 'helmut-abnahme-berlin';
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Die Mandatszeile existiert weiterhin (ist: %, erlaubt: 0)', ist;
  end if;
end $$;

do $$
declare ist int;
begin
  select count(*) into ist from public.profiles p where p.id = 'helmut-abnahme-berlin';
  if ist not in (0) then
    raise exception 'NACHBEDINGUNG VERLETZT: Die profiles-Zeile existiert weiterhin (ist: %, erlaubt: 0)', ist;
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
