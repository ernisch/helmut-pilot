#!/bin/bash
# Helmut — Phase-1-Punkt 14A: die 9 committeten Berlin-SQL-Dateien gegen ein ECHTES PostgreSQL
# ausführen.
# =============================================================================================
# WARUM ZUSÄTZLICH ZU DEN OFFLINE-TESTS: `scripts/berlin-staffelung-test.js` prüft die Staffelung
# gegen eine Speicherdatenbank und einen Mini-SQL-Ausführer. Der kann kein PL/pgSQL — er kann also
# NICHT beweisen, dass die `do $$ … raise exception … $$;`-Riegel syntaktisch gültig sind, dass
# `raise exception` die Transaktion wirklich abbricht und dass dabei tatsächlich 0 Zeilen geändert
# bleiben. Genau das prüft dieses Skript.
#
# NICHT TEIL DER OFFLINE-SUITE (deshalb kein `*-test.js`-Name): es braucht ein lokales PostgreSQL.
# Der Runner `scripts/run-offline-tests.js` sammelt nur `scripts/*-test.js` ein — dieses Skript
# bleibt damit bewusst außerhalb des CI-Gates und ist ein manuell reproduzierbarer Nachweis.
#
# STRIKT LOKAL. Keine Production-Verbindung, keine Secrets, kein Netz. Es legt eine eigene
# Wegwerf-Datenbank an, spielt den am 2026-07-26 gemessenen Production-Ist-Zustand ein und führt
# die committeten Dateien in der vorgesehenen Reihenfolge aus.
#
# Aufruf (Postgres läuft bereits):   PGHOST=… PGPORT=… PGUSER=… bash scripts/berlin-staffelung-pgverify.sh
# Aufruf (Cluster selbst starten):   bash scripts/berlin-staffelung-pgverify.sh --eigenes-cluster
#
# Exit 0 = alle Prüfungen grün · Exit 1 = mindestens eine Prüfung rot · Exit 2 = kein PostgreSQL
# erreichbar (ehrlich „nicht prüfbar", nie ein grünes Ergebnis ohne Datenbank).

set -u
SEEDS="$(cd "$(dirname "$0")/.." && pwd)/supabase/seeds"
EIGENES_CLUSTER=0
[ "${1:-}" = "--eigenes-cluster" ] && EIGENES_CLUSTER=1

if [ "$EIGENES_CLUSTER" = "1" ]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  [ -z "$BIN" ] && { echo "NICHT PRÜFBAR: kein PostgreSQL-Server im System gefunden."; exit 2; }
  # initdb verweigert den Dienst als root -> unprivilegierten Eigentümer benutzen.
  OWNER=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(id -un)")
  BASE=${PGVERIFY_BASE:-/var/lib/postgresql/helmut-pgverify}
  rm -rf "$BASE"; mkdir -p "$BASE/data" "$BASE/sock" || { echo "NICHT PRÜFBAR: $BASE nicht anlegbar."; exit 2; }
  [ "$(id -u)" = "0" ] && chown -R "$OWNER" "$BASE"
  als() { if [ "$(id -u)" = "0" ]; then su "$OWNER" -s /bin/bash -c "$1"; else bash -c "$1"; fi; }
  als "$BIN/initdb -D $BASE/data -U pgverify --auth=trust" >/dev/null 2>&1 \
    || { echo "NICHT PRÜFBAR: initdb fehlgeschlagen."; exit 2; }
  als "$BIN/pg_ctl -D $BASE/data -o \"-k $BASE/sock -h '' -p 5433\" -l $BASE/data/log start" >/dev/null 2>&1
  for _ in $(seq 1 30); do "$BIN/pg_isready" -h "$BASE/sock" -p 5433 -U pgverify >/dev/null 2>&1 && break; done
  export PGHOST="$BASE/sock" PGPORT=5433 PGUSER=pgverify
  trap 'als "$BIN/pg_ctl -D $BASE/data stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"' EXIT
fi

export PGHOST=${PGHOST:-/var/run/postgresql} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres}
psql -d postgres -tAc "select 1" >/dev/null 2>&1 || {
  echo "NICHT PRÜFBAR: kein PostgreSQL erreichbar (PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER)."
  echo "Mit eigenem Wegwerf-Cluster: bash scripts/berlin-staffelung-pgverify.sh --eigenes-cluster"
  exit 2
}

DB=helmut_berlin_pgverify
PSQL="psql -d $DB -v ON_ERROR_STOP=1 -q"
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
bild() { echo "$(z "select string_agg(id||'|'||status||'|'||activation_mode, ',' order by id) from public.retrieval_paths;")##$(z "select string_agg(package_id||'|'||retrieval_path_id, ',' order by package_id, retrieval_path_id) from public.package_paths;")##$(z "select string_agg(key||'|'||status, ',' order by key) from public.source_packages;")"; }

psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1

# Schema (nur die vier gelesenen/geschriebenen Tabellen) + gemessener Production-Ist 2026-07-26:
# alle 10 Berliner Wege needs_review/manual, berlin-basis 'prepared', die 3 Partei-/Fraktions-/
# Personenwege noch am Pflicht-Basispaket (Befund A-3). Keine Production-Daten, keine Identität.
$PSQL <<'SQL' >/dev/null
create table public.retrieval_paths (id text primary key, status text, activation_mode text);
create table public.source_packages (id text primary key, key text unique, status text);
create table public.package_paths (package_id text, retrieval_path_id text, primary key (package_id, retrieval_path_id));
create table public.source_crawl_telemetry (id bigserial primary key, run_id text, source_id text, status text);
insert into public.retrieval_paths (id, status, activation_mode) values
  ('rp-be-landesregierung','needs_review','manual'), ('rp-be-staatskanzlei','needs_review','manual'),
  ('rp-be-regionale_leitmedien','needs_review','manual'), ('rp-rbb24-politik','needs_review','manual'),
  ('rp-be-landesparlament','needs_review','manual'), ('rp-be-landesfraktionen','needs_review','manual'),
  ('rp-be-plenum','needs_review','manual'), ('rp-be-partei_pilot','needs_review','manual'),
  ('rp-be-fraktion_pilot','needs_review','manual'), ('rp-be-person_pilot','needs_review','manual'),
  ('rp-bb-landesregierung','needs_review','manual'), ('rp-bb-partei_pilot','needs_review','manual'),
  ('rp-bundestag','healthy','always_on'), ('rp-ausschuss-arbeit-soziales','healthy','auto');
insert into public.source_packages (id, key, status) values
  ('pkg-berlin-basis','berlin-basis','prepared'), ('pkg-die-linke-berlin','die-linke-berlin','prepared'),
  ('pkg-brandenburg-basis','brandenburg-basis','prepared'), ('pkg-bund-basis','bund-basis','active');
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-berlin-basis','rp-be-landesregierung'), ('pkg-berlin-basis','rp-be-staatskanzlei'),
  ('pkg-berlin-basis','rp-be-regionale_leitmedien'), ('pkg-berlin-basis','rp-rbb24-politik'),
  ('pkg-berlin-basis','rp-be-landesparlament'), ('pkg-berlin-basis','rp-be-landesfraktionen'),
  ('pkg-berlin-basis','rp-be-plenum'), ('pkg-berlin-basis','rp-be-partei_pilot'),
  ('pkg-berlin-basis','rp-be-fraktion_pilot'), ('pkg-berlin-basis','rp-be-person_pilot'),
  ('pkg-brandenburg-basis','rp-rbb24-politik'), ('pkg-brandenburg-basis','rp-bb-landesregierung'),
  ('pkg-bund-basis','rp-bundestag'), ('pkg-bund-basis','rp-ausschuss-arbeit-soziales');
SQL

AUSGANG=$(bild)

echo "== A · Reihenfolge und fail-closed Riegel gegen echtes PostgreSQL =="
pruef "1 Stillgelegte Sammeldatei bricht ab"                  abbruch 20260726_berlin_aktivierung.sql
pruef "2 Stufe 1 ohne Block A/B1 bricht ab"                   abbruch 20260726_berlin_aktivierung_b2_stufe1.sql
pruef "3 Stufe 2 ohne Stufe 1 bricht ab"                      abbruch 20260726_berlin_aktivierung_b2_stufe2.sql
pruef "4 Block B1 ohne Block A bricht ab"                     abbruch 20260726_berlin_aktivierung_b1_paketstatus.sql
erwarte "5 Nach 4 Abbrüchen ist KEINE Zeile verändert" "$(bild)" "$AUSGANG"
pruef "6 Block A läuft"                                       ok      20260726_berlin_aktivierung_a_neutralisierung.sql
erwarte "7 0 Partei-/Fraktions-/Personenwege am Pflichtpaket" \
  "$(z "select count(*) from public.package_paths where package_id='pkg-berlin-basis' and retrieval_path_id in ('rp-be-partei_pilot','rp-be-fraktion_pilot','rp-be-person_pilot');")" "0"
pruef "8 Block A ist idempotent"                              ok      20260726_berlin_aktivierung_a_neutralisierung.sql
pruef "9 Stufe 1 bricht weiter ab (Paket nicht active)"       abbruch 20260726_berlin_aktivierung_b2_stufe1.sql
pruef "10 Block B1 läuft jetzt"                               ok      20260726_berlin_aktivierung_b1_paketstatus.sql
pruef "11 Block B1 ist idempotent"                            ok      20260726_berlin_aktivierung_b1_paketstatus.sql
pruef "12 Stufe 2 bricht weiter ab (Stufe 1 fehlt)"           abbruch 20260726_berlin_aktivierung_b2_stufe2.sql
pruef "13 Stufe 1 läuft"                                      ok      20260726_berlin_aktivierung_b2_stufe1.sql
erwarte "14 Genau die 2 Stufe-1-Wege sind healthy/auto" \
  "$(z "select count(*) from public.retrieval_paths where status='healthy' and activation_mode='auto' and id in ('rp-be-regionale_leitmedien','rp-rbb24-politik');")" "2"
erwarte "15 Stufe 2 ist unverändert gesperrt" \
  "$(z "select count(*) from public.retrieval_paths where status='needs_review' and activation_mode='manual' and id in ('rp-be-landesregierung','rp-be-staatskanzlei');")" "2"
pruef "16 Stufe 2 bricht ohne Telemetriebeleg ab"             abbruch 20260726_berlin_aktivierung_b2_stufe2.sql
$PSQL -c "insert into public.source_crawl_telemetry (run_id, source_id, status) values ('r1','be-regionale_leitmedien','ok'),('r1','rbb24-politik','ok');" >/dev/null
pruef "17 EIN Lauf je Weg genügt nicht"                       abbruch 20260726_berlin_aktivierung_b2_stufe2.sql
$PSQL -c "insert into public.source_crawl_telemetry (run_id, source_id, status) values ('r2','be-regionale_leitmedien','ok'),('r2','rbb24-politik','ok');" >/dev/null
pruef "18 Mit 2 Läufen je Weg läuft Stufe 2"                  ok      20260726_berlin_aktivierung_b2_stufe2.sql
erwarte "19 Alle 4 Aktivierungswege sind healthy/auto" \
  "$(z "select count(*) from public.retrieval_paths where status='healthy' and activation_mode='auto' and id in ('rp-be-landesregierung','rp-be-staatskanzlei','rp-be-regionale_leitmedien','rp-rbb24-politik');")" "4"
erwarte "20 Kein Brandenburg-Weg verändert" \
  "$(z "select count(*) from public.retrieval_paths where id like 'rp-bb-%' and (status<>'needs_review' or activation_mode<>'manual');")" "0"
erwarte "21 brandenburg-basis unverändert prepared" "$(z "select status from public.source_packages where key='brandenburg-basis';")" "prepared"
erwarte "22 Kein Bundesweg verändert" \
  "$(z "select string_agg(id||'|'||status||'|'||activation_mode, ',' order by id) from public.retrieval_paths where id in ('rp-bundestag','rp-ausschuss-arbeit-soziales');")" \
  "rp-ausschuss-arbeit-soziales|healthy|auto,rp-bundestag|healthy|always_on"
erwarte "23 Partei-/Fraktions-/Personenwege nie aktiviert" \
  "$(z "select count(*) from public.retrieval_paths where id in ('rp-be-partei_pilot','rp-be-fraktion_pilot','rp-be-person_pilot') and (status<>'needs_review' or activation_mode<>'manual');")" "0"

echo "== B · Rollback je Stufe =="
pruef "24 Rollback Stufe 1 bricht bei aktiver Stufe 2 ab"     abbruch 20260726_berlin_aktivierung_b2_stufe1_rollback.sql
erwarte "25 Danach läuft Stufe 1 unverändert weiter" \
  "$(z "select count(*) from public.retrieval_paths where status='healthy' and activation_mode='auto' and id in ('rp-be-regionale_leitmedien','rp-rbb24-politik');")" "2"
pruef "26 Rollback Stufe 2 läuft"                             ok      20260726_berlin_aktivierung_b2_stufe2_rollback.sql
erwarte "27 Stufe 1 läuft dabei ausdrücklich weiter" \
  "$(z "select count(*) from public.retrieval_paths where status='healthy' and activation_mode='auto' and id in ('rp-be-regionale_leitmedien','rp-rbb24-politik');")" "2"
pruef "28 Rollback Stufe 1 läuft jetzt"                       ok      20260726_berlin_aktivierung_b2_stufe1_rollback.sql
erwarte "29 0 Berliner Wege aktiv" \
  "$(z "select count(*) from public.retrieval_paths where status='healthy' and activation_mode='auto' and id like 'rp-be-%';")" "0"
erwarte "30 Paketstatus von Rollback Stufe 1 unberührt" "$(z "select status from public.source_packages where key='berlin-basis';")" "active"

echo "== C · Vollständiger Rückweg =="
pruef "31 Rollback alle Stufen läuft"                         ok      20260726_berlin_aktivierung_rollback.sql
pruef "32 Rollback vollständig läuft"                         ok      20260726_berlin_aktivierung_rollback_vollstaendig.sql
erwarte "33 Ausgangszustand zeilengenau wiederhergestellt" "$(bild)" "$AUSGANG"
pruef "34 Rollback vollständig ist idempotent"                ok      20260726_berlin_aktivierung_rollback_vollstaendig.sql
erwarte "35 Auch danach exakt der Ausgangszustand" "$(bild)" "$AUSGANG"

psql -d postgres -q -c "drop database if exists $DB;" >/dev/null 2>&1
echo
echo "== Ergebnis gegen echtes PostgreSQL: $ok PASS, $fail FAIL =="
[ "$fail" -gt 0 ] && exit 1
echo "Die Riegel sind gültiges PL/pgSQL, brechen die Transaktion wirklich ab und lassen dabei 0 Zeilen"
echo "verändert. Stufe 2 ist ohne belegte Stufe 1 nicht ausführbar. Production wurde nicht berührt."
exit 0
