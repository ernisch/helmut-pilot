-- Rueckweg nur fuer die Kennzahlenfunktion; Daten und Berechtigungen bleiben.
-- Stellt den bisherigen Funktionskoerper aus 20260812 wieder her.
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
    -- FÄLLIGKEITSSICHT (unverändert seit 20260808) — fachlicher Rückstand gegen
    -- `first_due_at`. Sie bleibt gemeldet, weil sie eine echte Aussage über die Daten
    -- macht (z. B. „diese Personenquelle ist seit dem 6.8. nicht durchgelaufen").
    -- Sie ist ab 2026-08-12 aber NICHT mehr die Abbruchgrenze — siehe Kopf.
    (select count(distinct tenant_id) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft')
        and first_due_at <= now() - interval '24 hours'),
    (select coalesce(max(extract(epoch from (now() - first_due_at))), 0) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft')),
    -- WARTEZEITSICHT (neu). `greatest(created_at, first_due_at)` = „ab wann ist dieser
    -- Auftrag bearbeitbar"; `greatest(…, 0)` kappt einen in der Zukunft liegenden
    -- Bearbeitungszeitpunkt auf 0 s statt eine negative Wartezeit zu melden.
    -- `greatest()` überspringt NULL-Werte, ein `coalesce` fängt den Fall „beide NULL".
    (select coalesce(max(greatest(extract(epoch from
              (now() - greatest(created_at, first_due_at))), 0)), 0)
       from basis where status in ('wartend', 'laeuft')),
    (select coalesce(max(greatest(extract(epoch from
              (now() - greatest(created_at, first_due_at))), 0)), 0)
       from basis where tenant_id is not null and status in ('wartend', 'laeuft')),
    (select count(distinct tenant_id) from basis
      where tenant_id is not null and status in ('wartend', 'laeuft')
        and greatest(created_at, first_due_at) <= now() - interval '24 hours');
$$;

commit;
