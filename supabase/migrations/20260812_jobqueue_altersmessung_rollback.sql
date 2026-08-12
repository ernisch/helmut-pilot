-- ROLLBACK zu 20260812_jobqueue_altersmessung.sql
-- =============================================================================================
-- Stellt `public.helmut_job_metrics(integer)` byte-gleich in der Fassung aus
-- 20260808_scalable_job_queue.sql wieder her (14 Spalten, Fälligkeitssicht).
--
-- FOLGE DES ROLLBACKS: `scalable-pipeline.betriebsstatus` findet die drei Wartezeit-Spalten
-- nicht mehr und fällt ausdrücklich auf den ALTEN Altersvertrag zurück
-- (`altersvertrag="faelligkeit-alt"` plus Befund `altersmessung-alt`). Der Fehlbefund aus
-- Runbook §15.5 kommt damit zurück — das ist gewollt sichtbar und wird nicht verschwiegen.
--
-- Idempotent: läuft auch, wenn 20260812 nie angewendet wurde.
-- Keine Daten werden berührt.

begin;

drop function if exists public.helmut_job_metrics(integer);

create function public.helmut_job_metrics(p_seit_minuten integer default 1440)
returns table(
  wartend                bigint,
  laufend                bigint,
  erledigt_im_zeitraum   bigint,
  fehlgeschlagen_gesamt  bigint,
  endgueltig_fehler      bigint,
  wiederholungen         bigint,
  aktive_leases          bigint,
  aeltester_faelliger_s  numeric,
  durchsatz_pro_stunde   numeric,
  mittlere_dauer_s       numeric,
  nach_typ               jsonb,
  nach_status            jsonb,
  ueberfaellige_mandate  bigint,
  max_mandatsalter_s     numeric
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with fenster as (select now() - (greatest(coalesce(p_seit_minuten, 1440), 1) * interval '1 minute') as ab),
  basis as (select * from public.helmut_jobs)
  select
    (select count(*) from basis where status = 'wartend'),
    (select count(*) from basis where status = 'laeuft'),
    (select count(*) from basis, fenster where status = 'erledigt' and finished_at >= fenster.ab),
    (select count(*) from basis where status = 'fehlgeschlagen'),
    (select count(*) from basis where status = 'fehlgeschlagen' and attempts >= max_attempts),
    (select coalesce(sum(greatest(attempts - 1, 0)), 0) from basis),
    (select count(*) from basis where status = 'laeuft' and lease_expires_at > now()),
    (select coalesce(max(extract(epoch from (now() - due_at))), 0)
       from basis where status = 'wartend' and due_at <= now()),
    (select round(count(*)::numeric
                  / greatest(extract(epoch from (now() - fenster.ab)) / 3600.0, 0.0001), 2)
       from basis, fenster where status = 'erledigt' and finished_at >= fenster.ab
       group by fenster.ab),
    (select round(avg(extract(epoch from (finished_at - first_claimed_at)))::numeric, 3)
       from basis where status = 'erledigt' and finished_at is not null and first_claimed_at is not null),
    (select coalesce(jsonb_object_agg(job_type, n), '{}'::jsonb)
       from (select job_type, count(*) as n from basis group by job_type) t),
    (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
       from (select status, count(*) as n from basis group by status) t),
    (select count(distinct tenant_id) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft')
        and first_due_at <= now() - interval '24 hours'),
    (select coalesce(max(extract(epoch from (now() - first_due_at))), 0) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft'));
$$;

comment on function public.helmut_job_metrics(integer) is
  'Betriebskennzahlen der Warteschlange (rein lesend, nur Zaehler/Zeitspannen, keine Nutzdaten).';

revoke all on function public.helmut_job_metrics(integer) from public, anon, authenticated;

commit;
