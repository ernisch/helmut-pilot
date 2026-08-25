-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Skalierungssprint 25/50/100, 2026-08-25) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Rollback: rollback_20260825101500_jobqueue_ankunftskennzahl.sql
--     (gleiches Verzeichnis — entfernt genau die eine neue Funktion).
--     Voraussetzung: 20260808_scalable_job_queue.sql ist angewendet.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ANLASS — eine Kennzahl fehlt, ohne die der verbindliche Nachweis gar nicht
-- messbar ist:
--
-- Die Freigabebedingung der Stufe 2 lautet „**Abfluss ≥ Ankunft** über 7 Tage"
-- (op30-zielarchitektur-2026-08-13.md §14; CURRENT_STATE §6 Punkt 1). Die
-- vorhandene Kennzahlenfunktion `helmut_job_metrics` liefert den ABFLUSS
-- (`erledigt_im_zeitraum`), aber **keine Ankunft**: es gibt keine Zählung der im
-- Zeitraum EINGEREIHTEN Aufträge. Der siebentägige Fünfernachweis ist damit
-- heute nicht führbar — nicht, weil er scheitern würde, sondern weil die eine
-- Seite der Ungleichung nirgends gemessen wird.
--
-- WAS DIESE MIGRATION ÄNDERT — ausschließlich ADDITIV:
--
--   Eine NEUE, rein lesende Funktion `helmut_job_ankunft(p_seit_minuten)`.
--   Sie zählt Aufträge nach `created_at` im selben Fenster, das
--   `helmut_job_metrics` für den Abfluss benutzt, und gibt zusätzlich das
--   Abflussverhältnis zurück.
--
-- WARUM EINE NEUE FUNKTION UND KEINE ERWEITERUNG VON `helmut_job_metrics`:
--   Eine zusätzliche Spalte in einer `returns table`-Funktion erzwingt in
--   PostgreSQL ein DROP + CREATE. Das wäre ein Eingriff in eine Funktion, die
--   in Production laufend von `/api/ops/jobqueue` und vom Watchdog gelesen wird
--   — mit einem Zeitfenster, in dem sie nicht existiert. Eine neue Funktion
--   daneben hat denselben Nutzen ohne dieses Risiko: kein bestehender Aufrufer
--   ändert sich, keine bestehende Signatur wird angefasst, der Rückweg ist ein
--   einzelnes DROP.
--
-- DATENSPARSAMKEIT: nur Zähler und Zeitspannen, keine Nutzlast, keine
-- Mandatsdaten, keine Kennungen (CLAUDE.md §4.7).
--
-- RECHTE: identisch zu `helmut_job_metrics` — `anon`/`authenticated`/`public`
-- bekommen NICHTS; der Zugriff läuft ausschließlich über `service_role`.

-- Eine Transaktion: entweder die Funktion samt Rechteentzug ist da, oder gar nichts.
begin;

create or replace function public.helmut_job_ankunft(p_seit_minuten integer default 1440)
returns table(
  eingereiht_im_zeitraum bigint,
  erledigt_im_zeitraum   bigint,
  abflussverhaeltnis     numeric,
  fenster_minuten        integer
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with fenster as (
    select now() - (greatest(coalesce(p_seit_minuten, 1440), 1) * interval '1 minute') as ab,
           greatest(coalesce(p_seit_minuten, 1440), 1) as minuten
  ),
  zahlen as (
    select
      (select count(*) from public.helmut_jobs, fenster where created_at  >= fenster.ab) as ein,
      (select count(*) from public.helmut_jobs, fenster
        where status = 'erledigt' and finished_at >= fenster.ab)                         as aus
  )
  select
    zahlen.ein,
    zahlen.aus,
    -- Verhaeltnis Abfluss zu Ankunft. Ohne Ankunft ist das Verhaeltnis NICHT 0
    -- und auch nicht unendlich, sondern UNBESTIMMT -> null. Eine 0 hier waere
    -- ein falsches Alarmsignal (CLAUDE.md §4.4: kein falsches Gruen, aber auch
    -- kein falsches Rot).
    case when zahlen.ein = 0 then null
         else round(zahlen.aus::numeric / zahlen.ein::numeric, 4) end,
    fenster.minuten::integer
  from zahlen, fenster;
$$;

comment on function public.helmut_job_ankunft(integer) is
  'Ankunft (eingereiht) gegen Abfluss (erledigt) im selben Zeitfenster — die Messgroesse '
  'der Stufe-2-Freigabebedingung "Abfluss >= Ankunft". Rein lesend, nur Zaehler.';

-- Rechte exakt wie bei helmut_job_metrics: niemand ausser service_role.
revoke all on function public.helmut_job_ankunft(integer) from public, anon, authenticated;

commit;
