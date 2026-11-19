#!/usr/bin/env bash
set -euo pipefail

node -e 'if (process.env.HELMUT_LOKALER_SCHUTZ !== "aktiv") process.exit(1)'
test "${HELMUT_TEST_CORE_CONTAINER:-}" = helmut-core-pg
container=$HELMUT_TEST_CORE_CONTAINER
test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" = none

docker exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -d postgres -c 'create database helmut_test_quellenfaelligkeit'
{
  cat supabase/migrations/20260808_scalable_job_queue.sql
  cat supabase/migrations/20261119091317_quellenfaelligkeit_claim.sql
  cat scripts/fixtures/quellenfaelligkeit-claim.sql
  cat supabase/migrations/rollback_20261119091317_quellenfaelligkeit_claim.sql
  cat <<'SQL'
do $$ begin
  assert to_regprocedure('public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)') is null;
  assert to_regprocedure('public.helmut_finish_job(uuid,text,boolean,text,bigint)') is not null;
  raise notice 'PASS Rückweg entfernt den neuen Claim und bewahrt den bestehenden Auftragsabschluss';
end $$;
SQL
} | docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d helmut_test_quellenfaelligkeit
