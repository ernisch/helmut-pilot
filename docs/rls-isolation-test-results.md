# RLS-Isolationstest — Ergebnisbericht

**Datum:** 2026-07-12 · **Status:** abgeschlossen, Testressource gelöscht ·
**Production:** RLS-Migration am 2026-07-12 **angewendet** (Nachtrag §7)

> **NACHTRAG (2026-07-12, Production):** Nach erfolgreichem Isolationstest wurde
> die Migration in Production angewendet — Details in **§7** am Ende dieses Dokuments.

Bezug: `supabase/migrations/20260712_tenant_rls_policies.sql` (getestete Datei,
**verbatim** angewendet), `docs/rls-tenant-policies-draft.md`,
`docs/rls-activation-rollout.md` (Schritt 3: isolierte Verifikation).

---

## 0. Kosten

| Posten | Betrag |
|---|---|
| Supabase Preview-Branch (ursprünglich geplant) | **nicht genutzt** — Branching erfordert **Pro-Plan (≈ 25 $/Monat)**, überschreitet das 10-€-Limit → Stop-Bedingung, Route verworfen |
| Stattdessen: lokale, ephemere Postgres-16-Kopie im Session-Container | **0,00 €** |
| **Gesamt** | **0,00 €** |

Der Test wurde auf einer **wegwerfbaren lokalen PostgreSQL-16-Instanz** im
Session-Container ausgeführt. Der Supabase-Auth-Mechanismus wurde **originalgetreu
nachgebaut**: `auth.jwt()` liest `current_setting('request.jwt.claims')`, Rollen
`authenticated`/`anon`/`service_role` (letztere mit `BYPASSRLS`) — exakt wie
Supabase/PostgREST pro Request setzt. Die Policy-Datei wurde **unverändert**
eingespielt. Keine externe kostenpflichtige Ressource, nichts an Production berührt.

---

## 1. Was getestet wurde

- **Zwei klar getrennte Testkunden:** `cust-A` (Kunde A) und `cust-B` (Kunde B),
  je eigener Datensatz über **alle** Tabellenklassen (Tenant-Tabellen, `helmut_store`,
  `llm_usage`, `profiles`, geteilte Daten, `pipeline_locks`).
- **Verbatim-Migration:** die produktiv vorbereitete Policy-Datei 1:1 angewendet.
  Ergebnis: **23 Policies auf 23 Tabellen**, RLS aktiv auf 24 Tabellen
  (23 mit Policy + `pipeline_locks` bewusst ohne Policy). **Keine anderen Tabellen,
  keine Datenzeile, keine Spalte verändert** (nur `CREATE POLICY` / `ALTER TABLE …
  ENABLE ROW LEVEL SECURITY`).
- **19 Prüfungen** (Lese-, Schreib-, Update-, Delete-, Rollen- und Claim-Fälle).

## 2. Konnte Kunde A die Daten von Kunde B sehen?

**Nein — in keinem einzigen Fall.**

| Prüfung | Ergebnis |
|---|---|
| A liest B's `decisions`/`office_outputs`/`briefings`/`matching_results`/`user_notes` | **0 Zeilen** (T2) |
| A liest B's Zeile direkt per ID (`dec-B`) | **unsichtbar, 0 Zeilen** (T3) |
| A liest B's `helmut_store`-Blob (`main-p-cust-B`) | **unsichtbar** (T5) |
| A liest B's `llm_usage` | **0 Zeilen** (T6) |
| A **ändert** B's Zeile (`UPDATE … WHERE id='dec-B'`) | **UPDATE 0** — B unverändert (T11) |
| A **löscht** B's Zeile (`DELETE … WHERE id='dec-B'`) | **DELETE 0** — B existiert weiter (T12) |
| A **fälscht** eine Zeile für B (`INSERT user_id='cust-B'`) | **blockiert** (with-check-Verletzung) (T10b) |

Symmetrisch geprüft: **Kunde B sah ebenfalls keine A-Daten** (T4).

## 3. Haben alle Regeln funktioniert?

**Ja — alle 19 Prüfungen bestanden (19/19 PASS).**

| # | Regel | Ergebnis |
|---|---|---|
| T1 | A sieht **eigene** Daten (nicht blockiert) | PASS |
| T2/T3 | Cross-Tenant-Lesen blockiert | PASS |
| T4 | Symmetrie B→A | PASS |
| T5 | `helmut_store`: nur `main-p-<tenant>`; `main` **und das hochsensible `main-auth`** unsichtbar | PASS |
| T6 | `llm_usage`: Tenant via `user_id` **oder** `politician_id` korrekt gescoped | PASS |
| T7 | `profiles`: Selbstzugriff nur eigene Zeile | PASS |
| T8 | Geteilte Daten (`knowledge_objects`/`raw_documents`/`sources`) für alle Mandanten **lesbar** | PASS |
| T9 | Geteilte Daten **nicht schreibbar** durch Mandanten (nur service_role) | PASS |
| T10a | Mandant darf **eigene** Zeile schreiben (`with check user_id=self`) | PASS |
| T10b | Mandant darf **keine Fremd-Zeile** schreiben | PASS |
| T11/T12 | Cross-Tenant Update/Delete = 0 Zeilen | PASS |
| T13 | `authenticated` **ohne** Claim → sieht nichts (impliziter Deny) | PASS |
| T14 | `anon` → sieht nichts (keine anon-Policy) | PASS |
| T15 | **service_role (Backend/System) sieht ALLES** — inkl. `main-auth`, alle Mandanten | PASS |
| T16 | `pipeline_locks`: `authenticated` → 0 (RLS an, 0 Policy) | PASS |
| T17 | Leerer Claim `user_id=""` → `nullif`-Schutz greift, 0 Zeilen | PASS |
| Backend | **service_role-Job schreibt für A UND B** (Matching/Briefing-Cron-Muster) | PASS |

**Kernaussage:** Die Policies isolieren die Mandanten vollständig, während der
**Backend-Systemzugriff (service_role) unverändert alle Mandanten** lesen und
schreiben kann — die laufenden Cron-Jobs/Pipelines bleiben also funktionsfähig.

## 4. Gefundene Probleme / Lücken

Keine **Sicherheitslücke** gefunden. Nennenswert (nicht sicherheitskritisch):

1. **Doku-Zählfehler (kosmetisch):** Der Kommentar am Ende der Migration
   (`…= 22 Policy-Zeilen`) nennt **22**; tatsächlich entstehen **23** Policies
   (17 `tenant_isolation` ALL + 1 `helmut_store` SELECT + 5 `shared_read`).
   Reine Fehlzählung im Kommentar, kein Verhaltensfehler. → optional korrigieren.
2. **Grenzen dieses Tests (bewusst, kein Mangel der Policies):**
   - Der Test prüft die **DB-Durchsetzung** der Policies unter dem echten
     Supabase-`auth.jwt()`-Mechanismus. Er prüft **nicht**, ob die App die JWTs
     korrekt **signiert/mintet** — das ist der separate Code-Pfad im JWT-Modus,
     abgedeckt durch `scripts/tenant-jwt-test.js` (37/37) und noch **nicht aktiv**.
   - `vector(256)`-Spalten wurden durch `text` ersetzt (für die Row-Level-Sichtbarkeit
     irrelevant); pgvector war lokal nicht verfügbar. Betrifft **keine** Policy.
   - Getestet auf synthetischen Zeilen, nicht auf Produktionsvolumen (Preview-Branch
     mit Prod-Daten war wegen Pro-Plan-Kosten ausgeschlossen).
3. **Bestätigt (keine Überraschung):** Solange die App den **service_role-Key**
   nutzt (BYPASSRLS), ist die Migration für den laufenden Betrieb ein **NO-OP**
   (T15) — RLS greift erst mit `HELMUT_TENANT_JWT_MODE=1`. Genau wie in
   `docs/rls-activation-rollout.md` beschrieben.

## 5. Testkopie gelöscht?

**Ja — vollständig.** Postgres-Instanz gestoppt, Datenverzeichnis
(`/home/pgtest/pgdata`) und alle Test-SQL-Dateien entfernt, Test-Systembenutzer
`pgtest` gelöscht. Es blieb **keine** kostenpflichtige oder persistente Ressource
zurück (die lokale Instanz war ohnehin ephemer und wird mit dem Container recycelt).
**Kein Supabase-Branch angelegt** (Pro-Plan-Wall) → nichts dort zu löschen.

## 6. Nächster echter Freigabepunkt

Der Test bestätigt die Policies. **Noch NICHT ausgeführt** (wie vereinbart):
**keine** Production-RLS-Migration, **keine** JWT-Modus-Aktivierung.

Der nächste freigabepflichtige Schritt ist die **Production-RLS-Migration**
(`supabase/migrations/20260712_tenant_rls_policies.sql` via `apply_migration`
auf `ddckuvvpcytqbyfmbvie`). Sie ist laut Test **funktional folgenlos**, solange
der JWT-Modus aus bleibt (service_role bypassed RLS), und schafft die
Defense-in-Depth-Grundlage. **Erst danach** — als eigener, letzter Freigabepunkt —
`HELMUT_TENANT_JWT_MODE=1` (echte Traffic-Umstellung auf die `authenticated`-Rolle).

---

## 7. NACHTRAG — Production-Migration angewendet (2026-07-12)

Nach 19/19 bestandenen Isolationstests wurde die Migration in Production
ausgeführt (Freigabe erteilt).

**Vorher (Baseline, verifiziert):** 0 Policies · 24 RLS-Tabellen · Helper-Fn
absent · App gesund (Briefing 1/54/1, Radar 20/10, Datenmotor V3 100 %, 0
Runtime-Errors).

**Ausführung:** `apply_migration` (Supabase, Projekt `ddckuvvpcytqbyfmbvie`),
**verbatim** die getestete Datei `20260712_tenant_rls_policies.sql`. Kein
manueller Deploy, keine Cron-, keine Secret-, keine Datenänderung.

**Nachher (verifiziert, alles grün):**
- DB: **23 Policies** (17 `tenant_isolation` ALL + 1 `helmut_store` SELECT + 5
  `shared_read`) · 24 RLS-Tabellen · Helper-Fn **present** — exakt wie getestet.
- `/api/release/public`: **byte-identisch** zum Baseline (Briefing 1/54/1,
  Quellenlinks 59/59, Radar 20/10, Datenmotor V3 100 %, Score 75 unverändert).
- `/api/app/start` → **401** (Auth-Gate intakt) · App-Shell `/` → **200**
  (Commit 204d5ef9).
- Pilot `<pilot-mandats-id>`: **52 decisions, 1 briefing, Store-Blob present, 217 KOs** —
  vollständig intakt (service_role liest alles).
- Vercel Runtime-Errors (1 h nach Migration): **keine**.

**Bewertung:** Funktional ein **NO-OP** für den laufenden Betrieb (die App nutzt
service_role, das RLS umgeht), wie entworfen. RLS ist jetzt als **zweite
Verteidigungslinie** aktiv und greift, sobald `HELMUT_TENANT_JWT_MODE=1` gesetzt
wird (noch **nicht** aktiviert — eigener Freigabepunkt).

**Rollback (jederzeit, folgenlos):** `20260712_tenant_rls_policies_rollback.sql`
via `apply_migration` → zurück auf 0 Policies (Ausgangszustand).

**Nächster echter Freigabepunkt:** `HELMUT_TENANT_JWT_MODE=1` (echte
Traffic-Umstellung auf die `authenticated`-Rolle) — bewusst noch offen.
