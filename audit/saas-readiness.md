# SaaS-Readiness & Security — Helmut

**Sprint:** SaaS-Readiness-Audit · **Phase 8** · **Stand:** 2026-07-12
**Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit:** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Modus:** Rein lesend. Keine Production-Writes, keine Migration, kein Merge, keine Fixes.
**Belegbasis:** `lib/helmut/storage.js`, `auth.js`, `accounts.js`, `supabase/schema.sql`, `supabase/migrations/20260711_presale_hardening.sql`, `server.js`, `client.js`, `.env.example`; Supabase-Advisors + SELECT-Abfragen gegen Prod `ddckuvvpcytqbyfmbvie`.

> **Kern-Antwort vorab:**
> **(a) Einzelpilot — HEUTE sicher betreibbar: JA** (mit kleinen Vorab-Fixes).
> **(b) Mehrere Mandanten — BEDINGT/riskant:** Isolation ruht **zu 100% auf App-Code-Disziplin** ohne DB-Sicherheitsnetz.
> **(c) Voller SaaS-Vertrieb — BLOCKIERT:** fehlende RLS-Defense-in-Depth (P0), latentes IDOR durch optionale Filter (P0), racige Blob-Locks (P1), keine erzwungene KI-Kostengrenze (P1), manuelles Provisioning.

Die vollständige Matrix steht in `saas-risk-matrix.md`; dieses Dokument ordnet ein.

---

## 1. Mandantentrennung — zwei Schichten

**Auth-Schicht: sauber (kein HTTP-IDOR, verifiziert).**
- Identität kommt ausschließlich aus dem serverseitig aufgelösten Session-Cookie (`auth.js:64-70`). Das URL-Param `politicianId` ist nur **Auswahl** innerhalb erlaubter Mandate, nie Berechtigung.
- `pickPoliticianId` (auth.js:100-114, **selbst gelesen**): `abgeordneter` ist **hart an sein eigenes Mandat gebunden** (`return user.politicianId`, ignoriert `requested`); `referent`/`demo` nur explizit zugewiesene Mandate; Admin darf wählen. Manipuliertes URL-Param öffnet **keine** Fremddaten.
- `server.js:235-265`: Account-Nutzer ohne gültiges Mandat → **403 `no-mandate`**, fällt NIE still auf ein Fremd-Mandat zurück.

**Storage-Schicht: kein zentraler `withTenant()` — Per-Query-Disziplin.**
- **V2-Blob:** physische Trennung pro Mandat über separate Supabase-Rows `main-p-<politicianId>` (storage.js:177-203), zusätzlich `user_id`-Filter innerhalb. Solide, weil jedes Mandat ein eigenes Dokument hat.
- **V3-Tabellen:** `user_id`-Spalte. **Latentes IDOR (selbst verifiziert, storage.js:853-858):** `listMatchingResults({ userId = null })` hängt den `user_id=eq.`-Filter **nur an, wenn `userId` truthy ist** — sonst liefert die Query **alle Mandanten** (bis Limit). Gleiches Muster bei `listDecisions`/`listOfficeOutputsByUser`. Die geprüften Live-Aufrufer setzen `userId` (lage.js:297, office server.js:387), aber es gibt **keinen DB-Zwang**: ein einziger vergessener `userId` = tenant-übergreifendes Leck.
- `knowledge_objects`/`raw_documents` sind **bewusst mandantenlos** (öffentliche parlamentarische Daten) — Radar/Briefing werden pro Profil daraus personalisiert. Korrekt, kein Leak.

**Befund:** Datenzugriff zwischen Profilen ist **heute nicht über HTTP ausnutzbar**, aber die Trennung ist „per-Query-Disziplin" statt struktureller Garantie.

---

## 2. RLS-Realität (verifiziert)

- **24 Tabellen RLS-enabled, 0 Policies** (selbst verifiziert: `pg_policies` public = 0; `pg_class.relrowsecurity` = 24; Advisor `rls_enabled_no_policy` ×24). → **Deny-all für `anon`/`authenticated`.** Die App nutzt den **Service-Role-Key** (storage.js:1194-1195), der **RLS komplett umgeht**.
- **Konsequenz:** RLS liefert **heute null Mandantentrennung** — sie ist reiner Backstop gegen direkten anon-PostgREST-Zugriff. Die **gesamte** Isolation ruht auf App-Code. Ein vergessener `user_id`-Filter (§1) = tenant-übergreifendes Leck **ohne DB-Netz**. Bei politischen Daten (hochsensibel, Art.-9-nah) ein **DSGVO-Art.-32/33-Risiko** — der zentrale Mehrmandanten-Blocker.
- **Client-Key-Exposure: keine** (verifiziert) — `client.js`/`index.html` enthalten **keinen** Supabase-anon/service-Key; das Frontend spricht nur die eigene Server-API an. Positiv.
- **`helmut_ensure_profile` (SECURITY DEFINER, anon+authenticated per RPC aufrufbar** — Advisor 0028/0029; migration Z.41-51). Reale Ausnutzbarkeit **gering** (Trigger-Funktion ohne Argumente, `NEW=null` bei Direkt-RPC → No-op), aber unnötige Angriffsfläche → `REVOKE EXECUTE`.
- **2 Funktionen mutable search_path** (`helmut_set_updated_at`, `match_knowledge_objects`) + **`vector`-Extension in `public`** (Advisor 0011/0014) — Hygiene/Priv-Esc-Vektor.

---

## 3. Cron-Auth — FAIL CLOSED ✅ (verifiziert)

`authorizeCron` ist korrekt **fail-closed**: kein `CRON_SECRET` → **503** (deaktiviert, server.js:2375-Warnung + Handler), falsches Secret → **403**, `timingSafeEqual`. Query-Secret nur bei `HELMUT_ALLOW_QUERY_SECRETS=true` (Default false), sonst nur Bearer. → `/api/cron/*` sind **NICHT weltweit auslösbar** → KI-/Crawl-Kosten-DoS über Cron ist geschlossen. **Korrektur zum alten Audit** („Fail-open Cron-Auth" als P1): **behoben**.

---

## 4. Blob-Architektur & Race Conditions ⚠️

- **`helmut_store` (4 Zeilen) = Read-Modify-Write, Last-Write-Wins.** `writeSupabaseStore` (storage.js:187-195) POSTet das gesamte `data`-JSON (voller Überschreib). Zwei gleichzeitige Schreiber (Cron + Watchdog + App-Open) → **Lost Update**. 10s-Cache erhöht Stale-Read-Wahrscheinlichkeit.
- **`pipeline_locks`-Tabelle = 0 Zeilen — nicht verdrahtet.** Locks liegen im Blob (`store.pipelineLocks`, storage.js:522-538). Die Lock-Akquise selbst ist **racig**: Blob lesen → prüfen → Blob schreiben (nicht atomar); zwei parallele Vercel-Invocations lesen beide „kein Lock", laufen beide. **Fail-open** bei Fehler. Kein `SELECT … FOR UPDATE`, kein atomares DB-Primitiv. → **Single-Flight ist Best-Effort, nicht garantiert** → doppelte Crawl-/Briefing-Läufe möglich (= doppelte KI-Kosten + Lost Updates).
- **Globaler Understanding-Lock: Default AUS** (No-op, storage.js:569-575; `HELMUT_UNDERSTANDING_LOCK` leer) — verstärkt das Doppel-Kosten-Risiko (siehe `data-engine-map.md`).

---

## 5. Kosten-/Rate-Limit-Trennung pro Mandant ⚠️

- **`llm_usage`-Tabelle = 0 Zeilen — nicht genutzt.** LLM-Nutzung wird im Blob geloggt (`store.llmUsage`, storage.js:406-416). `canSpendLlm` prüft pro `politicianId`/Tag — aber `HELMUT_MAX_LLM_CALLS_PER_DAY` **Default = kein Limit (Infinity)** und Budget-Check **fail-open per Default** (`HELMUT_LLM_BUDGET_FAIL_CLOSED` leer). → **Standardmäßig KEINE per-Mandant-KI-Kostengrenze.** Ein Mandant (oder ein über alle Mandate loopender Cron) kann unbegrenzt KI-Kosten erzeugen. Kein globaler €-Cap, kein Aggregat/Alerting.
- **Office-Rate-Limit:** `HELMUT_OFFICE_DAILY_LIMIT` Default 10/Nutzer/Tag; **Cache pro `user+vorgang+channel`** (Composite-ID, storage.js:1106-1108) → **kein Cross-Tenant-Cache-Bleed**. Positiv.

---

## 6. Demo-Daten, PII, Provisioning

- **Demo-Profile in Produktion:** `<pilot-mandats-id>` (echter Pilot), **`<demo-mandant-b>`, `<demo-mandant-c>`** (Test/Demo). Vor Vertrieb entfernen (Datenhygiene, kein Sicherheitsproblem).
- **Modellname-Leak: bereits behoben** (Commit `8791b8a` — `/api/release/public` gibt nur neutralen Aktiv-Status).
- **Secrets im Log:** Debug-Endpunkte geben nur Boolean-`_set`-Flags aus, keine Werte. Timing-safe Secret-Vergleiche durchgängig. PII: Audit-Log speichert `ip`/`actorEmail`/`politicianId` (intern, akzeptabel); LLM-Log bewusst ohne PII.
- **Admin-Provisioning:** vollständig **manuell, admin-only** (`createUser`, accounts.js:154-197). Kein Self-Service-Signup. Für wenige Mandate ok; für skalierten Vertrieb Produktlücke (kein Sicherheitsproblem).

---

## 7. Gesamturteil je Reifegrad

**(a) Einzelpilot — sicher: JA.** Auth-Schicht solide, Cron fail-closed, kein Client-Key-Leak, Modellname-Leak behoben. Bei **einem** Mandant ist das RLS-Loch praktisch irrelevant. **Vorab-Fixes (nicht in diesem Sprint umgesetzt):** Demo-Profile löschen, `CRON_SECRET` gesetzt lassen, ein KI-Tageslimit setzen.

**(b) Mehrere Mandanten — riskant/bedingt.** Trennung funktioniert im Normalbetrieb (physisch getrennte Blob-Rows, profilgetriebenes Matching), ruht aber **ausschließlich auf App-Code-Disziplin**: Service-Role umgeht RLS, keine Policies, kein zentraler Tenant-Guard, optionale `userId`-Filter. **Ein vergessener Filter = Cross-Tenant-Leck politischer Daten ohne DB-Netz.** Nicht empfehlenswert für mehrere zahlende, konkurrierende Mandate ohne P0-Fixes.

**(c) Voller SaaS-Vertrieb — blockiert.** Blocker: **P0** fehlende RLS-Policies/Defense-in-Depth + latentes IDOR (optionale Filter); **P1** racige Blob-Locks (Lost-Update) + fehlende erzwungene KI-Kostengrenze. Dazu Demo-Daten in Prod und manuelles Provisioning. **Empfohlene Reihenfolge vor Vertrieb: `userId` verpflichtend + zentraler `withTenant()` → RLS-Policies → KI-Budget fail-closed → atomare Locks**, dann P2-Hygiene.

> **Master-Plan-Regel greift:** „Wenn ein kritisches RLS- oder Mandantentrennungsproblem gefunden wird, hat dieses Vorrang." → Das RLS-/Tenant-Thema ist der **erste** Umsetzungssprint (siehe `fix-plan.md`).

---

## 8. Grenzen / VERMUTUNG

- ENV-Werte (`HELMUT_MAX_LLM_CALLS_PER_DAY`, `HELMUT_LLM_BUDGET_FAIL_CLOSED`, `HELMUT_UNDERSTANDING_LOCK`, `HELMUT_ALLOW_QUERY_SECRETS`) sind read-only **nicht** direkt einsehbar; Aussagen basieren auf Code-Defaults + Prod-Signalen (`llm_usage=0`, `pipeline_locks=0`). Als **VERMUTUNG** markiert, wo nicht durch DB-Zustand belegt.
- Das latente IDOR ist **codeseitig** belegt (Default `userId=null` → ungefiltert), aber **kein aktiver HTTP-Exploit** heute (Auth bindet Tenant; Live-Aufrufer setzen `userId`). Bewertung daher „Defense-in-Depth-Blocker für Mehrmandanten/SaaS", nicht „aktiver Einzelpilot-Exploit".
