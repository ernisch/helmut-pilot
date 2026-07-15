-- Rollback: Helmut — LLM-Budget atomare Call-Reservierung
-- ==============================================================================
-- Entfernt Funktion + Zaehlertabelle wieder vollstaendig. Der App-Code erkennt
-- die fehlende Funktion (PostgREST 404/PGRST202) und faellt automatisch und
-- geloggt auf das bisherige nicht-atomare Read-then-Decide-Gate zurueck — kein
-- Deploy noetig, aber der bekannte Race besteht dann wieder.
-- Datenverlust durch den Rollback: nur Tageszaehlerstaende (keine Inhalte); das
-- llmUsage-Log im Auth-Store ist davon unabhaengig und bleibt vollstaendig.

begin;

drop function if exists public.helmut_reserve_llm_call(text, text, integer);
drop table if exists public.llm_budget_counters;

commit;
