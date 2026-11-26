-- Enger Lease-Schutz: ein abgelaufener Halter darf keinen Versuch zuruecknehmen.
-- Keine Auftrags-/Kosten-/CAS-Datenaenderung, keine Rollen- oder Signaturaenderung.
-- Bekanntes Production-Original: rest-lease-rpc-vorwerte.json, 26.11.2026.
-- CREATE OR REPLACE erhaelt OID, Eigentum, Kommentar und Rollenrechte.
-- Rueckweg: rollback_20261126132654_job_defer_leaseablauf.sql
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $lease_guard$
declare v_hash text;
begin
  select encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(
    'public.helmut_defer_job(uuid,text,bigint,text)')), 'UTF8')), 'hex') into v_hash;
  if v_hash is null or v_hash not in ('1523a1c55ff92dfe810908f51dbca1f8deb4d2d1c4d0326eecdcaff4a262fb93','6af2bcdb614ef003f8aa612bc58cd8cc17c65e8035512daef345631c541be434') then
    raise exception 'defer-leaseablauf: unbekannter Vorwert (Funktionsdrift oder fehlende Funktion)';
  end if;
end;
$lease_guard$;

CREATE OR REPLACE FUNCTION public.helmut_defer_job(p_id uuid, p_owner text, p_delay_ms bigint DEFAULT 60000, p_grund text DEFAULT NULL::text)
 RETURNS TABLE(uebernommen boolean, neue_faelligkeit timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_due timestamptz;
begin
  update public.helmut_jobs j
     set status           = 'wartend',
         lease_owner      = null,
         lease_expires_at = null,
         -- Der Versuch wird zurueckgenommen: Warten ist kein Fehlversuch.
         attempts         = greatest(0, j.attempts - 1),
         due_at           = now() + (greatest(coalesce(p_delay_ms, 60000), 1000) * interval '1 millisecond'),
         last_error       = case when p_grund is null then j.last_error
                                 else 'zurueckgestellt: ' || left(p_grund, 200) end,
         updated_at       = now()
   where j.id = p_id
     and j.lease_owner = p_owner
     and j.status = 'laeuft'
     and j.lease_expires_at > clock_timestamp()
  returning j.due_at into v_due;

  if v_due is null then
    return query select false, null::timestamptz;
    return;
  end if;
  return query select true, v_due;
end;
$function$;

do $lease_guard$
declare v_hash text;
begin
  select encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(
    'public.helmut_defer_job(uuid,text,bigint,text)')), 'UTF8')), 'hex') into v_hash;
  if v_hash is null or v_hash not in ('6af2bcdb614ef003f8aa612bc58cd8cc17c65e8035512daef345631c541be434') then
    raise exception 'defer-leaseablauf: Nachwert unbestaetigt (Funktionsdrift oder fehlende Funktion)';
  end if;
end;
$lease_guard$;
commit;
