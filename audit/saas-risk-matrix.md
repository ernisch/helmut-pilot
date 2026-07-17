# SaaS-Risikomatrix — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 8** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Einordnung/Belege in `saas-readiness.md`.

Legende Priorität: **P0** kritischer Sicherheits-/Datenisolationsfehler · **P1** Profile verlieren Inhalte / Watchdog falsch / App-Start blockiert · **P2** gezielte Verbesserung · **P3** Optimierung ohne unmittelbaren Schaden.

| # | Risiko | Komponente (Beleg) | Wahrsch. | Auswirkung | Einzelpilot | Mehrmandanten | Vertriebs­blocker | Empfohlene Maßnahme | Prio |
|---|--------|--------------------|----------|------------|-------------|----------------|-------------------|---------------------|------|
| 1 | Keine RLS-Policies + Service-Role umgeht RLS → App-Bug leakt Fremddaten **ohne DB-Netz** | alle 24 Tabellen (Advisor `rls_enabled_no_policy`; storage.js:1194) | Mittel | Kritisch (DSGVO Art. 32/33, politische Daten) | Niedrig (1 Mandant) | **Hoch** | **JA** | RLS-Policies je Tabelle (`user_id = current_setting(...)`) **oder** dedizierter DB-Rollen-Kontext pro Request; Defense-in-Depth **zusätzlich** zur App-Filterung | **P0** |
| 2 | Optionale `userId`-Filter (Default `null` → **alle Tenants**) — latentes IDOR bei vergessenem Argument | `listDecisions`/`listMatchingResults`/`listOfficeOutputsByUser` (storage.js:853/909/1141, selbst verifiziert) | Mittel | Hoch (Cross-Tenant-Leak) | Niedrig | **Hoch** | **JA** | `userId` **verpflichtend** machen (throw bei fehlend); zentralen `withTenant()`-Wrapper einführen | **P0** |
| 3 | Racige Blob-Locks + Last-Write-Wins → Lost Updates, Doppel-KI-Läufe | `store.pipelineLocks` im Blob (storage.js:522-538), `writeSupabaseStore` (187); `pipeline_locks=0` | Hoch (Serverless-Concurrency) | Mittel–Hoch (Datenverlust, KI-Doppelkosten) | Mittel | **Hoch** | **JA** (bei Skalierung) | Atomares DB-Lock (`pipeline_locks` via `INSERT … ON CONFLICT` / advisory lock) statt Blob; per-Mandat-Rows statt Monolith-Blob | **P1** |
| 4 | Keine erzwungene per-Mandant-KI-Kostengrenze (Default `Infinity`, fail-open) | `canSpendLlm` (storage.js:431-514); `.env.example` | Hoch | Hoch (Kosten-DoS) | Mittel | **Hoch** | **JA** | `HELMUT_MAX_LLM_CALLS_PER_DAY` setzen + `HELMUT_LLM_BUDGET_FAIL_CLOSED=1`; globalen €-Cap + Alerting | **P1** |
| 5 | Understanding-Lock Default AUS (No-op) → Doppel-Abrechnung bei überlappenden Läufen | `acquireGlobalUnderstandingLock` (storage.js:565-575) | Mittel | Mittel (KI-Doppelkosten) | Niedrig | Mittel | Nein | `HELMUT_UNDERSTANDING_LOCK=1` (Betreiber-ENV); langfristig atomar verdrahten | **P2** |
| 6 | Demo-Profile (`<demo-mandant-b>`, `<demo-mandant-c>`) in Produktion | `helmut_store.main` / `profiles` (Live-Query) | Sicher (vorhanden) | Niedrig–Mittel (Verwechslung, Hygiene) | Niedrig | Mittel | Nein | Vor Vertrieb löschen; Prod von Testdaten trennen | **P2** |
| 7 | `helmut_ensure_profile` SECURITY DEFINER von anon/authenticated aufrufbar | Advisor 0028/0029; migration Z.41 | Niedrig (`NEW=null` → No-op) | Niedrig | Niedrig | Niedrig | Nein | `REVOKE EXECUTE FROM anon, authenticated` | **P2** |
| 8 | 2 Funktionen mutable `search_path` + SECURITY DEFINER; `vector`-Ext in `public` | Advisor 0011/0014 | Niedrig | Mittel (Priv-Esc-Vektor) | Niedrig | Mittel | Nein | `SET search_path`; Extension in eigenes Schema | **P2** |
| 9 | Legacy-Pilotmodus ohne `PILOT_SECRET` auf echtem Deploy offen | server.js:1218-1231 | Niedrig (Account-Modus go-forward) | Hoch (offener Zugang) | Niedrig | Mittel | Nein (wenn Account-Modus) | Prod hart auf `HELMUT_AUTH_MODE=accounts` + `PILOT_SECRET`-Pflicht | **P2** |
| 10 | Manuelles Provisioning, kein Self-Service | accounts.js:154-197 | Sicher | Niedrig (Skalierung) | Keins | Mittel | Nein (Produktgap) | Provisioning-/Onboarding-Flow automatisieren | **P3** |
| 11 | CSRF-Secret Fallback-Konstante ohne ENV | server.js CSRF-Init | Niedrig | Mittel | Niedrig | Mittel | Nein | Dediziertes Secret erzwingen | **P3** |

---

## Kompakt: Was blockiert was?

- **Einzelpilot betreiben:** kein P0/P1-Blocker. Nur P2-Hygiene (Demo-Profile, KI-Tageslimit setzen, `CRON_SECRET` gesetzt lassen).
- **Mehrere Mandanten:** #1 + #2 sind **echte Blocker** (Cross-Tenant-Leck-Fläche ohne DB-Netz); #3 + #4 werden bei Concurrency/Skalierung akut.
- **Voller SaaS-Vertrieb:** #1, #2, #3, #4 lösen; danach #5-#11.

**Empfohlene Umsetzungsreihenfolge (erster Sicherheits-Sprint):**
**#2 (`userId` verpflichtend + `withTenant`) → #1 (RLS-Policies) → #4 (KI-Budget fail-closed) → #3 (atomare Locks)** → dann P2/P3-Hygiene.

*(Diese Matrix ist read-only erhoben. Keine der Maßnahmen wurde in diesem Sprint umgesetzt — sie sind Input für den `fix-plan.md` und den ersten Umsetzungssprint.)*
