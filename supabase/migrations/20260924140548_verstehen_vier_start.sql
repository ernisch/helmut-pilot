-- Vorbereitet, NICHT angewendet. Rollback: rollback_20260924140548_verstehen_vier_start.sql
-- Nur der ausdrueckliche Viererauftrag; kein Aufrufer aus Cron/HTTP.
-- Die fruehe Modellstart-Marke ist eine Sicherheitsmarke, KEIN Beweis eines HTTP-Aufrufs.
-- Der Bericht und das Kostenbuch zaehlen tatsaechliche Provider-Versuche getrennt.
begin;
create or replace function public.helmut_verstehen_vier_start(
  p_vorgang_id text, p_eingabe_hash text, p_besitzer text, p_run_id text, p_nonce text
) returns table(erlaubt boolean, fencing bigint)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  q jsonb;
  freigabe jsonb;
  r public.helmut_verstehen_reservierungen%rowtype;
  v record;
begin
  if p_vorgang_id is null or p_vorgang_id not in (
    'vg-gemeinsame-20260921-dcd0f5', 'vg-arbeitsplätze-20260715-6cc672',
    'vg-linkenpolitiker-20260921-37cdeb', 'vg-verzögerung-20230613-95c80f'
  ) then raise exception 'vier-fremder-vorgang'; end if;
  select data into q from public.helmut_store
    where id='verstehen4-20260924-a' for update;
  if q is null or q->>'status' is distinct from 'laeuft'
    or q->>'runId' is distinct from p_run_id or q->>'nonce' is distinct from p_nonce
    or p_run_id is null or p_run_id !~ '^verstehen4-[0-9]{5,20}$'
    or p_nonce is null or p_nonce !~ '^[a-f0-9-]{36}$'
    or not coalesce(q->'ids' @> jsonb_build_array(p_vorgang_id),false)
    or q->>'gestartetAm' is null
    or coalesce((q->>'deadlineMs')::numeric,0) <= extract(epoch from clock_timestamp())*1000
    or coalesce((q->>'deadlineMs')::numeric,0) >
      extract(epoch from (q->>'gestartetAm')::timestamptz)*1000 + 1200000
  then raise exception 'vier-quittung-abweichend'; end if;
  select x into freigabe from jsonb_array_elements(q->'freigaben') x
    where x->>'id'=p_vorgang_id;
  if freigabe is null then raise exception 'vier-freigabe-fehlt'; end if;
  select * into r from public.helmut_verstehen_reservierungen
    where vorgang_id=p_vorgang_id for update;
  if not found or r.zustand <> 'unbekannt' or r.besitzer is not null or r.lease_bis is not null
    or r.fencing is distinct from (freigabe->>'fencing')::bigint
    or r.ki_aufrufe is distinct from (freigabe->>'kiAufrufe')::integer
    or r.versuche is distinct from (freigabe->>'versuche')::integer
    or r.eingabe_hash is distinct from freigabe->>'eingabeHash'
  then raise exception 'vier-cas-abweichend'; end if;
  if public.helmut_verstehen_ausgang_aufloesen(p_vorgang_id,'erneut') <> 'erneut-freigegeben'
  then raise exception 'vier-ergebnis-schon-vorhanden'; end if;
  select * into v from public.helmut_verstehen_reserviere(p_vorgang_id,p_eingabe_hash,p_besitzer,300000);
  if not v.erlaubt or v.fencing <> r.fencing+1
    or not public.helmut_verstehen_modellstart(p_vorgang_id,p_besitzer,v.fencing,300000)
  then raise exception 'vier-start-fehlgeschlagen'; end if;
  return query select true,v.fencing::bigint;
end;
$$;
revoke all on function public.helmut_verstehen_vier_start(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.helmut_verstehen_vier_start(text,text,text,text,text) to service_role;
commit;
