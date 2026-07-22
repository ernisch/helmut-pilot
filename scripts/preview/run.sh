#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Sprint 11 — Preview-Validierung: End-to-End-Orchestrator.
#
# Steht eine WEGWERFBARE, lokale Postgres-16 im Session-Container auf, spielt
# das Bootstrap (Supabase-Auth-Nachbildung + Rollen), das reale Schema, die
# ECHTE Migration 20260712 (verbatim), die neue Read-only-Rolle 20260722 und
# den Mehr-Mandanten-Seed ein, führt alle Validatoren aus und RÄUMT ALLES
# WIEDER AB. €0, keine Cloud-Ressource, NICHTS an Production.
#
# Genau das dokumentierte, freigegebene Preview-Muster aus
# docs/rls-isolation-test-results.md (dort 19/19, seither gelöscht).
#
# Voraussetzungen: postgresql-16 + node im Container; Rechte, einen Nicht-Root-
# Systemnutzer anzulegen (Postgres läuft nicht als root). Fehlt eines davon,
# bricht das Skript mit einer klaren Meldung ab (KEINE improvisierte Alternative).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PREVIEW_PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PREVIEW_PGPORT:-54329}"
PGUSER_SYS="pgpreview"
DATADIR="/tmp/helmut-preview"
export PREVIEW_PGBIN="$PGBIN" PREVIEW_PGHOST="$DATADIR" PREVIEW_PGPORT="$PGPORT"

fail() { echo "PREVIEW-ABBRUCH: $*" >&2; exit 2; }
[ -x "$PGBIN/initdb" ] || fail "postgresql-16 nicht gefunden ($PGBIN). Fehlende Infrastruktur — nicht improvisieren."
command -v node >/dev/null || fail "node nicht gefunden."

teardown() {
  if [ -f "$DATADIR/data/postmaster.pid" ]; then
    sudo -u "$PGUSER_SYS" "$PGBIN/pg_ctl" -D "$DATADIR/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$DATADIR" 2>/dev/null || true
  echo "── Teardown: Preview-Cluster gestoppt und gelöscht (ephemer, nichts bleibt)."
}
trap teardown EXIT

echo "── Preview-Cluster aufsetzen (ephemer) …"
id "$PGUSER_SYS" >/dev/null 2>&1 || useradd -m -s /bin/bash "$PGUSER_SYS"
rm -rf "$DATADIR"; mkdir -p "$DATADIR"; chown -R "$PGUSER_SYS:$PGUSER_SYS" "$DATADIR"; chmod 700 "$DATADIR"
chmod -R a+rX "$REPO/scripts/preview" "$REPO/supabase/migrations" "$REPO/lib/helmut/secure-read.js"
sudo -u "$PGUSER_SYS" "$PGBIN/initdb" -D "$DATADIR/data" -U postgres --auth=trust -E UTF8 >/dev/null
sudo -u "$PGUSER_SYS" "$PGBIN/pg_ctl" -D "$DATADIR/data" \
  -o "-p $PGPORT -k $DATADIR -c listen_addresses=''" -l "$DATADIR/server.log" -w start >/dev/null

apply() { PGOPTIONS='-c client_min_messages=warning' "$PGBIN/psql" -h "$DATADIR" -p "$PGPORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }
echo "── Bootstrap + Schema + Migrationen + Seed einspielen …"
apply "$REPO/scripts/preview/00_bootstrap.sql"
apply "$REPO/scripts/preview/01_schema.sql"
apply "$REPO/supabase/migrations/20260712_tenant_rls_policies.sql"      # ECHTE Migration, verbatim
apply "$REPO/supabase/migrations/20260722_readonly_role.sql"           # neue Read-only-Rolle
apply "$REPO/scripts/preview/03_seed.sql"

RC=0
run_validator() {
  echo; echo "══════════════════════════════════════════════════════════════════"
  echo "▶ $1"
  node "$REPO/scripts/preview/$1" || { RC=1; echo "✗ $1 FEHLGESCHLAGEN"; }
}
run_validator preview-db-validate.js     # Aufgaben 2,3,4,8
run_validator secure-read-validate.js    # Aufgabe 5
run_validator shadow-read-validate.js    # Aufgabe 6
run_validator rollback-sim.js            # Aufgabe 7
run_validator performance.js             # Aufgabe 9 (Messung)

echo
if [ "$RC" -eq 0 ]; then
  echo "✅ PREVIEW-VALIDIERUNG VOLLSTÄNDIG GRÜN (alle Aufgaben)."
else
  echo "❌ PREVIEW-VALIDIERUNG: mindestens ein Validator fehlgeschlagen."
fi
exit "$RC"
