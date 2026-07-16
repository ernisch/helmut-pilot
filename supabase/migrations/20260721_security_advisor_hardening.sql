-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  ENTWURF (Sprint 1 Sicherheit) — NICHT ANWENDEN OHNE AUSDRÜCKLICHE BETREIBER-
--     FREIGABE. Dieses Repo spielt Migrationen NICHT automatisch ein (kein
--     Migration-Runner in .github/workflows / scripts/vercel-deploy.sh — verifiziert).
--     Anwendung ausschließlich manuell durch einen Menschen (psql / Supabase-
--     Dashboard / MCP apply_migration), analog zu den vorherigen Migrationen.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Schließt die offenen Supabase-SECURITY-Advisor-Punkte (read-only gegen Prod
-- ddckuvvpcytqbyfmbvie verifiziert am 2026-07-16):
--   0011 function_search_path_mutable ×5:
--        helmut_set_updated_at, match_knowledge_objects, helmut_reserve_llm_call,
--        helmut_acquire_pipeline_lock, helmut_release_pipeline_lock
--   0028/0029 anon/authenticated können SECURITY DEFINER helmut_ensure_profile
--        direkt per /rest/v1/rpc aufrufen.
--   + Härtung/Konsistenz: REVOKE auf match_knowledge_objects (SECURITY INVOKER +
--     PUBLIC EXECUTE — würde bei aktiver shared_read-Policy den KO-Korpus/Embeddings
--     für authenticated-Token abziehbar machen) und explizites REVOKE der
--     Default-CRUD-Grants auf gate_shadow_events/document_findings (Belt-and-
--     suspenders, konsistent zu llm_budget_counters/pipeline_locks/source_crawl_telemetry).
--
-- SICHER & REVERSIBEL:
--   * search_path wird per ALTER FUNCTION SET gesetzt — KEIN Body-Umbau
--     (CREATE OR REPLACE), daher kein Risiko, eine Funktionsdefinition zu verfälschen.
--     Gewählt wird `public, pg_temp` (identisch zum bereits vorhandenen Muster von
--     helmut_current_tenant); pg_catalog bleibt implizit an erster Stelle.
--   * REVOKE trifft nur anon/authenticated/public — die App nutzt AUSSCHLIESSLICH
--     service_role (BYPASSRLS, eigene Grants), ist also UNBERÜHRT. Trigger-Firing
--     (helmut_ensure_profile, helmut_set_updated_at) hängt NICHT an EXECUTE-Grants,
--     bleibt also funktionsfähig.
--   * Idempotent genug fürs erneute Einspielen (ALTER/REVOKE sind wiederholbar).
--   * Rollback: 20260721_security_advisor_hardening_rollback.sql.
--
-- KEINE Daten-, Spalten- oder Policy-Änderung. Keine Auswirkung auf den laufenden
-- Piloten (cem-ince). DSGVO: keine Inhalte/PII berührt.

begin;

-- ── 1) Fixe search_path (Advisor 0011) ──────────────────────────────────────
alter function public.helmut_set_updated_at() set search_path = public, pg_temp;
alter function public.match_knowledge_objects(vector, integer, text[], text[], text[]) set search_path = public, pg_temp;
alter function public.helmut_reserve_llm_call(text, text, integer) set search_path = public, pg_temp;
alter function public.helmut_acquire_pipeline_lock(text, bigint) set search_path = public, pg_temp;
alter function public.helmut_release_pipeline_lock(text, text) set search_path = public, pg_temp;

-- ── 2) helmut_ensure_profile: Direktaufruf durch anon/authenticated entziehen ─
-- (Advisor 0028/0029). Zusätzlich pg_temp in den bereits fixen search_path.
-- Trigger-Firing bleibt unberührt (fired durch das INSERT, nicht durch EXECUTE-Grant).
alter function public.helmut_ensure_profile() set search_path = public, pg_temp;
revoke execute on function public.helmut_ensure_profile() from public, anon, authenticated;

-- ── 3) match_knowledge_objects: Direktaufruf entziehen ──────────────────────
-- SECURITY INVOKER + PUBLIC EXECUTE. Heute nur durch RLS-Deny (knowledge_objects
-- RLS-enabled) abgeschirmt; sobald die shared_read-Policy für authenticated greift
-- (bereits angewandt), könnte ein authenticated-Token den vollen KO-Korpus +
-- Embeddings über die RPC abziehen. Konsistent zu den revoked Lock-/Budget-Funktionen.
revoke execute on function public.match_knowledge_objects(vector, integer, text[], text[], text[]) from public, anon, authenticated;

-- ── 4) Belt-and-suspenders: Default-CRUD-Grants auf internen Telemetrie-Tabellen ─
-- gate_shadow_events (20260716) + document_findings (20260715) tragen RLS
-- (enabled, 0 Policies = Deny), aber — anders als die neueren internen Tabellen —
-- KEIN explizites REVOKE. Nachziehen für Konsistenz.
revoke all on table public.gate_shadow_events from anon, authenticated;
revoke all on table public.document_findings from anon, authenticated;

commit;

-- ── Verifikation (read-only, NACH Anwendung manuell) ────────────────────────
-- select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname in ('helmut_set_updated_at','match_knowledge_objects',
--   'helmut_reserve_llm_call','helmut_acquire_pipeline_lock','helmut_release_pipeline_lock',
--   'helmut_ensure_profile');   -- erwartet: proconfig enthält search_path=public, pg_temp
-- select get_advisors(security) sollte 0011 (×5) + 0028/0029 nicht mehr melden.
