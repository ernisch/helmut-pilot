-- Nur vorbereitet; Production-Anwendung braucht gesondertes GO.
-- Drei schmale Tabellenscans statt breiter Materialisierung und 17 CTE-Scans.
-- Alle 17 Ergebnisformeln bleiben gleich; skalare Aggregate teilen einen Scan. CREATE OR REPLACE erhaelt OID, Owner, ACL
-- und Kommentar; kein DROP, GRANT, Daten-, Index- oder Konfigurationswechsel.
-- Rueckweg: rollback_20261113080937_job_metrics_ohne_materialisierung.sql
begin;

create or replace function public.helmut_job_metrics(p_seit_minuten integer default 1440)
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
  max_mandatsalter_s     numeric,
  -- ── NEU 2026-08-12: die WARTEZEIT-Sicht (operative Grenze) ────────────────
  -- Ältester offener Auftrag nach TATSÄCHLICHER Wartezeit — über ALLE offenen
  -- Aufträge, auch die ohne Mandatsbezug (geteilte Abrufe). Das ist der Wert,
  -- auf den sich die 24-h-Abbruchgrenze bezieht.
  aeltester_offener_s             numeric,
  -- Dasselbe, aber nur mandatsbezogene Arbeit.
  max_mandatswartezeit_s          numeric,
  -- Mandate, deren älteste offene Arbeit seit ≥ 24 h WARTET (nicht: fällig ist).
  ueberfaellige_mandate_wartezeit bigint
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with fenster as (
    select now() - (greatest(coalesce(p_seit_minuten, 1440), 1) * interval '1 minute') as ab
  ), gesamt as (
    select
      count(*) filter (where status = 'wartend') as wartend,
      count(*) filter (where status = 'laeuft') as laufend,
      count(*) filter (where status = 'erledigt' and finished_at >= (select ab from fenster)) as erledigt,
      count(*) filter (where status = 'fehlgeschlagen') as fehlgeschlagen,
      count(*) filter (where status = 'fehlgeschlagen' and attempts >= max_attempts) as endfehler,
      coalesce(sum(greatest(attempts - 1, 0)), 0) as wiederholungen,
      count(*) filter (where status = 'laeuft' and lease_expires_at > now()) as leases,
      coalesce(max(extract(epoch from (now() - due_at)))
        filter (where status = 'wartend' and due_at <= now()), 0) as faellig,
      round(avg(extract(epoch from (finished_at - first_claimed_at)))
        filter (where status = 'erledigt' and finished_at is not null and first_claimed_at is not null)::numeric, 3) as dauer,
      count(distinct tenant_id) filter (where tenant_id is not null and status in ('wartend', 'laeuft')
        and first_due_at <= now() - interval '24 hours') as mandate_faellig,
      coalesce(max(extract(epoch from (now() - first_due_at)))
        filter (where tenant_id is not null and status in ('wartend', 'laeuft')), 0) as mandatsalter,
      coalesce(max(greatest(extract(epoch from (now() - greatest(created_at, first_due_at))), 0))
        filter (where status in ('wartend', 'laeuft')), 0) as offen,
      coalesce(max(greatest(extract(epoch from (now() - greatest(created_at, first_due_at))), 0))
        filter (where tenant_id is not null and status in ('wartend', 'laeuft')), 0) as mandatswartezeit,
      count(distinct tenant_id) filter (where tenant_id is not null and status in ('wartend', 'laeuft')
        and greatest(created_at, first_due_at) <= now() - interval '24 hours') as mandate_wartend
    from public.helmut_jobs
  )
  select
    g.wartend, g.laufend, g.erledigt, g.fehlgeschlagen, g.endfehler,
    g.wiederholungen, g.leases, g.faellig,
    -- Die bisherige gruppierte Abfrage liefert ohne Abschluesse NULL, nicht 0.
    case when g.erledigt > 0 then round(g.erledigt::numeric
      / greatest(extract(epoch from (now() - fenster.ab)) / 3600.0, 0.0001), 2) end,
    g.dauer,
    (select coalesce(jsonb_object_agg(job_type, n), '{}'::jsonb)
      from (select job_type, count(*) as n from public.helmut_jobs group by job_type) t),
    (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from public.helmut_jobs group by status) t),
    g.mandate_faellig, g.mandatsalter, g.offen, g.mandatswartezeit, g.mandate_wartend
  from gesamt g cross join fenster;
$$;

commit;
