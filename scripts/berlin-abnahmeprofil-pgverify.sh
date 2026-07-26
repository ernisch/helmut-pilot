#!/bin/bash
# Helmut — Phase-1-Punkt 14B: die 4 committeten Abnahmeprofil-SQL-Dateien gegen ein ECHTES
# PostgreSQL ausführen.
# =============================================================================================
# WARUM ZUSÄTZLICH ZU DEN OFFLINE-TESTS: `scripts/berlin-abnahmeprofil-test.js` prüft die
# Bedingungen gegen eine Speicherdatenbank. Der Offline-Test kann NICHT beweisen, dass die
# `do $$ … raise exception … $$;`-Riegel gültiges PL/pgSQL sind, dass `raise exception` die
# Transaktion wirklich abbricht, dass `on conflict … do nothing` idempotent ist und dass die
# Fremdschlüssel-/CASCADE-Wirkung von `profiles` -> `mandate_profiles` stimmt. Genau das prüft
# dieses Skript — inklusive der beiden Fälle, die in Production teuer wären: ein fremder
# Datensatz unter derselben Id, und ein `delete`, an dem erzeugte Daten hängen.
#
# NICHT TEIL DER OFFLINE-SUITE (deshalb kein `*-test.js`-Name): es braucht ein lokales
# PostgreSQL. Der Runner `scripts/run-offline-tests.js` sammelt nur `scripts/*-test.js` ein.
#
# STRIKT LOKAL. Keine Production-Verbindung, keine Secrets, kein Netz, KEINE Personendaten:
# die Wegwerf-Datenbank enthält ausschließlich Testmandate ohne Klarnamen.
#
# Aufruf (Postgres läuft bereits):   PGHOST=… PGPORT=… PGUSER=… bash scripts/berlin-abnahmeprofil-pgverify.sh
# Aufruf (Cluster selbst starten):   bash scripts/berlin-abnahmeprofil-pgverify.sh --eigenes-cluster
#
# Exit 0 = alle Prüfungen grün · Exit 1 = mindestens eine rot · Exit 2 = kein PostgreSQL
# erreichbar (ehrlich „nicht prüfbar", nie ein grünes Ergebnis ohne Datenbank).

set -u
SEEDS="$(cd "$(dirname "$0")/.." && pwd)/supabase/seeds"
EIGENES_CLUSTER=0
[ "${1:-}" = "--eigenes-cluster" ] && EIGENES_CLUSTER=1

if [ "$EIGENES_CLUSTER" = "1" ]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  [ -z "$BIN" ] && { echo "NICHT PRÜFBAR: kein PostgreSQL-Server im System gefunden."; exit 2; }
  OWNER=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(id -un)")
  BASE=${PGVERIFY_BASE:-/var/lib/postgresql/helmut-profil-pgverify}
  rm -rf "$BASE"; mkdir -p "$BASE/data" "$BASE/sock" || { echo "NICHT PRÜFBAR: $BASE nicht anlegbar."; exit 2; }
  [ "$(id -u)" = "0" ] && chown -R "$OWNER" "$BASE"
  als() { if [ "$(id -u)" = "0" ]; then su "$OWNER" -s /bin/bash -c "$1"; else bash -c "$1"; fi; }
  als "$BIN/initdb -D $BASE/data -U pgverify --auth=trust" >/dev/null 2>&1 \
    || { echo "NICHT PRÜFBAR: initdb fehlgeschlagen."; exit 2; }
  als "$BIN/pg_ctl -D $BASE/data -o \"-k $BASE/sock -h '' -p 5434\" -l $BASE/data/log start" >/dev/null 2>&1
  for _ in $(seq 1 30); do "$BIN/pg_isready" -h "$BASE/sock" -p 5434 -U pgverify >/dev/null 2>&1 && break; done
  export PGHOST="$BASE/sock" PGPORT=5434 PGUSER=pgverify
  trap 'als "$BIN/pg_ctl -D $BASE/data stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"' EXIT
fi

export PGHOST=${PGHOST:-/var/run/postgresql} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres}
psql -d postgres -tAc "select 1" >/dev/null 2>&1 || {
  echo "NICHT PRÜFBAR: kein PostgreSQL erreichbar (PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER)."
  echo "Mit eigenem Wegwerf-Cluster: bash scripts/berlin-abnahmeprofil-pgverify.sh --eigenes-cluster"
  exit 2
}

DB=helmut_profil_pgverify
PSQL="psql -d $DB -v ON_ERROR_STOP=1 -q"
ANLEGEN=20260726_berlin_abnahmeprofil.sql
RB0=20260726_berlin_abnahmeprofil_rollback_stufe0.sql
RB1=20260726_berlin_abnahmeprofil_rollback_stufe1.sql
RB2=20260726_berlin_abnahmeprofil_rollback_stufe2.sql
ok=0; fail=0
pruef() { # name erwartet(ok|abbruch) datei
  local out rc
  out=$($PSQL -f "$SEEDS/$3" 2>&1); rc=$?
  if [ "$2" = "ok" ] && [ "$rc" -eq 0 ]; then ok=$((ok+1)); echo "PASS  $1"
  elif [ "$2" = "abbruch" ] && [ "$rc" -ne 0 ]; then
    ok=$((ok+1)); echo "PASS  $1  [$(echo "$out" | grep -oE '(FEHLER|ERROR):.*' | head -1 | cut -c1-105)]"
  else fail=$((fail+1)); echo "FAIL  $1  (rc=$rc) $(echo "$out" | head -3 | tr '\n' ' ' | cut -c1-200)"; fi
}
z() { $PSQL -tAc "$1" 2>/dev/null | tr -d ' '; }
erwarte() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 — ist=$2 soll=$3"; fi; }
bild() { echo "$(z "select coalesce(string_agg(id||'|'||name, ',' order by id), '-') from public.profiles;")##$(z "select coalesce(string_agg(user_id||'|'||coalesce(politische_ebene,'-')||'|'||coalesce(bundesland,'-')||'|'||aktiv||'|'||coalesce(geloescht_at::text,'-'), ',' order by user_id), '-') from public.mandate_profiles;")"; }

psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

# Schema wie in Production gemessen (pg_constraint, 2026-07-26): profiles.name NOT NULL,
# mandate_profiles.user_id FK -> profiles(id) ON DELETE CASCADE, politische_ebene- und
# onboarding_status-CHECK, Array-Spalten mit Default '{}'. Zusätzlich EINE abhängige Tabelle
# mit demselben CASCADE, um den Stufe-2-Riegel echt zu prüfen.
# Ausgangsbestand = der gemessene Production-Zustand: 2 Bundestagsmandate, 0 Landtagsmandate.
$PSQL <<'SQL' >/dev/null
create table public.profiles (
  id text primary key, email text, name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.mandate_profiles (
  user_id text primary key references public.profiles(id) on delete cascade,
  partei text, politische_ebene text, wahlkreis text, bundesland text,
  ausschuesse text[] not null default '{}', fachpolitische_schwerpunkte text[] not null default '{}',
  regionale_interessen text[] not null default '{}',
  aktiv boolean not null default true, geloescht_at timestamptz,
  onboarding_status text not null default 'neu',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint mandate_profiles_politische_ebene_check
    check (politische_ebene is null or politische_ebene in ('bundestag','landtag')),
  constraint mandate_profiles_onboarding_status_check
    check (onboarding_status in ('neu','in_bearbeitung','abgeschlossen')));
create table public.briefings (
  id bigserial primary key,
  user_id text references public.profiles(id) on delete cascade);
-- die uebrigen 13 CASCADE-Tabellen als Sicht-Attrappen, damit die Zaehlabfrage der Stufe 2
-- vollstaendig aufloest (gleiche Spalte, gleiche Semantik, leer).
create table public.communication_drafts (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.daily_tasks (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.decisions (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.interactions (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.matching_results (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.matching_weights (user_id text primary key references public.profiles(id) on delete cascade);
create table public.office_outputs (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.personalized_recommendations (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.political_items (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.priority_changes (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.profile_embeddings (user_id text primary key references public.profiles(id) on delete cascade);
create table public.topic_memory (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
create table public.user_notes (id bigserial primary key, user_id text references public.profiles(id) on delete cascade);
insert into public.profiles (id, name) values ('t-bund-1','Testmandat Bund 1'), ('t-bund-2','Testmandat Bund 2');
insert into public.mandate_profiles (user_id, politische_ebene, bundesland, partei, wahlkreis, fachpolitische_schwerpunkte)
values ('t-bund-1','bundestag','Berlin','Testpartei','Wahlkreis 1', array['Testthema']),
       ('t-bund-2','bundestag','Niedersachsen','Testpartei','Wahlkreis 2', array['Testthema']);
SQL

AUSGANG=$(bild)

echo "== A · Rueckwege ohne Profil brechen ab (fail-closed) =="
pruef "1 Rollback Stufe 0 ohne Profil bricht ab"              abbruch "$RB0"
pruef "2 Rollback Stufe 1 ohne Profil bricht ab"              abbruch "$RB1"
pruef "3 Rollback Stufe 2 ohne Profil bricht ab"              abbruch "$RB2"
erwarte "4 Nach 3 Abbruechen ist KEINE Zeile veraendert" "$(bild)" "$AUSGANG"

echo "== B · Anlegen =="
pruef "5 Abnahmeprofil anlegen laeuft"                        ok      "$ANLEGEN"
erwarte "6 Genau 1 profiles-Zeile mit Sollnamen" \
  "$(z "select count(*) from public.profiles where id='helmut-abnahme-berlin' and name='Testmandat Berlin (Helmut-Abnahme)';")" "1"
erwarte "7 Genau 1 aktives Berliner Landtagsmandat" \
  "$(z "select count(*) from public.mandate_profiles where politische_ebene='landtag' and lower(bundesland)='berlin' and aktiv and geloescht_at is null;")" "1"
erwarte "8 Keine E-Mail hinterlegt (Datenminimierung)" \
  "$(z "select count(*) from public.profiles where id='helmut-abnahme-berlin' and email is not null;")" "0"
erwarte "9 Partei bindet an kein Parteipaket" \
  "$(z "select partei from public.mandate_profiles where user_id='helmut-abnahme-berlin';")" "Fraktionslos"
erwarte "10 Die 2 Bestandsmandate sind unveraendert" \
  "$(z "select count(*) from public.mandate_profiles where user_id like 't-bund-%' and politische_ebene='bundestag' and aktiv;")" "2"
erwarte "11 0 Brandenburger Landtagsmandate" \
  "$(z "select count(*) from public.mandate_profiles where politische_ebene='landtag' and lower(bundesland)='brandenburg';")" "0"
pruef "12 Anlegen ist idempotent (2. Lauf)"                   ok      "$ANLEGEN"
erwarte "13 Weiterhin genau 1 Mandatszeile" \
  "$(z "select count(*) from public.mandate_profiles where user_id='helmut-abnahme-berlin';")" "1"

echo "== C · Fremder Datensatz unter derselben Id bricht ab, statt zu ueberschreiben =="
$PSQL -c "update public.profiles set name='Fremder Datensatz' where id='helmut-abnahme-berlin';" >/dev/null
pruef "14 Fremder Name unter der Abnahme-Id bricht ab"        abbruch "$ANLEGEN"
erwarte "15 Der fremde Name ist unveraendert (nichts ueberschrieben)" \
  "$(z "select name from public.profiles where id='helmut-abnahme-berlin';")" "FremderDatensatz"
$PSQL -c "update public.profiles set name='Testmandat Berlin (Helmut-Abnahme)' where id='helmut-abnahme-berlin';" >/dev/null
$PSQL -c "update public.mandate_profiles set bundesland='Hamburg' where user_id='helmut-abnahme-berlin';" >/dev/null
pruef "16 Abweichende Mandatszeile bricht ab"                 abbruch "$ANLEGEN"
erwarte "17 Die abweichende Zeile ist unveraendert" \
  "$(z "select bundesland from public.mandate_profiles where user_id='helmut-abnahme-berlin';")" "Hamburg"
$PSQL -c "update public.mandate_profiles set bundesland='Berlin' where user_id='helmut-abnahme-berlin';" >/dev/null

echo "== D · Ein zweites Landtagsmandat blockiert das Anlegen =="
$PSQL -c "insert into public.profiles (id,name) values ('t-bb-1','Testmandat Brandenburg');
          insert into public.mandate_profiles (user_id, politische_ebene, bundesland, partei, wahlkreis, fachpolitische_schwerpunkte)
          values ('t-bb-1','landtag','Brandenburg','Testpartei','Land', array['Testthema']);" >/dev/null
$PSQL -c "delete from public.profiles where id='helmut-abnahme-berlin';" >/dev/null
pruef "18 Anlegen bricht bei fremdem Landtagsmandat ab"       abbruch "$ANLEGEN"
erwarte "19 Es wurde nichts angelegt" \
  "$(z "select count(*) from public.profiles where id='helmut-abnahme-berlin';")" "0"
$PSQL -c "delete from public.profiles where id='t-bb-1';" >/dev/null
pruef "20 Ohne das fremde Mandat laeuft das Anlegen wieder"   ok      "$ANLEGEN"

echo "== E · Rueckweg Stufe 0 stoppt Berlin allein =="
pruef "21 Rollback Stufe 0 laeuft"                            ok      "$RB0"
erwarte "22 0 aktivierungsberechtigte Berliner Landtagsmandate" \
  "$(z "select count(*) from public.mandate_profiles where politische_ebene='landtag' and lower(bundesland)='berlin' and aktiv and geloescht_at is null;")" "0"
erwarte "23 Die Zeile existiert weiter (Auditspur)" \
  "$(z "select count(*) from public.mandate_profiles where user_id='helmut-abnahme-berlin';")" "1"
pruef "24 Rollback Stufe 0 ist idempotent"                    ok      "$RB0"
pruef "25 Rollback Stufe 2 ohne Stufe 1 bricht ab"            abbruch "$RB2"
pruef "26 Rollback Stufe 1 laeuft"                            ok      "$RB1"
erwarte "27 geloescht_at ist gesetzt" \
  "$(z "select count(*) from public.mandate_profiles where user_id='helmut-abnahme-berlin' and geloescht_at is not null;")" "1"
pruef "28 Rollback Stufe 1 ist idempotent"                    ok      "$RB1"

echo "== F · Stufe 2 schuetzt erzeugte Daten (ON DELETE CASCADE) =="
$PSQL -c "insert into public.briefings (user_id) values ('helmut-abnahme-berlin');" >/dev/null
pruef "29 Stufe 2 bricht bei anhaengenden Daten ab"           abbruch "$RB2"
erwarte "30 Das erzeugte Briefing existiert weiterhin" \
  "$(z "select count(*) from public.briefings where user_id='helmut-abnahme-berlin';")" "1"
$PSQL -c "delete from public.briefings where user_id='helmut-abnahme-berlin';" >/dev/null
pruef "31 Stufe 2 laeuft ohne anhaengende Daten"              ok      "$RB2"
erwarte "32 Ausgangszustand zeilengenau wiederhergestellt" "$(bild)" "$AUSGANG"
pruef "33 Stufe 2 ohne Profil bricht wieder ab (idempotent im Sinne von fail-closed)" abbruch "$RB2"
erwarte "34 Auch danach exakt der Ausgangszustand" "$(bild)" "$AUSGANG"

echo "== G · Keine der 4 Dateien beruehrt Quellen, Pakete oder Wege =="
erwarte "35 Keine Quellen-/Paket-/Wegtabelle in den 4 Dateien" \
  "$(grep -vE '^\s*--' "$SEEDS/$ANLEGEN" "$SEEDS/$RB0" "$SEEDS/$RB1" "$SEEDS/$RB2" | grep -ciE 'retrieval_paths|source_packages|package_paths|source_crawl_telemetry')" "0"
erwarte "36 Kein DDL in den 4 Dateien" \
  "$(grep -vE '^\s*--' "$SEEDS/$ANLEGEN" "$SEEDS/$RB0" "$SEEDS/$RB1" "$SEEDS/$RB2" | grep -ciE '\b(drop|truncate|alter|create)\b')" "0"

psql -d postgres -q -c "drop database if exists $DB;" >/dev/null 2>&1
echo
echo "== Ergebnis gegen echtes PostgreSQL: $ok PASS, $fail FAIL =="
[ "$fail" -gt 0 ] && exit 1
echo "Die Riegel sind gueltiges PL/pgSQL, brechen die Transaktion wirklich ab und lassen dabei 0"
echo "Zeilen veraendert. Anlegen ist idempotent, ueberschreibt keinen fremden Datensatz und legt"
echo "kein zweites Landtagsmandat an. Der Rueckweg Stufe 0 nimmt Berlin allein die Berechtigung."
echo "Production wurde nicht beruehrt."
exit 0
