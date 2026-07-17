# Cache-Trennung & KI-Budget pro Kunde (Phase 9-10)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Tests:** `scripts/cache-isolation-test.js` (10/10) · `scripts/llm-budget-test.js` (22/22)

---

## Phase 9: Cache-Trennung (verifiziert)

| Cache | Schlüssel | Mandantentrennung |
|---|---|---|
| Lage-/Briefing-Cache | `bf-<userId>-<slot>-<tag>` (`briefings`-Tabelle) | ✅ Mandanten-ID im Schlüssel; tenant-scoped Read über `getRenderedBriefingV3` → `tenantRequest` (RLS im JWT-Modus) |
| Büro-Output-Cache | `office-<userId>-<vorgangId>-<channel>` | ✅ Composite mit Mandanten-ID; kein Cross-Tenant-Bleed |
| Radar/Helmut/Büro-State | pro Profil aus den tenant-gescopten Reads (decisions/KOs personalisiert) | ✅ kein geteilter State |
| Service-Worker-Cache (`sw.js`) | cached **nur** statische Assets (style/script/image/font) | ✅ **keine** API-/Profildaten im SW-Cache — API + POST gehen immer direkt ans Netz |
| Server-Cache | keine geteilte In-Memory-Profil-Cache-Schicht über Requests | ✅ jeder Request löst frisch auf |

**Bewiesen (Test):**
- Der Pilotmandant und ein zweiter Mandant haben am selben Tag **verschiedene** Cache-Keys.
- Ein neuer Kunde startet mit einem **eigenen, leeren** Namespace — **nicht** mit dem Cache des Pilotmandanten.
- Ein leerer/vergessener `userId` erzeugt keinen Schlüssel, der einen echten Mandanten trifft.
- Der Büro-Cache trennt zusätzlich nach Vorgang + Kanal (keine Kollision innerhalb eines Mandanten).

**Ein Cache-Fehler bei Kunde A beeinflusst Kunde B nicht:** die Reads sind pro
`userId` getrennt; ein fehlender/veralteter Cache-Eintrag von A führt nur zu einer
Neuberechnung für A, nie zu einem Treffer auf B.

**Race Conditions / verlorene Updates:** der `briefings`-Cache ist idempotent
(deterministische id, generate-if-missing); der racige Blob-Lock (`store.pipelineLocks`)
bleibt ein bekannter, separater P2-Punkt aus `audit/saas-risk-matrix.md` #3 — er
betrifft die Crawl-/Understanding-Läufe (mandantenlos), nicht die per-Mandant-Caches.

---

## Phase 10: KI-Budget pro Kunde

**Einfach erklärt:** Jeder Kunde bekommt ein eigenes KI-Budget (Tag + Monat). Ein
Kunde darf nicht das gesamte Helmut-Budget verbrauchen. Fast erreicht → Warnung;
überschritten → harter Stopp; Status unbekannt → lieber stoppen (fail-closed).

### Modul `lib/helmut/llm-budget.js` (`evaluateTenantBudget`)

Reine Entscheidungslogik. Eingabe: Tages-/Monatsbudget (Cent, aus dem Profil) +
bisher verbrauchte Kosten (aus dem `llm_usage`-Log). Ausgabe: `allowed` / `warn` /
`reason` / Restbudget.

| Fall | Verhalten |
|---|---|
| kein Budget gesetzt | inert (nur der globale Deckel greift) — bestehendes Verhalten unverändert |
| Verbrauch < 80 % | erlaubt, keine Warnung |
| Verbrauch ≥ 80 % (Tag oder Monat) | erlaubt, **Warnung** (`tenant-budget-warning`) |
| Tagesbudget erreicht/überschritten | **Stopp** (`tenant-daily-budget-reached`) |
| Monatsbudget erreicht/überschritten | **Stopp** (`tenant-monthly-budget-reached`) |
| Budget gesetzt, Kostenstatus unbekannt | **Stopp** (`...-fail-closed`) |

### Anbindung `storage.canSpendLlmForTenant`

Kombiniert den **globalen** Call-Count-Deckel (`canSpendLlm`, mandantenlos, env)
mit dem **per-Profil-EUR-Deckel** (Tag + Monat). Beide müssen „allowed" sein.
Rückwärtskompatibel: ohne Profil-Budget identisch zu `canSpendLlm`.

### Wo greift es?

- **Lage-Narrativ** (`lage.js`, ein **Pro-Mandant**-KI-Call): nutzt jetzt
  `canSpendLlmForTenant(userId, {profil-budget})`. Ohne Profil-Budget = wie zuvor.
- **Understanding** (`understanding.js`) bleibt bewusst auf dem **globalen**
  `canSpendLlm(null)` — es ist **mandantenlos** (1 Call pro Vorgang für alle
  Kunden) und darf keinem einzelnen Mandanten in Rechnung gestellt werden. So sind
  interne Systemjobs klar von den Kundenkosten getrennt.

### Kosten je Funktion / je Profil

Das `llm_usage`-Log trägt `callType` (Funktion) und `politicianId`/`userId`
(Profil) → Kosten sind je Funktion **und** je Profil auswertbar. Die Admin-
Profilkarte (Phase 4) zeigt „KI-Kosten heute" + „KI-Budget/Tag" + „KI-Budget/Monat"
pro Profil. Im normalen Abgeordneten-Bereich sind **keine** internen Kosten sichtbar
(nur im Admin).

### Währungshinweis (bewusst)

Das Log schätzt Kosten in USD, das Profil-Budget ist in EUR-Cent. Für diesen
**Sicherheitsdeckel** (Ziel: Runaway-Kosten verhindern, keine centgenaue Abrechnung)
werden USD und EUR als gleichwertig behandelt — die ~10 % Wechselkurs-Differenz ist
für einen Schutzdeckel irrelevant und bewusst konservativ (der Deckel greift eher
etwas früher). Für echte Abrechnung wäre eine Umrechnung zu ergänzen.

### Was NICHT geändert wurde (Freigabepunkte)

- **Keine Env-Änderung:** `HELMUT_MAX_LLM_CALLS_PER_DAY` /
  `HELMUT_LLM_BUDGET_FAIL_CLOSED` bleiben unangetastet (Secret-/Env-Änderung =
  Stop-Bedingung). Der per-Profil-Deckel ist **Daten** (Profilfeld), kein Env — er
  ist sofort ohne Env-Änderung wirksam, sobald ein Admin ein Budget setzt.
- **Backfill getrennt vom Tagesbudget:** der bestehende KO-Backfill-Endpoint hat
  seinen eigenen 5-€-Deckel + `bypassBudget` (PR #57) — der per-Profil-Deckel
  betrifft ihn nicht (Backfill ist mandantenlos).
