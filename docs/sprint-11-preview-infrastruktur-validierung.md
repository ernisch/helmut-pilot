# Sprint 11 — Preview-Infrastruktur-Validierung (Abschlussbericht)

**Datum:** 2026-07-22 · **Branch:** `claude/preview-infrastructure-validation-7wmc0e` ·
**Modus:** Erstmalige technische Validierung der Zielarchitektur in einer
**isolierten, wegwerfbaren Preview** — kein Pull Request, kein Merge, **kein
Production-Zugriff**.

> **Zielarchitektur (aus Sprint 10):**
> Supabase Auth (GoTrue) → Tenant Claims → **Read-only-Rolle** → **RLS** →
> **Secure Read Path**. HS256-JWT ist endgültig obsolet (asymmetrische
> Signing-Keys; Selbstsignatur-Pfad tot — `storage.js`, PR #68).

---

## 0. Sicherheitsrahmen (eingehalten)

| Regel | Nachweis |
|---|---|
| KEINE Production-Änderung / -DB / -Secrets / -RLS / -Credentials / -JWT | Es wurde **ausschließlich** eine lokale, ephemere Postgres-16 im Session-Container genutzt. Kein Supabase-MCP-Schreibaufruf, kein `apply_migration`, kein Vercel-Deploy, kein Zugriff auf `ddckuvvpcytqbyfmbvie`. |
| KEIN Deployment / Merge / Pull Request | Nur Commit + Push auf den Feature-Branch. |
| „Sobald eine Production-Ressource nötig wäre: STOPPEN." | An **einer** Stelle erreicht (echtes GoTrue/PostgREST) — dort **gestoppt und dokumentiert** (§Aufgabe 1, §10.8), statt zu improvisieren. |

Die genutzte Preview-Postgres wird nach jedem Lauf **vollständig gelöscht**
(`scripts/preview/run.sh`, Teardown-Trap). Es bleibt keine Ressource, kein
Secret, keine Kostenposition zurück (0,00 €).

---

## Aufgabe 1 — Preview-Umgebung: Existiert eine geeignete Umgebung?

**Kurz: Für die DB-Ebene JA (etabliertes Muster). Für die Auth-Ebene (echtes
GoTrue/PostgREST) NEIN — diese Infrastruktur fehlt und wurde NICHT improvisiert.**

### Geprüfte Optionen

| Option | Verfügbar? | Bewertung |
|---|---|---|
| **Supabase Preview-Branch** (`create_branch`) | **Nein** | Erfordert **Pro-Plan (~25 $/Monat)** → überschreitet das etablierte Kostenlimit, ist eine **Stop-Bedingung** (belegt in `docs/rls-isolation-test-results.md §0`) und leitet sich zudem vom **Production**-Projekt ab. Verworfen. |
| **Dediziertes Staging-Supabase-Projekt** | **Nein** | Existiert nicht; Anlegen wäre eine kostenpflichtige Cloud-Ressource + Provisionierungsaufwand. Nicht improvisiert. |
| **Lokale, ephemere Postgres-16 im Container** | **Ja** | **Bereits das freigegebene, dokumentierte Muster** dieses Projekts (`docs/rls-isolation-test-results.md`: 19/19, seither gelöscht). postgresql-16 + node sind im Container vorhanden. €0, vollständig isoliert, keine Production-Berührung. **→ verwendet.** |
| **Voller Supabase-Stack lokal (GoTrue + PostgREST + Kong via Docker)** | **Technisch denkbar, NICHT aufgesetzt** | Wäre eine improvisierte Auth-Infrastruktur. Der Auftrag verbietet Improvisation ausdrücklich; die Token-Ausstellung/-Verifikation gehört in eine **echte** Preview/Staging. **→ als fehlende Infrastruktur dokumentiert (unten).** |

### Verwendete Umgebung

Eine **wegwerfbare lokale Postgres-16**, die den Supabase/PostgREST-Mechanismus
**originalgetreu** nachbildet (`scripts/preview/00_bootstrap.sql`):
`auth.jwt()`/`auth.role()`/`auth.uid()` lesen `request.jwt.claims`; die Rollen
`anon`/`authenticated`/`service_role` (mit `BYPASSRLS`) verhalten sich exakt wie
in Supabase; pro „Request" eine frische Verbindung mit `SET LOCAL ROLE` +
gesetzten Claims. Die **echte** Migration `20260712_tenant_rls_policies.sql`
wird **verbatim** eingespielt.

Damit ist **DB-seitig vollständig und real** prüfbar: RLS, Read-only-Rolle,
Tenant-Isolation, Grants, Claim-Extraktion, Adversarial-Verhalten, Performance.

### Fehlende Infrastruktur (dokumentiert, NICHT improvisiert)

Für den **auth-seitigen** Teil der Zielarchitektur (GoTrue) fehlt eine geeignete
Umgebung. Konkret nicht validierbar ohne echtes GoTrue + PostgREST:

1. **Token-Ausstellung** durch GoTrue (Login → Access-/Refresh-Token, asymmetrisch signiert).
2. **Signaturprüfung** durch PostgREST gegen den aktiven JWKS-Key.
3. **`exp`/Replay/Timing**-Durchsetzung auf der Auth-Schicht (die DB prüft `exp` **nicht**).
4. **Rollen-Claim → DB-Rolle**-Mapping (`role: helmut_readonly` → PostgREST `SET ROLE`).

**Empfohlene fehlende Infrastruktur:** eine **echte, isolierte Staging-/Preview-
Supabase** (eigenes Projekt oder Pro-Preview-Branch) **oder** ein vollständiger
selbst-gehosteter Supabase-Stack (GoTrue + PostgREST + Kong) in einer
Staging-Umgebung. Beides ist ein **Freigabe-/Budget-Punkt** und wurde bewusst
nicht eigenmächtig geschaffen.

---

## Aufgaben 2–9 — Ergebnisse (alles gegen echte Postgres-16, alles grün)

Reproduzierbar mit **einem** Befehl: `npm run preview:validate`
(setzt Cluster auf → spielt alles ein → 5 Validatoren → Teardown).

| Aufgabe | Validator | Ergebnis |
|---|---|---|
| **2** GoTrue/Claims (DB-Teil) | `preview-db-validate.js` | ✅ Login/Claim/Tenant-Claim/ungültiger Claim/fehlender Claim — fail-closed |
| **3** Read-only-Rolle | `preview-db-validate.js` | ✅ nur SELECT; INSERT/UPDATE/DELETE/TRUNCATE/RPC → `42501`; NOBYPASSRLS |
| **4** RLS-Matrix | `preview-db-validate.js` | ✅ gleicher/falscher/fehlender/ungültiger Tenant + 3 parallele Mandanten |
| **5** Secure Read Path | `secure-read-validate.js` | ✅ Capability-/Tenant-Gate, Parameter-Allowlist, Read-only, Fail-Closed |
| **6** Shadow Read | `shadow-read-validate.js` | ✅ Legacy ∥ Secure: 0 Abweichungen, 0 Fehler, volle Coverage |
| **7** Rollback | `rollback-sim.js` | ✅ Aktivierung/Rollback/Reaktivierung/Fehlerfall — ohne manuellen Eingriff |
| **8** Adversarial Retest | `preview-db-validate.js` | ✅ JWT-/Claim-Manipulation, RLS-Bypass, Tenant-Wechsel, Service-Role-Eskalation |
| **9** Performance | `performance.js` | ✅ gemessen (RLS ~40–45 µs/Query, Claim ~20 µs/Call), keine Optimierung |

**Assertion-Summen:** DB 50/50 · Secure Read 17/17 · Shadow 4/4 · Rollback 13/13
· Performance (Messung + Isolation unter Parallelität stabil). **Gesamt: grün.**

### Adversarial-Details (Aufgabe 8)

- **JWT-/Claim-Injection:** `user_id = "mdb-a' OR '1'='1"` bzw. `"x'; drop table…"`
  → **0 Zeilen**, als Literal behandelt (Claim-Wert geht nie in den SQL-Text).
- **Gefälschter `role: service_role`-Claim:** die **DB-Rolle** bleibt
  `authenticated` (PostgREST/GoTrue entscheiden die Rolle, nicht der Client) →
  nur eigener Tenant sichtbar, `main-auth` unsichtbar. **Claim-Spoofing bypasst nicht.**
- **RLS-Bypass:** `authenticated` kann RLS **nicht** abschalten, keine eigene
  Policy anlegen, `pg_authid` (Passwort-Hashes) **nicht** lesen.
- **Service-Role-Eskalation:** readonly/authenticated erreichen weder
  `service_role`-only Daten (`pipeline_locks`, `main-auth`) noch RPC-Eskalation.
- **Tenant-Wechsel mid-Request:** Claims werden je Statement neu ausgewertet —
  kein Leck über den Wechsel.
- **Replay/Timing (GRENZE):** DB-seitig **nicht** durchsetzbar — `exp` wird von
  `auth.jwt()` nicht geprüft (das ist PostgREST/GoTrue). Bewusst als Grenze
  festgehalten (→ §10.8, P1).

---

## Gefundene & behobene Befunde (P0/P1) — durch echte Ausführung entdeckt

Die JS-Logiksimulation (`rls-policy-simulation-test.js`) hätte diese **nicht**
gefunden — sie zeigten sich erst gegen echte Postgres:

| # | Schwere | Befund | Korrektur |
|---|---|---|---|
| **B1** | **P1** | Die Read-only-Rolle konnte eine **SECURITY DEFINER**-RPC (`rpc_canary_all_office`) ausführen und damit **RLS umgehen** — weil Postgres `EXECUTE` per Default an **PUBLIC** vergibt; `revoke … from helmut_readonly` allein wirkt nicht. | `20260722_readonly_role.sql`: `revoke execute on all functions … from public` + explizite Allowlist. Verifiziert: RPC jetzt `42501`. |
| **B2** | **P1** | Eine benutzerdefinierte Rolle braucht **`USAGE` auf Schema `auth` + `EXECUTE` auf `auth.jwt()`** (Supabase gewährt das `authenticated` implizit). Ohne diese Grants scheitert **jeder** SELECT mit „permission denied for schema auth" (fail-closed, aber als Fehler statt leerer Menge). | Migration ergänzt die auth-Grants für `helmut_readonly`. |
| **B3** | **P2** | Der Rollback konnte die Rolle **nicht droppen** (`role … cannot be dropped, depends on privileges for schema auth`). | Rollback entzieht jetzt auch die auth-Schema-Rechte vor `DROP ROLE`; Zyklus verifiziert (da → weg → da). |
| **B4** | **P2 (kosmetisch, Vorbefund)** | Kommentar-Zählfehler „22 Policy-Zeilen" in `20260712` (tatsächlich 23) — hier erneut real bestätigt (23 authenticated-Policies). | Nur dokumentiert (fremde Datei nicht geändert). |

**Alle produktiven Befunde (B1–B3) betreffen ausschließlich den neuen,
NICHT-angewendeten Entwurf `20260722_readonly_role.sql`** — kein Bestandscode,
keine Production.

---

## Aufgabe 10 — Abschluss (eindeutige Antworten)

1. **Funktioniert die Zielarchitektur technisch?**
   **DB-seitig: ja, bewiesen.** Der Pfad *Claim → Read-only-Rolle → RLS → Secure
   Read Path* trägt gegen echte Postgres, inkl. Fail-Closed und Adversarial.
   **Auth-seitig (GoTrue-Token-Ausstellung/-Verifikation): unbewiesen** — fehlende
   Infrastruktur (§Aufgabe 1). Der Übergang Claim→Rolle ist die Nahtstelle, die
   nur mit echtem PostgREST/GoTrue schließbar ist.

2. **Greifen RLS und Tenant-Isolation korrekt?** **Ja.** 3 parallele Mandanten,
   alle Kreuzungen 0 Zeilen, `main-auth` (alle Logins) für jede Nicht-Service-
   Rolle unsichtbar, Cross-Tenant-Write/Update/Delete wirkungslos, `with check`
   verhindert Fremd-Inserts.

3. **Funktioniert die Read-only-Rolle?** **Ja.** Nur SELECT; INSERT/UPDATE/
   DELETE/TRUNCATE/RPC → `42501`; NOBYPASSRLS/NOLOGIN/NOSUPER; 0 Schreib-Grants;
   RLS greift trotz SELECT-Grant. **Zwei echte Härtungsbefunde (B1/B2) behoben.**

4. **Funktioniert GoTrue wie geplant?** **Nur der DB-konsumierte Teil ist
   validiert** (Claims korrekt extrahiert, fehlender/leerer/ungültiger Claim →
   fail-closed). **Die GoTrue-Kernfunktionen selbst — Login, Token-Ausstellung,
   Signatur-/`exp`-Prüfung — sind NICHT validiert** (keine GoTrue-Instanz). Offen.

5. **Ist der Secure Read Path einsatzbereit?** **Als Modul + Logik: ja**
   (`lib/helmut/secure-read.js`, 17/17, fail-closed, Injection-fest). **Als
   produktiv verdrahteter Pfad: nein** — er ist bewusst nur an die Preview
   gebunden; die PostgREST-/GoTrue-Anbindung fehlt (keine Produktivverdrahtung).

6. **Welche Probleme wurden gefunden?** B1 (RPC-RLS-Bypass via PUBLIC-EXECUTE),
   B2 (fehlende auth-Grants), B3 (asymmetrischer Rollback) — alle behoben. Plus
   die **Grenze**, dass Replay/`exp`/Signatur DB-seitig nicht durchsetzbar sind.

7. **Welche P0/P1 bestehen noch?**
   - **P0:** keine offen.
   - **P1-1:** **Kein Auth-Preview** → GoTrue-Token-Ausstellung/-Verifikation,
     `exp`/Replay, Rollen-Claim→DB-Rolle **unverifiziert**. Blocker für Dark Launch.
   - **P1-2:** **GoTrue-App-Integration fehlt vollständig** (Login/Session/
     Token-Mint/-Attach; Option B aus `mandantentrennung-architektur.md` ungebaut).
   - **P1-3:** **`helmut_store`-Schreibpfade** bleiben `service_role` (dokumentierte
     Lücke D) — Read ist per Präfix-Policy abgesichert, Write-Umbau steht aus.
   - **P1-4 (Betrieb):** Nach `revoke execute … from public` müssen **legitime
     RPCs** (z. B. `match_knowledge_objects`) explizit re-granted werden, sonst
     stiller Bruch.

8. **Was fehlt bis zum ersten echten Dark Launch?**
   1. **Isolierte Auth-Preview/Staging** (echtes GoTrue + PostgREST) und dort
      Wiederholung der Aufgaben 2/4/8 **mit echten Tokens** (Signatur, `exp`,
      Replay, Rollen-Mapping).
   2. **App-seitige GoTrue-Integration**: Provisionierung je Mandant,
      Login/Session-Kopplung an das bestehende scrypt-Konto, Token-Mint mit
      `role: helmut_readonly` + `user_id`-Claim, Refresh.
   3. **Secure Read Path an PostgREST verdrahten** (Executor gegen `/rest/v1`
      mit dem readonly-Token) + Live-Smoke gegen den Piloten.
   4. **RPC-Allowlist** für Production festlegen (Folge aus B1).
   5. **Per-Mandant-Rollout-Schalter** (heute nur globales Flag) für schrittweisen
      Dark Launch.
   6. `helmut_store`-Write-Pfad-Umbau (Lücke D) — vor breiterem Mehrmandantenbetrieb.

---

## Abnahmekriterien

| Kriterium | Status | Beleg |
|---|---|---|
| ausschließlich Preview verwendet | ✅ | ephemere lokale Postgres, Teardown; kein Prod-Aufruf |
| keinerlei Production berührt | ✅ | kein `apply_migration`/Deploy/Secret |
| GoTrue validiert | ⚠️ **teilweise** | DB-konsumierter Claim-Teil ja; Token-Ausstellung/-Verifikation nein (fehlende Infra, dokumentiert) |
| RLS validiert | ✅ | 50/50, 3 parallele Mandanten, echte Postgres |
| Read-only-Rolle validiert | ✅ | nur SELECT, 2 Härtungsbefunde behoben |
| Secure Read Path validiert | ✅ | 17/17, 5 Gates, fail-closed |
| Shadow Read funktioniert | ✅ | 0 Abweichungen, volle Coverage |
| Rollback funktioniert | ✅ | 13/13, ohne manuellen Eingriff |
| Security-Retest bestanden | ✅ | Adversarial 8er-Block grün |
| Performance dokumentiert | ✅ | RLS ~40–45 µs/Query, Claim ~20 µs, Isolation unter Parallelität |

**Netto:** Die Zielarchitektur ist **DB-seitig erstmals real bewiesen** und um
zwei echte Härtungen reifer. Der **einzige** verbleibende Blocker bis Dark Launch
ist eine **echte Auth-Preview (GoTrue/PostgREST)** plus die App-Integration —
beides Freigabe-/Budget-Punkte, die dieser Sprint bewusst **nicht** eigenmächtig
geschaffen hat.

---

## Artefakte

- `scripts/preview/` — Bootstrap, Schema, Seed, 5 Validatoren, `run.sh`, `README.md`.
- `lib/helmut/secure-read.js` — Secure-Read-Path-Modul (transport-agnostisch, fail-closed).
- `supabase/migrations/20260722_readonly_role.sql` (+ Rollback) — **Entwurf**, NICHT auf Production angewendet.
- `npm run preview:validate` — reproduzierbarer End-to-End-Lauf (ephemer).
