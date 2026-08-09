-- Helmut — ROLLBACK zu 20260808_llm_budget_fairness.sql
-- ==============================================================================================
-- Nimmt die ergebnisbezogene Reservierung vollstaendig zurueck.
--
-- WICHTIG: `public.llm_budget_counters` und `helmut_reserve_llm_call` gehoeren zur AELTEREN
-- Migration 20260717 und werden hier NICHT angefasst. Der globale Notfalldeckel bleibt also
-- auch nach diesem Rollback vollstaendig funktionsfaehig — es faellt nur die Idempotenz je
-- Ergebnis und der faire Mandantenanteil weg. Der App-Code meldet das erkennbar
-- (`verfuegbar:false, grund:'migration-fehlt'`) und faellt auf den bisherigen Pfad zurueck.
--
-- DATENVERLUST: die Reservierungszeilen des laufenden Tages gehen verloren. Das ist gewollt
-- und harmlos — sie sind ein Arbeitsstand, keine Kosten- oder Auditquelle. Die Kostenwahrheit
-- bleibt das llmUsage-Log im Auth-Store, die Zaehlerwahrheit bleibt llm_budget_counters.
-- Idempotent: mehrfaches Einspielen ist harmlos.

begin;

drop function if exists public.helmut_prune_llm_reservations(integer);
drop function if exists public.helmut_llm_budget_kennzahlen(text);
drop function if exists public.helmut_release_llm_reservation(text, text);
drop function if exists public.helmut_settle_llm_reservation(text, boolean, text);
drop function if exists public.helmut_reserve_llm_result(text, text, text, text, integer, integer, bigint);

drop index if exists public.llm_reservations_status_idx;
drop index if exists public.llm_reservations_tag_idx;
drop table if exists public.llm_reservations;

commit;

-- Nachpruefung (lesend, alle muessen 0 liefern):
--   select count(*) from pg_class where relname = 'llm_reservations';
--   select count(*) from pg_proc  where proname like 'helmut_%llm_re%';
-- Und der Bestand aus 20260717 muss UNVERAENDERT dastehen (muss 1 liefern):
--   select count(*) from pg_proc where proname = 'helmut_reserve_llm_call';
