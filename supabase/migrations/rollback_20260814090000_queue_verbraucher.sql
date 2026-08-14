-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260814090000_queue_verbraucher.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WICHTIG: Diese Datei traegt bewusst KEINEN fuehrenden Zeitstempel. Ein normaler
-- `supabase db push` erkennt sie dadurch NICHT als Vorwaertsmigration und ueberspringt sie
-- ("file name must match pattern") — empirisch belegt 2026-08-14 mit Supabase CLI 2.114.0
-- (Belegdatei op30-zielarchitektur-2026-08-13.md §17.4).
--
-- WAS DER ROLLBACK TUT:
--   * entfernt die sechs neuen Funktionen,
--   * STELLT helmut_outbox_abgleich AUF DEN STAND VOR DER HAERTUNG ZURUECK (ohne den
--     Zustand `bestaetigt` im Terminalzweig) — sonst bliebe eine Funktion zurueck, die
--     die Migration gar nicht mehr definiert.
--   * fasst helmut_jobs und helmut_job_outbox NICHT an: keine Zeile, keine Spalte, kein
--     Zustand. Der Rueckweg braucht KEINE Datenmigration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

drop function if exists public.helmut_claim_job_by_id(uuid, text, bigint);
drop function if exists public.helmut_outbox_zuruecklegen(uuid, integer);
drop function if exists public.helmut_outbox_erneut_vorlegen(uuid);
drop function if exists public.helmut_outbox_aufraeumen(integer, integer, boolean);
drop function if exists public.helmut_klasse_erneuere(uuid, text, bigint);

-- helmut_outbox_abgleich auf den Stand von 20260813090000 zuruecksetzen.
create or replace function public.helmut_outbox_abgleich(
  p_limit                 integer default 200,
  p_mindestalter_minuten  integer default 10
)
returns table(fehlend bigint, wiedereroeffnet bigint, verzichtet bigint)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now        timestamptz := now();
  v_alter      interval := greatest(coalesce(p_mindestalter_minuten, 10), 1) * interval '1 minute';
  v_fehlend    bigint := 0;
  v_wieder     bigint := 0;
  v_verzichtet bigint := 0;
begin
  update public.helmut_job_outbox o
     set status = 'verzichtet'
    from public.helmut_jobs j
   where j.id = o.job_id
     and j.status in ('erledigt', 'fehlgeschlagen')
     and o.status in ('offen', 'versendet', 'aufgegeben');
  get diagnostics v_verzichtet = row_count;

  with fehlende as (
    select j.id as job_id
      from public.helmut_jobs j
     where j.status = 'wartend'
       and j.due_at <= v_now
       and not exists (select 1 from public.helmut_job_outbox o where o.job_id = j.id)
     order by j.due_at asc
     limit greatest(coalesce(p_limit, 200), 1)
  )
  insert into public.helmut_job_outbox (job_id)
  select job_id from fehlende
  on conflict (job_id) do nothing;
  get diagnostics v_fehlend = row_count;

  with verwaiste as (
    select o.id
      from public.helmut_job_outbox o
      join public.helmut_jobs j on j.id = o.job_id
     where j.status = 'wartend'
       and j.due_at <= v_now - v_alter
       and o.status in ('bestaetigt', 'aufgegeben')
       and coalesce(o.confirmed_at, o.updated_at) <= v_now - v_alter
     order by j.due_at asc
     limit greatest(coalesce(p_limit, 200), 1)
     for update of o skip locked
  )
  update public.helmut_job_outbox o
     set status = 'offen', attempts = 0, next_attempt_at = v_now, last_error = null
    from verwaiste v
   where o.id = v.id;
  get diagnostics v_wieder = row_count;

  return query select v_fehlend, v_wieder, v_verzichtet;
end;
$$;

revoke all on function public.helmut_outbox_abgleich(integer, integer) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.helmut_outbox_abgleich(integer, integer) to service_role';
  end if;
end $$;
