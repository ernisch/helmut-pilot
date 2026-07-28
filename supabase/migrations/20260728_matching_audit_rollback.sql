-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260728_matching_audit.sql (Sprint 23B-1).
-- Stellt den Zustand VOR der Migration vollständig wieder her.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATENVERLUST-HINWEIS, ehrlich benannt:
--     Dieses Rollback LÖSCHT die Auditstruktur samt Inhalt — alle
--     matching_runs-Zeilen und die Werte der additiven matching_results-
--     Spalten sind danach weg. Die OPERATIVE PROJEKTION bleibt vollständig
--     unberührt: id, user_id, knowledge_object_id, vorgang_id, similarity,
--     rank, matched_features, filters und created_at werden NICHT angefasst.
--     Das Produkt verhält sich danach exakt wie vor der Migration.
--
--     Ebenfalls entfernt: die atomare Publish-Funktion und der Riegel, der
--     matching_results.run_id auf vollstaendige Laeufe beschraenkt. Danach ist
--     der Schreibpfad wieder exakt der von vor der Migration.
--
--     Vor dem Rollback sichern, falls die Historie erhalten bleiben soll:
--       \copy (select * from public.matching_runs) to 'matching_runs.csv' csv header
--
-- REIHENFOLGE: erst das Flag HELMUT_MATCHING_AUDIT entziehen (Vercel-Env oder
-- Deployment zurückrollen), damit kein Lauf mehr in die Struktur schreibt,
-- DANN dieses Skript ausführen. Das Entziehen des Flags allein ist bereits ein
-- vollständiger funktionaler Rückweg — die Struktur darf gefahrlos stehen
-- bleiben (sie wird dann von niemandem gelesen oder geschrieben).

begin;

-- 1 · Atomare Veröffentlichung und den Projektions-Riegel entfernen.
--     Zuerst, weil der Trigger auf matching_results sitzt und die Funktion die
--     Auditstruktur referenziert.
drop trigger if exists matching_results_run_complete on public.matching_results;
drop function if exists public.helmut_matching_result_run_complete();
drop function if exists public.helmut_publish_matching_run(text, text, jsonb, timestamptz);

-- 2 · Additive Spalten auf matching_results zurücknehmen.
--     Die Indizes auf run_id und (user_id, knowledge_object_id) werden
--     explizit vorher entfernt; der FK auf matching_runs verschwindet mit der
--     Spalte run_id.
drop index if exists public.matching_results_run_idx;
drop index if exists public.matching_results_tenant_ko_uidx;

alter table public.matching_results
  drop column if exists run_id,
  drop column if exists profil_hash,
  drop column if exists ko_eingabe_hash,
  drop column if exists ko_version,
  drop column if exists engine_version,
  drop column if exists rezept_version,
  drop column if exists vektor_version,
  drop column if exists eingabe_fingerabdruck,
  drop column if exists berechnet_am,
  drop column if exists aktuell,
  drop column if exists abgeloest_am,
  drop column if exists signale,
  drop column if exists begruendung,
  drop column if exists updated_at;

-- 3 · Auditstruktur entfernen. Policy, Grants, Trigger und Indizes fallen mit
--     der Tabelle; sie werden trotzdem einzeln benannt, damit ein
--     Teil-Rollback nach einem abgebrochenen Lauf denselben Endzustand
--     erreicht (idempotent).
drop policy if exists matching_runs_tenant_read on public.matching_runs;
drop trigger if exists matching_runs_immutable on public.matching_runs;
drop index if exists public.matching_runs_offen_idx;
drop index if exists public.matching_runs_fingerprint_uidx;
drop index if exists public.matching_runs_user_idx;
drop table if exists public.matching_runs;

-- 4 · Triggerfunktion entfernen (wird von nichts anderem verwendet).
drop function if exists public.helmut_matching_run_immutable();

commit;

-- ── Verifikation nach dem Rollback (rein lesend) ────────────────────────────
-- Erwartet: 0, 0, 9
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='matching_runs';
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='matching_results'
--      and column_name in ('run_id','profil_hash','ko_eingabe_hash','ko_version',
--                          'engine_version','rezept_version','vektor_version',
--                          'eingabe_fingerabdruck','berechnet_am','aktuell',
--                          'abgeloest_am','signale','begruendung','updated_at');
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='matching_results';
-- Zusaetzlich erwartet: 0, 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in
--      ('helmut_publish_matching_run','helmut_matching_result_run_complete');
--   select count(*) from pg_trigger
--    where tgrelid='public.matching_results'::regclass and not tgisinternal
--      and tgname='matching_results_run_complete';
