# Sprint 1 — Zugriffsmatrix & Ist-Verifikation

**Stand:** 2026-07-16 · **Modus:** rein lesend erhoben (Code + Production read-only).
**Belegbasis:** `lib/helmut/storage.js`, `server.js`, `lib/helmut/scheduler.js`,
`lib/helmut/auth.js`, `lib/helmut/ai.js`, `supabase/migrations/*.sql`; Supabase-Projekt
`ddckuvvpcytqbyfmbvie` (`list_tables`/`list_migrations`/`get_advisors`/`pg_policies`,
read-only).

> **Grundsatz:** Keine Vermutungen. Jede Zeile ist durch Code (`Datei:Zeile`),
> Datenbankschema oder eine read-only Prod-Abfrage belegt.

---

## 0. Verifikationsstand — welche früheren Aussagen waren überholt?

| Frühere Aussage (Quelle) | Realität (verifiziert 2026-07-16) | Beleg |
|---|---|---|
| „Tenant-RLS-Policies NUR VORBEREITET, NICHT ausgeführt" (Header `20260712_tenant_rls_policies.sql`) | **Überholt.** Die Migration IST in Production angewandt; **23 Policies** existieren. | `list_migrations` (`tenant_rls_policies`), `pg_policies` (23 Zeilen) |
| „Policy-Migration ist Entwurf/nicht eingespielt" (Audit-Agent RPC/service_role) | **Überholt** (Agent vertraute dem Datei-Header). | wie oben |
| „llm_budget_reservation / pipeline_lock_atomic freigabepflichtig, nicht angewandt" (Datei-Header) | **Überholt.** Beide sind in Prod angewandt; `llm_budget_counters` wird aktiv genutzt (Scope `global`, used=60 am 2026-07-16). | `list_migrations`, `execute_sql` (counters) |
| „RLS trennt die Kunden selbst / JWT scharf" (`multitenancy-abschlussbericht.md` §§1,2,4) | **Überholt seit 2026-07-13** (bereits korrigiert). Selbst-Signier-JWT tot (PGRST301); `tenantJwtModeEnabled()` hart `false`. RLS ist inert (service_role). | `docs/quellenarchitektur/05-sicherheitsmodell-rls.md`, `storage.js` (tenantJwtModeEnabled) |
| „Testlücke d: manipulierte user_id an der HTTP-Grenze nirgends getestet" (Test-Coverage-Agent) | **Teilweise überholt.** `pickPoliticianId` wird in `p1-security-check.js:134-140` geprüft (Agent hatte diese Datei nicht in seiner Liste). Jetzt zusätzlich in `cross-tenant-security-test.js`. | `scripts/p1-security-check.js` |

**Was war TATSÄCHLICH noch offen** (und in diesem Sprint adressiert): (a) mehrere
**latente** Blob-Leser ohne `assertTenant`; (b) Schreib-Guard prüfte nur user_id-
Präsenz, nicht Herkunft; (c) **kein** atomarer per-Mandant-Kostendeckel (nur globaler);
(d) **kein** idempotenter Provisionierungsprozess; (e) offene Security-Advisor-Punkte
(mutable search_path ×5, REVOKEs); (f) Crons bedienen per Default nur cem-ince.

---

## 1. Tabellen-Zustand (Production, alle 39 Tabellen RLS-enabled)

**23 Tabellen mit Policy** (`pg_policies`, verifiziert): 17× `tenant_isolation`
(cmd=ALL, USING **und** WITH CHECK) + `helmut_store`(select) + 5× `shared_read`.
**16 Tabellen RLS-enabled ohne Policy** (Advisor `rls_enabled_no_policy`) = geteilte/
operative Tabellen (Deny-all außer service_role, **beabsichtigt**).

| Tabelle | Zeilen | Tenant-Spalte | RLS-Policy | Zugriffsart | Mandantenbezug | Bewertung |
|---|---|---|---|---|---|---|
| decisions | 109 | user_id | tenant_isolation (ALL) | R/W via service_role | pro Mandant | **geschützt** (App-Guard + RLS-Backstop) |
| matching_results | 57 | user_id | tenant_isolation | R/W | pro Mandant | geschützt |
| briefings | 13 | user_id | tenant_isolation | R/W | pro Mandant | geschützt |
| profile_embeddings | 1 | user_id | tenant_isolation | R/W | pro Mandant | geschützt |
| mandate_profiles | 2 | user_id | tenant_isolation | R/W | pro Mandant | geschützt |
| office_outputs | 0 | user_id | tenant_isolation | R/W | pro Mandant | geschützt |
| user_notes, daily_tasks, interactions, topic_memory, political_items, priority_changes, communication_drafts, personalized_recommendations, matching_weights | 0 | user_id | tenant_isolation | (V2/aspirational) | pro Mandant | geschützt (RLS) |
| profiles | 3 | id (=Mandant) | tenant_isolation (self) | R via Blob | Identität | geschützt |
| llm_usage | 0 | politician_id + user_id | tenant_isolation | (Blob-basiert genutzt) | pro Mandant | geschützt |
| helmut_store | 4 | id-Präfix | tenant_isolation_select (`main-p-`) | R/W via service_role | Blob pro Mandant | `main`/`main-auth` bewusst service_role-only |
| knowledge_objects, raw_documents, ko_document_links, ko_relations, sources | 330/5977/1251/0/0 | — | shared_read (SELECT) | R/W | **global** (Korpus) | korrekt mandantenlos |
| document_findings, gate_shadow_events, source_crawl_telemetry, crawl_runs | 1827/6043/145/– | — | keine (Deny) | R/W | global/Telemetrie | service_role-only |
| llm_budget_counters | 2 | (scope-Spalte) | keine (Deny) | RPC | operativ (global + tenant:<id>) | service_role-only |
| pipeline_locks | 0 | — | keine (Deny) | RPC | operativ | service_role-only |
| geographies, electoral_districts, political_entities, publishers, source_packages, package_paths, retrieval_paths, path_expected_* | Konfig | — | keine (Deny) | R | global | Konfiguration |

**Tenant-Identitäten (verifiziert):** `profiles` = cem-ince, james-brown, angela-merkel;
`mandate_profiles` = cem-ince, james-brown; `helmut_store` = main, main-auth,
main-p-cem-ince, main-p-james-brown. → **cem-ince** = echter Pilot, **james-brown** =
geschütztes Bestandsprofil, **angela-merkel** = Legacy-Demo.

---

## 2. DB-Zugriffspfade (App-Schicht) — Tenant-Guard-Status

Da **RLS produktiv inert** ist (service_role, BYPASSRLS), ist die App-Schicht die
**einzige** wirksame Linie. Guard-Primitive: `assertTenant` (throws bei leerem Kontext),
`assertTenantRows` (Präsenz + **neu:** Cross-Tenant-Batch/expectedTenant).

**Erzwungen (assertTenant + user_id=eq.):** getProfileEmbedding, listMatchingResults,
listDecisions, listOfficeOutputsByUser, canSpendOfficeOutput, getOfficeOutput,
getTasks, getUserNotes, getInteractions, getLageChecks.

**Erzwungen per Zeilen-Guard (assertTenantRows):** saveMatchingResults, saveDecisions,
saveOfficeOutput, saveRenderedBriefingV3 (jetzt zusätzlich Cross-Tenant-Batch-Schutz).

**In diesem Sprint gehärtet (waren latent — soft `!politicianId ||` → Main-Store):**
getLatestBriefing, getTopicMemory, getLatestLageCheck, getLatestPipelineDebugReport,
getPushSubscriptions, getPushEventByDedupeKey, listPushEvents → jetzt `assertTenant`.

**Bewusst offen (dokumentiert, kein Cross-Tenant-Content-Leak):** `getStoreSummary()`
hat einen legitimen null=Global-Modus (Admin-Overview, server.js); `getLatestWatchdogState`
liefert System-Telemetrie (kein Mandanten-Content). `readAuthStore` = EIN Blob mit allen
Konten/Sessions (service_role, bewusst; eigener Folgeschritt).

---

## 3. API-Endpunkte — IDOR-Bewertung

**Kernbefund: kein HTTP-IDOR für reguläre Mandanten-Nutzer.** Identität kommt
ausschließlich serverseitig aus dem Session-Cookie (server.js:280-322). Ein
Query-`politicianId`/`profileId` ist nur **Auswahl** und wird durch `pickPoliticianId`
(auth.js:100-115) gegen die erlaubten Mandate validiert:
- `abgeordneter` → hart an eigenes Mandat gebunden (ignoriert `requested`).
- `referent`/`demo` → nur zugewiesene Mandate; Fremd-ID → Fallback `allowed[0]`.
- `admin` → darf jedes Mandat wählen (**by design**).
- Kein Mandat → **403 `no-mandate`** (nie stiller Fremd-Fallback).

`/api/admin/*` (role admin), `/api/cron/*` (CRON_SECRET, fail-closed 503),
`/api/debug/*` (ADMIN_SECRET) — freies `politicianId` nur für Secret-/Rolleninhaber
(**Betreiber**, kein Tenant-IDOR). Privacy-Endpunkte zusätzlich Owner-oder-Admin.

---

## 4. Cron-Prozesse & Hintergrundjobs — „bedienen sie nur cem?"

**JA, per Default.** Mechanismus: session-lose Crons haben `authUser === null` →
server.js:319-321 setzt `politicianId = cemInceProfile.id`. **Matching + Decisions**
laufen in crawl/pipeline/lage-check **nur für cem** (scheduler.js:315/322/445/448).

| Cron | Scope |
|---|---|
| `/api/cron/crawl`, `/api/cron/pipeline` | Understanding global; Matching+Decision **nur cem** |
| `/api/cron/lage-check` | **hart cem** (Fold-Matching/Decision + Push nur cem) |
| `/api/cron/morning-briefing` | **nur cem** (Loop über alle Profile nur mit Flag `HELMUT_MORNING_PUSH_ALL_PROFILES=1`, Default AUS) |
| `/api/cron/lage-briefing` | **echt multi-tenant** (Loop `listProfiles()`) |
| `/api/cron/understanding` | global/mandantenneutral |
| `/api/cron/health-report` | cem (Betreiber-Monitoring) |

**Folge für einen zweiten Mandanten:** bekäme verstandenes Rohwissen + Lage-Briefing-
Vorwärmung, aber **keine** personalisierte Priorisierung/Decisions/Pushes. →
**Freigabepflichtiger Folgeschritt** (Cron-Umbau auf Multi-Profil-Loop), **nicht** in
diesem Sprint umgesetzt (kein Cron-/Zeit-/Flag-Eingriff ohne Freigabe).

---

## 5. Supabase-RPCs & service_role

**RPCs (4 real aufgerufen + 3 Trigger/Policy-Helfer):** `helmut_reserve_llm_call`
(atomar, revoked, jetzt scope `global` + `tenant:<id>`), `helmut_acquire/release_pipeline_lock`
(atomar, revoked), `match_knowledge_objects` (INVOKER, **PUBLIC EXECUTE** → REVOKE
vorbereitet), `helmut_current_tenant` (Policy-Helfer, search_path gesetzt),
`helmut_ensure_profile` (DEFINER, **anon/authenticated executable** → REVOKE vorbereitet),
`helmut_set_updated_at` (Trigger).

**service_role:** `supabaseRequest` nutzt IMMER `SUPABASE_SERVICE_ROLE_KEY` (BYPASSRLS).
Tenant-Pfade validieren App-seitig (`assertTenant` + `user_id=eq.`). Alle übrigen Pfade
(Korpus/Konfig/Telemetrie/Locks/Budget/Retention) sind bewusst mandantenlos.

**Offene Advisor-Punkte (in Sprint-1-Migration 20260721 adressiert, freigabepflichtig):**
mutable search_path ×5, REVOKE match_knowledge_objects + helmut_ensure_profile,
REVOKE gate_shadow_events/document_findings.

---

## 6. LLM-callTypes (Grundlage für den per-Mandant-Kostendeckel)

**Tenant-bezogen (6):** refineBriefingItem, communicationDraft, parliamentAssessment,
helmutAssessment, lageBriefing, office-output — tragen `politicianId` (5 via `profile?.id`/
`|| null`, d. h. können ohne Mandant ankommen → fail-closed korrekt). **Global/geteilt (4):**
understanding, understanding-staff-backfill, understanding-backfill, koTagsBackfill —
bewusst mandantenlos (globaler Deckel). Klassifikation im Code: `isSharedGlobalCallType`
(storage.js). Von einem unabhängigen Audit-Agenten exakt bestätigt.

---

## 7. Risiko-Zusammenfassung

| # | Risiko | Zustand nach Sprint 1 |
|---|---|---|
| latente Blob-Leser ohne Guard | Cross-Tenant-Leak bei vergessenem/leerem Kontext | **behoben** (assertTenant auf 7 Leser) |
| Schreib-Guard nur Präsenz | fremder/gemischter user_id nicht abgefangen | **behoben** (Cross-Tenant-Batch + expectedTenant) |
| kein per-Mandant-Kostendeckel | ein Mandant kann Budget monopolisieren | **behoben** (atomar, Default AUS, freigabepflichtig scharf) |
| kein idempotentes Provisioning | halbe/doppelte Accounts | **behoben** (provisioning.js + CLI) |
| Advisor: search_path/REVOKE | Priv-Esc-Vektor / Korpus-Abzug bei aktiver Policy | **vorbereitet** (Migration 20260721, freigabepflichtig) |
| Crons nur cem | zweiter Mandant unterversorgt | **dokumentiert** (Freigabepunkt, Cron-Umbau nicht in Sprint 1) |
| RLS inert (JWT tot) | keine DB-seitige Durchsetzung | **dokumentiert** (echtes GoTrue-Auth = eigener großer Schritt) |
| main-auth-Blob Single-Point | alle Konten in einer Zeile | **dokumentiert** (Folgeschritt) |
