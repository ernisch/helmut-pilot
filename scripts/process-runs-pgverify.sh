#!/bin/bash
# Helmut — W-2 (Werkzeug-Härtung): die Migration 20260727_process_runs_relational.sql
# gegen ein ECHTES PostgreSQL ausführen.
# =============================================================================================
# WARUM ZUSÄTZLICH ZU DEN OFFLINE-TESTS: `scripts/prozesslauf-telemetrie-test.js` prüft die
# Upsert-/Idempotenz-Semantik gegen eine Speicher-Attrappe. Nur ein echtes PostgreSQL beweist,
# dass die Migration gültiges SQL ist, dass der Primärschlüssel (run_id, process) Duplikate
# wirklich verhindert, dass `on conflict … do update` (der PostgREST-merge-duplicates-Pfad)
# genau EINE Zeile hinterlässt, dass der CHECK-Constraint unbekannte Zustände hart abweist
# und dass Rollback + erneutes Anwenden idempotent sind.
#
# NICHT TEIL DER OFFLINE-SUITE (deshalb kein `*-test.js`-Name): braucht ein lokales
# PostgreSQL. STRIKT LOKAL: keine Production-Verbindung, keine Secrets, keine Personendaten.
#
# Aufruf (Postgres läuft bereits):   PGHOST=… PGPORT=… PGUSER=… bash scripts/process-runs-pgverify.sh
# Aufruf (Cluster selbst starten):   bash scripts/process-runs-pgverify.sh --eigenes-cluster
#
# Exit 0 = alle Prüfungen grün · Exit 1 = mindestens eine rot · Exit 2 = kein PostgreSQL
# erreichbar (ehrlich „nicht prüfbar", nie ein grünes Ergebnis ohne Datenbank).

set -u
MIGRATIONEN="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
MIGRATION="$MIGRATIONEN/20260727_process_runs_relational.sql"
ROLLBACK="$MIGRATIONEN/20260727_process_runs_relational_rollback.sql"
EIGENES_CLUSTER=0
[ "${1:-}" = "--eigenes-cluster" ] && EIGENES_CLUSTER=1

PSQL="psql"
STOPPEN=""
if [ "$EIGENES_CLUSTER" = "1" ]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  [ -z "$BIN" ] && { echo "NICHT PRÜFBAR: kein PostgreSQL-Server im System gefunden."; exit 2; }
  OWNER=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(id -un)")
  BASE=${PGVERIFY_BASE:-/tmp/helmut-process-runs-pgverify}
  rm -rf "$BASE"; mkdir -p "$BASE/data" "$BASE/sock" || { echo "NICHT PRÜFBAR: $BASE nicht anlegbar."; exit 2; }
  [ "$(id -u)" = "0" ] && chown -R "$OWNER" "$BASE"
  als() { if [ "$(id -u)" = "0" ]; then su "$OWNER" -s /bin/bash -c "$1"; else bash -c "$1"; fi; }
  als "$BIN/initdb -D $BASE/data -U pgverify --auth=trust" >/dev/null 2>&1 \
    || { echo "NICHT PRÜFBAR: initdb fehlgeschlagen."; exit 2; }
  als "$BIN/pg_ctl -D $BASE/data -o \"-k $BASE/sock -h '' -p 5435\" -l $BASE/data/log start" >/dev/null 2>&1 \
    || { echo "NICHT PRÜFBAR: pg_ctl start fehlgeschlagen."; exit 2; }
  STOPPEN="als \"$BIN/pg_ctl -D $BASE/data stop -m fast\" >/dev/null 2>&1"
  PSQL="$BIN/psql -h $BASE/sock -p 5435 -U pgverify -d postgres"
fi

$PSQL -c "select 1" >/dev/null 2>&1 || { echo "NICHT PRÜFBAR: PostgreSQL nicht erreichbar."; [ -n "$STOPPEN" ] && eval "$STOPPEN"; exit 2; }

GRUEN=0; ROT=0
pruefe() { # pruefe <name> <erwartet> <sql>
  local IST
  IST=$($PSQL -tA -c "$3" 2>&1)
  if [ "$IST" = "$2" ]; then GRUEN=$((GRUEN+1)); echo "PASS  $1"
  else ROT=$((ROT+1)); echo "FAIL  $1  — erwartet '$2', bekommen '$IST'"; fi
}
pruefe_fehler() { # pruefe_fehler <name> <sql> — SQL MUSS scheitern
  if $PSQL -c "$2" >/dev/null 2>&1; then ROT=$((ROT+1)); echo "FAIL  $1  — SQL lief durch, sollte scheitern"
  else GRUEN=$((GRUEN+1)); echo "PASS  $1"; fi
}

# 1. Migration anwenden + idempotent erneut anwenden.
$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 \
  && { GRUEN=$((GRUEN+1)); echo "PASS  Migration läuft fehlerfrei durch"; } \
  || { ROT=$((ROT+1)); echo "FAIL  Migration bricht ab"; }
$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 \
  && { GRUEN=$((GRUEN+1)); echo "PASS  Migration ist idempotent (zweiter Lauf fehlerfrei)"; } \
  || { ROT=$((ROT+1)); echo "FAIL  zweiter Migrationslauf bricht ab"; }

pruefe "Tabelle public.process_runs existiert" "1" \
  "select count(*) from pg_class where relname='process_runs' and relnamespace='public'::regnamespace"
pruefe "Row Level Security ist aktiv" "t" \
  "select relrowsecurity from pg_class where relname='process_runs' and relnamespace='public'::regnamespace"
pruefe "anon/authenticated/public haben keinerlei Rechte" "0" \
  "select count(*) from information_schema.role_table_grants where table_name='process_runs' and grantee in ('anon','authenticated','PUBLIC')"

# 2. Upsert-Semantik (der PostgREST-merge-duplicates-Pfad): zweimal dieselbe
#    Laufkennung -> genau EINE Zeile, mit dem Stand des zweiten Schreibens.
$PSQL -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
insert into public.process_runs (run_id, process, status, target_count)
values ('pgv-idem', 'understanding-nachhol', 'running', 4)
on conflict (run_id, process) do update set
  status = excluded.status, target_count = excluded.target_count,
  finished_at = excluded.finished_at, processed_count = excluded.processed_count;
insert into public.process_runs (run_id, process, status, target_count, processed_count, finished_at)
values ('pgv-idem', 'understanding-nachhol', 'success', 4, 4, now())
on conflict (run_id, process) do update set
  status = excluded.status, target_count = excluded.target_count,
  finished_at = excluded.finished_at, processed_count = excluded.processed_count;
SQL
pruefe "Upsert derselben (run_id, process): genau 1 Zeile" "1" \
  "select count(*) from public.process_runs where run_id='pgv-idem'"
pruefe "Upsert: Startbeleg wurde zum Abschluss (running -> success)" "success" \
  "select status from public.process_runs where run_id='pgv-idem'"
pruefe "Upsert: finished_at ist nach dem Abschluss gesetzt" "1" \
  "select count(*) from public.process_runs where run_id='pgv-idem' and finished_at is not null"

# 3. Primärschlüssel verhindert nackte Duplikate hart.
pruefe_fehler "nacktes INSERT-Duplikat scheitert am Primärschlüssel" \
  "insert into public.process_runs (run_id, process, status) values ('pgv-idem', 'understanding-nachhol', 'success')"

# 4. CHECK-Constraint weist unbekannte Zustände sichtbar ab.
pruefe_fehler "unbekannter Status ('ok') scheitert am CHECK-Constraint" \
  "insert into public.process_runs (run_id, process, status) values ('pgv-status', 'x', 'ok')"
pruefe_fehler "unbekannter Status ('total-kaputt') scheitert am CHECK-Constraint" \
  "insert into public.process_runs (run_id, process, status) values ('pgv-status', 'x', 'total-kaputt')"
for ST in running success partial failed blocked rolled_back; do
  $PSQL -c "insert into public.process_runs (run_id, process, status) values ('pgv-st-$ST', 'x', '$ST')" >/dev/null 2>&1
  pruefe "kanonischer Status '$ST' wird angenommen" "1" \
    "select count(*) from public.process_runs where run_id='pgv-st-$ST'"
done

# 5. Zehn getrennte Läufe -> zehn Zeilen (append-only, kein Ringverlust).
$PSQL -v ON_ERROR_STOP=1 -c \
  "insert into public.process_runs (run_id, process, status) select 'pgv-viele-'||g, 'understanding-cron', 'success' from generate_series(1,10) g" >/dev/null 2>&1
pruefe "zehn getrennte Läufe ergeben zehn Zeilen" "10" \
  "select count(*) from public.process_runs where run_id like 'pgv-viele-%'"

# 6. Rollback entfernt die Tabelle; erneutes Anwenden funktioniert.
$PSQL -v ON_ERROR_STOP=1 -f "$ROLLBACK" >/dev/null 2>&1 \
  && { GRUEN=$((GRUEN+1)); echo "PASS  Rollback läuft fehlerfrei durch"; } \
  || { ROT=$((ROT+1)); echo "FAIL  Rollback bricht ab"; }
pruefe "Rollback: Tabelle ist entfernt" "0" \
  "select count(*) from pg_class where relname='process_runs' and relnamespace='public'::regnamespace"
$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 \
  && { GRUEN=$((GRUEN+1)); echo "PASS  erneutes Anwenden nach Rollback funktioniert"; } \
  || { ROT=$((ROT+1)); echo "FAIL  erneutes Anwenden nach Rollback bricht ab"; }

[ -n "$STOPPEN" ] && eval "$STOPPEN"
echo ""
echo "$GRUEN grün, $ROT rot"
[ "$ROT" = "0" ] && exit 0 || exit 1
