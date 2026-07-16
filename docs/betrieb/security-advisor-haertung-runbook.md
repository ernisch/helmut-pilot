# Runbook — Security-Advisor-Härtung (Migration 20260721)

**Status:** vorbereitet, **NICHT angewandt**. Freigabepflichtig (Betreiber).
**Dateien:** `supabase/migrations/20260721_security_advisor_hardening.sql` (+ `…_rollback.sql`).
**Statischer Test:** `npm run test:security-hardening-sql` (26 Checks, keine DB).

## Was sie tut
Schließt die offenen Supabase-SECURITY-Advisor-Punkte (read-only gegen Prod
`ddckuvvpcytqbyfmbvie` am 2026-07-16 verifiziert):

| Advisor | Betroffen | Fix |
|---|---|---|
| 0011 function_search_path_mutable ×5 | `helmut_set_updated_at`, `match_knowledge_objects`, `helmut_reserve_llm_call`, `helmut_acquire_pipeline_lock`, `helmut_release_pipeline_lock` | `ALTER FUNCTION … SET search_path = public, pg_temp` |
| 0028/0029 SECURITY DEFINER von anon/authenticated aufrufbar | `helmut_ensure_profile` | `REVOKE EXECUTE … FROM public, anon, authenticated` (+ pg_temp) |
| Härtung/Konsistenz | `match_knowledge_objects` (PUBLIC EXECUTE) | `REVOKE EXECUTE … FROM anon, authenticated` |
| Belt-and-suspenders | `gate_shadow_events`, `document_findings` | `REVOKE ALL … FROM anon, authenticated` |

## Warum sicher & reversibel
- `ALTER FUNCTION SET search_path` ändert **nur** das Config-Attribut, **nicht** den
  Funktions-Body (kein `CREATE OR REPLACE`). Kein Risiko, eine Definition zu verfälschen.
- `REVOKE` trifft **nur** anon/authenticated/public. Die App nutzt ausschließlich
  **service_role** (BYPASSRLS, eigene Grants) → unberührt. Trigger-Firing
  (`helmut_ensure_profile`, `helmut_set_updated_at`) hängt nicht an EXECUTE-Grants.
- Keine Daten-, Spalten- oder Policy-Änderung. Kein Effekt auf cem-ince.

## Vorprüfung (vor Anwendung, read-only)
1. `npm run test:security-hardening-sql` grün.
2. Optional: auf einer **Supabase-Branch** (isoliert) einspielen und
   `get_advisors(security)` prüfen — 0011 (×5) + 0028/0029 sollten verschwinden.

## Anwendung (nach Freigabe)
Manuell: `psql < 20260721_security_advisor_hardening.sql` **oder** Supabase-Dashboard/
MCP `apply_migration`. Dauer < 1 s, keine Sperren auf App-Tabellen, keine Nutzerwirkung.

## Nachprüfung
```
select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in
 ('helmut_set_updated_at','match_knowledge_objects','helmut_reserve_llm_call',
  'helmut_acquire_pipeline_lock','helmut_release_pipeline_lock','helmut_ensure_profile');
-- erwartet: proconfig enthält search_path=public, pg_temp
```
`get_advisors(security)` erneut ausführen: die o. g. Punkte sind weg.

## Rollback
`psql < 20260721_security_advisor_hardening_rollback.sql` — stellt den Zustand vorher
her (search_path zurück, PUBLIC-EXECUTE- und Default-CRUD-Grants zurück).

## Benötigte Freigabe
„RLS-/Grant-Änderung in Production" (DDL). Betreiber-Freigabe erforderlich.
Kein Deployment, keine App-Änderung nötig (der App-Code ist unberührt).
