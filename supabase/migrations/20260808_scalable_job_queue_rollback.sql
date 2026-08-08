-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260808_scalable_job_queue.sql
-- (Sprint „Skalierungsgrundlage 1000", 2026-08-08).
-- Stellt den Zustand VOR der Migration vollständig wieder her.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATENVERLUST-HINWEIS, ehrlich benannt:
--     Dieses Rollback LÖSCHT die Warteschlange samt Inhalt — alle wartenden,
--     laufenden, erledigten und fehlgeschlagenen Aufträge sind danach weg.
--     KEINE andere Struktur wird berührt: raw_documents, knowledge_objects,
--     matching_results, decisions, briefings, crawl_runs, process_runs,
--     llm_usage und pipeline_locks bleiben vollständig unverändert. Das
--     Produkt verhält sich danach exakt wie vor der Migration.
--
--     Verlorene Aufträge sind FACHLICH FOLGENLOS: der Compiler
--     (lib/helmut/source-demand.js) leitet sie deterministisch aus Profilen
--     und Paketen neu ab. Ein Rollback kostet also höchstens die Arbeit des
--     laufenden Aktualitätsfensters, keine Wissensobjekte und keine Belege.
--
--     Vor dem Rollback sichern, falls die Betriebshistorie erhalten bleiben soll:
--       \copy (select * from public.helmut_jobs) to 'helmut_jobs.csv' csv header
--
-- REIHENFOLGE (verbindlich):
--   1. ZUERST das Flag HELMUT_SCALABLE_PIPELINE entziehen (Vercel-Env) bzw. das
--      Deployment zurückrollen, damit kein Scheduler und kein Worker mehr in
--      die Struktur schreibt.
--   2. Warten, bis kein Auftrag mehr im Status `laeuft` steht (oder deren Lease
--      abgelaufen ist) — sonst schließt ein noch laufender Worker ins Leere.
--   3. ERST DANN dieses Skript ausführen.
--
--   Das Entziehen des Flags allein ist bereits ein VOLLSTÄNDIGER funktionaler
--   Rückweg: ohne Flag betritt niemand diesen Pfad, und der bisherige
--   Cron-Pfad läuft unverändert weiter. Die Struktur darf gefahrlos stehen
--   bleiben — sie wird dann von niemandem gelesen oder geschrieben. Dieses
--   Skript ist deshalb der SELTENE Fall, nicht der Regelfall.

begin;

-- 1 · Trigger und Triggerfunktion zuerst (der Trigger sitzt auf der Tabelle).
drop trigger if exists helmut_jobs_kappen_trg on public.helmut_jobs;
drop function if exists public.helmut_jobs_kappen();

-- 2 · Funktionen. Einzeln benannt (nicht per cascade), damit ein Teil-Rollback
--     nach einem abgebrochenen Lauf denselben Endzustand erreicht (idempotent).
drop function if exists public.helmut_prune_jobs(integer);
drop function if exists public.helmut_job_metrics(integer);
drop function if exists public.helmut_finish_job(uuid, text, boolean, text, bigint);
drop function if exists public.helmut_extend_job_lease(uuid, text, bigint);
drop function if exists public.helmut_claim_jobs(text, integer, bigint, text[]);
drop function if exists public.helmut_enqueue_job(text, text, text, jsonb, timestamptz, smallint, integer, text);

-- 3 · Indizes. Fallen mit der Tabelle, werden trotzdem einzeln benannt
--     (siehe oben: Idempotenz eines Teil-Rollbacks).
drop index if exists public.helmut_jobs_window_idx;
drop index if exists public.helmut_jobs_tenant_idx;
drop index if exists public.helmut_jobs_status_idx;
drop index if exists public.helmut_jobs_lease_idx;
drop index if exists public.helmut_jobs_claim_idx;
drop index if exists public.helmut_jobs_idem_uidx;

-- 4 · Tabelle.
drop table if exists public.helmut_jobs;

commit;

-- ── Verifikation nach dem Rollback (rein lesend) ────────────────────────────
-- Erwartet: 0, 0
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='helmut_jobs';
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--      ('helmut_enqueue_job','helmut_claim_jobs','helmut_extend_job_lease',
--       'helmut_finish_job','helmut_job_metrics','helmut_prune_jobs',
--       'helmut_jobs_kappen');
-- Erwartet: unveraendert vorhanden (Beweis, dass nichts anderes angefasst wurde)
--   select count(*) from information_schema.tables where table_schema='public'
--     and table_name in ('raw_documents','knowledge_objects','matching_results',
--                        'decisions','briefings','pipeline_locks','llm_usage');
--   -- erwartet: 7
