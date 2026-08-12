-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  FREIGABEPFLICHTIG (Sprint „Altersmessung der Warteschlange", 2026-08-12) —
--     NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBERFREIGABE (CLAUDE.md §5).
--     Rollback: 20260812_jobqueue_altersmessung_rollback.sql (gleiches Verzeichnis).
--     Reihenfolge: setzt 20260808_scalable_job_queue.sql voraus (angewendet 2026-08-11).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- KORREKTUR DER ALTERSMESSUNG (`helmut_job_metrics`).
--
-- BELEGTER FEHLBEFUND (Production, 2026-08-11 20:04 UTC, Runbook §15.5):
--   Beim ERSTEN Lauf des skalierbaren Pfades meldete `betriebsstatus`
--   `zustand=kritisch` mit „ältester offener Auftrag 504 477 s = 5,84 Tage" — bei
--   235 Aufträgen, die alle **wenige Minuten** alt waren. Kein Auftrag hing, keiner
--   war verloren, es gab 0 endgültige Fehler. Die verbindliche Abbruchgrenze §8.2
--   trat trotzdem ein; K2/K3 wurden nie begonnen.
--
-- URSACHE (an echter PostgreSQL 16.13 nachgestellt, siehe scripts/jobqueue-alter-*):
--   Beide Alterskennzahlen maßen die **Fälligkeit**, nicht die **Wartezeit**:
--     * `aeltester_faelliger_s` = now() − `due_at`
--     * `max_mandatsalter_s`    = now() − `first_due_at`
--   `first_due_at` ist die FACHLICHE Fälligkeit beim Einreihen. Sie liegt bauartbedingt
--   in der Vergangenheit, sobald ein Auftrag in ein bereits laufendes Aktualitätsfenster
--   fällt: `source-demand.js` streut die Fälligkeit über das Fenster ab dessen Beginn
--   („ein bereits fälliger Auftrag bleibt sofort fällig"). Beim Archivfenster der
--   Personensuchen ist dieses Fenster **7 Tage** breit (HELMUT_DEMAND_ARCHIVE_WINDOW_H,
--   Vorgabe 168). Ein am 2026-08-11 erzeugter Archivauftrag trug damit die Fälligkeit
--   2026-08-06T00:00Z — 5,84 Tage „alt" in der Sekunde seiner Entstehung.
--   In Production waren das genau die 5 `person-archiv`-Aufträge im Fenster
--   `2026-08-06T00Z`; alle 230 übrigen Aufträge lagen unter 24 h.
--
--   Das ist KEIN Rückstand, sondern ein Quelldatum. Die Grenze „ältester offener
--   Auftrag > 24 h" hätte damit bei JEDEM ersten Lauf in einem laufenden 7-Tage-Fenster
--   sofort ausgelöst — sie war strukturell unbrauchbar.
--
-- ZWEI GETRENNTE BEGRIFFE (ab hier verbindlich, gleiche Namen in SQL und App):
--   1. FÄLLIGKEITSRÜCKSTAND  = now() − `first_due_at`
--      „Seit wann WÄRE diese Arbeit fachlich fällig gewesen." Bleibt erhalten und wird
--      weiter gemeldet (`max_mandatsalter_s`, `ueberfaellige_mandate`) — er ist ein
--      ehrlicher Datenbefund. Er taugt aber NICHT als Betriebsgrenze.
--   2. WARTEZEIT             = greatest(now() − greatest(`created_at`, `first_due_at`), 0)
--      „Wie lange wartet dieser Auftrag TATSÄCHLICH, seit er bearbeitbar ist."
--      Das ist die operative Kennzahl; auf sie bezieht sich die 24-h-Abbruchgrenze.
--
-- WARUM `greatest(created_at, first_due_at)` UND NICHT `due_at`:
--   * `created_at` steht fest und wandert nie ⇒ ein wirklich alter Auftrag altert weiter,
--     auch wenn er tausendmal zurückgestellt oder nach einem Fehler wiederholt wird.
--     `due_at` setzt `helmut_defer_job` bei JEDEM Zurückstellen neu (`now() + delay`) —
--     eine Messung dagegen ist durch Warten löschbar (belegter Fehler 2026-08-08).
--   * `first_due_at` deckelt nach oben: ein Auftrag, der erst heute Abend bearbeitbar
--     wird, wartet jetzt 0 s und nicht „seit seiner Entstehung".
--   * Der spätere der beiden Zeitpunkte ist damit exakt „ab wann wartet er wirklich".
--   * `first_claimed_at` scheidet aus (2026-08-08 belegt): es springt beim ersten Claim
--     nach vorn und verliert die Wartezeit davor.
--
-- WAS DIESE MIGRATION NICHT TUT:
--   Keine Tabellen-, Spalten-, Index- oder Policy-Änderung. Keine Datenänderung, kein
--   Backfill. Sie ersetzt AUSSCHLIESSLICH die lesende Funktion `helmut_job_metrics` und
--   ergänzt sie um drei Spalten. Die 14 bisherigen Spalten bleiben nach Name, Typ,
--   Reihenfolge UND Formel unverändert — bestehende Auswertungen lesen weiter dasselbe.
--
-- WARUM DROP + CREATE statt CREATE OR REPLACE: PostgreSQL kann den Rückgabetyp einer
-- `returns table`-Funktion nicht per REPLACE erweitern („cannot change return type of
-- existing function"). Die Rechte werden unten identisch neu gesetzt.

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

comment on function public.helmut_job_metrics(integer) is
  'Betriebskennzahlen der Warteschlange (rein lesend, nur Zaehler/Zeitspannen, keine Nutzdaten). '
  'ZWEI ALTERSBEGRIFFE: aeltester_faelliger_s/max_mandatsalter_s/ueberfaellige_mandate messen den '
  'FAELLIGKEITSRUECKSTAND (now - first_due_at bzw. due_at) und koennen durch ein historisches '
  'Quelldatum sofort gross sein; aeltester_offener_s/max_mandatswartezeit_s/ueberfaellige_mandate_wartezeit '
  'messen die TATSAECHLICHE WARTEZEIT ab greatest(created_at, first_due_at). Die Betriebsgrenzen '
  'beziehen sich seit 2026-08-12 auf die Wartezeit.';

-- Rechte identisch zur Vorfassung wiederherstellen (DROP nimmt sie mit).
revoke all on function public.helmut_job_metrics(integer) from public, anon, authenticated;

commit;
