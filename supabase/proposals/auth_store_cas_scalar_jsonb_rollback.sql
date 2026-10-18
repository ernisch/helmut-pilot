-- INERT rollback proposal. First drain writes and restore the prior transport.
-- No Production execution is authorized. Never drop an unknown/changed function.
BEGIN;
DO $rollback$
BEGIN
  IF to_regprocedure('public.helmut_auth_store_cas_v1(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'auth-cas-rollback-function-missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid='public.helmut_auth_store_cas_v1(jsonb)'::regprocedure
      AND NOT prosecdef AND NOT proretset
      AND proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='e43fcc05474638c1bbf2b6ea614b716cb90251a5e4ef4931f8796c866b550ec8') THEN
    RAISE EXCEPTION 'auth-cas-rollback-source-drift';
  END IF;
END;
$rollback$;
DROP FUNCTION public.helmut_auth_store_cas_v1(jsonb);
COMMIT;
