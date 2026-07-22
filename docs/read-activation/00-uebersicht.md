# Sprint 10 — Production Read Activation: Vorbereitungs-Dossier

**Stand:** 2026-07-22 · **Branch:** `claude/read-activation-prep-sprint10-q2ue60` ·
**Modus:** **ausschließlich dokumentarisch.** Keine Migration ausgeführt, keine RLS
aktiviert, kein JWT aktiviert, kein Secure Read Path scharf geschaltet, keine
Produktions-, Datenbank-, Secret- oder Credential-Änderung. Kein PR, kein Merge.

> **Zweck dieses Sprints (Auftrag):** *Nicht aktivieren. Nicht deployen. Nicht
> migrieren.* Baue ausschließlich die **vollständige Aktivierungsvorbereitung**, sodass
> jede Voraussetzung dokumentiert, vorbereitet und überprüfbar ist. Die eigentliche
> Aktivierung erfolgt später als **eigener Freigabeschritt.**

---

## 0. Was dieses Dossier ist — und was nicht

Dieses Verzeichnis (`docs/read-activation/`) ist die **Aktivierungs-Blaupause** für den
produktiven, DB-seitig erzwungenen Mandanten-Lesepfad („Secure Read Path"). Es ersetzt
**keine** frühere Entscheidung, sondern bündelt sie zu einem einzigen, ausführbaren Plan
mit Eintritts-/Abbruchkriterien, Rollback und Freigabepunkten.

Es ist **keine** Freigabe und **kein** Ausführungsauftrag. Jeder Schritt mit produktiver
Wirkung ist ausdrücklich als **freigabepflichtig** markiert und in diesem Sprint bewusst
**nicht** ausgeführt.

---

## 1. Ausgangslage (im Code verifiziert, Stand 2026-07-22)

| Fakt | Beleg |
|------|-------|
| Jeder DB-Zugriff läuft über **`service_role`** (BYPASSRLS). RLS wird umgangen. | `docs/quellenarchitektur/05-sicherheitsmodell-rls.md`; `storage.js` `supabaseRequest` |
| Die **23 RLS-Policies** (Migration `20260712_tenant_rls_policies.sql`) liegen in Production, sind aber **funktional inert**. | `docs/rls-activation-rollout.md` (Schritt 4 ✅) |
| Der selbst signierte **HS256-JWT-Pfad ist tot.** `tenantJwtModeEnabled()` gibt **hart `false`** zurück (Supabase auf asymmetrische Signing-Keys umgestellt). | `docs/multitenancy-jwt-signing-keys-umstellung.md`; `storage.js` Kommentar |
| Mandantentrennung heute = **ausschließlich App-seitige Guards** (`assertTenant`/`assertTenantRows`), adversarial getestet. | `docs/mandantentrennung-architektur.md` |
| Es gibt **keine** Read-only-Datenbankrolle. | Kein `create role` in `supabase/` |
| Es gibt **keinen** produktiven JWT-Read-Pfad und **keinen** Dark Launch. | Auftragslage |

**Kern-Konsequenz für die Architektur:** Weil die App **kein von PostgREST akzeptiertes
Token mehr selbst signieren kann**, ist der einzige *tragfähige* Weg zu einem echten,
DB-erzwungenen Lesepfad ein **von Supabase-Auth (GoTrue) mit dem aktiven asymmetrischen
Signing-Key ausgestelltes Token** — nicht ein App-generiertes HS256-Token. Diese
Blaupause ist entsprechend auf den **GoTrue-Weg (Option B aus
`docs/mandantentrennung-architektur.md`)** als Zielarchitektur ausgelegt und dokumentiert
die Alternativen (C: GUC-Rolle; D: Projekt-pro-Mandant) als Rückfalloptionen.

---

## 2. Dokumentenübersicht (eine Datei je Auftrag)

| Datei | Auftrag | Inhalt |
|-------|---------|--------|
| [`01-read-architektur-datenfluss.md`](01-read-architektur-datenfluss.md) | 1 | Endgültige Read-Architektur, vollständig expliziter Datenfluss Client→…→Antwort |
| [`02-rls-plan.md`](02-rls-plan.md) | 2 | RLS-Plan je Tabelle (RLS?/Read-Rolle/Write-Rolle/Policies/Claims/Rollback) |
| [`03-read-only-rolle.md`](03-read-only-rolle.md) | 3 | Read-only-Rolle: Rechte, verbotene Rechte, Grants, Revokes — je begründet |
| [`04-jwt-konzept.md`](04-jwt-konzept.md) | 4 | JWT-Konzept: Claims, Tenant-Claim, fehlend/ungültig, Rotation, Logout |
| [`05-aktivierungsplan-rollout.md`](05-aktivierungsplan-rollout.md) | 5 | Mehrstufiger Rollout Phase 0–5 mit Eintritts-/Abbruchkriterien, Rollback, Messgrößen |
| [`06-rollback.md`](06-rollback.md) | 6 | Minuten-Rollback auf Legacy-Read; Erhalt von Daten/Logs/Telemetrie |
| [`07-security-gate.md`](07-security-gate.md) | 7 | Security-Gate-Checkliste: kein Dark Launch ohne … |
| [`08-operations-runbook.md`](08-operations-runbook.md) | 8 | Operations-Runbook: Aktivierung/Monitoring/Fehlerfall/Rollback/Incident/Kommunikation/Recovery |
| [`09-risikoanalyse.md`](09-risikoanalyse.md) | 9 | Risikoanalyse: technisch/betrieblich/DSGVO/Mandantentrennung/Performance/Monitoring/Rollback/Rest |
| [`10-abschlussbericht.md`](10-abschlussbericht.md) | Abschluss | Sieben Abschlussfragen + Abnahmekriterien-Mapping |

Lies sie in dieser Reihenfolge; jede Datei ist für sich verständlich und verweist auf die
maßgeblichen Bestandsdokumente.

---

## 3. Begriffsklärung (damit kein Schritt implizit bleibt)

- **Legacy-Read:** der heutige, produktive Lesepfad über `service_role` (BYPASSRLS) mit
  App-seitigem `user_id=eq.<tenant>`-Filter. Läuft, ist getestet, bleibt bis zur
  vollständigen Aktivierung der **Default**.
- **Secure Read Path:** der vorbereitete, DB-seitig erzwungene Lesepfad
  (`authenticated` + tenant-scoped JWT + RLS). Heute **inert / fail-closed**.
- **Read-only Rolle:** eine **neue**, in diesem Sprint nur **entworfene** Postgres-Rolle
  **ohne BYPASSRLS** und **ohne Schreibrechte**, unter der der Secure Read Path liest.
- **Shadow Read:** paralleler Aufruf des Secure Read Path **neben** dem Legacy-Read, dessen
  Ergebnis **verworfen** und nur intern **verglichen** wird (kein Nutzereffekt).
- **Dark Launch:** Aktivierung des Secure Read Path für **echten** Nutzertraffic
  (zunächst Pilotmandant), erst nach bestandenem Security-Gate.
- **Cutover / Aktivierung:** der Schritt, ab dem der Secure Read Path den Legacy-Read als
  bedienenden Pfad **ersetzt**.

---

## 4. Sicherheitsrahmen dieses Sprints (Selbstkontrolle)

Dieser Sprint hält alle Auftragsregeln ein: **keine** Migration ausgeführt, **keine** RLS
aktiviert, **keine** DB-/Prod-/Secret-/Credential-Änderung, **keine** neuen Auth-Flows,
**kein** Ersatz bestehender Reads, **kein** Merge/PR. Sämtliche Änderungen sind reine
Markdown-Dokumente unter `docs/read-activation/`. Die Einhaltung der Abnahmekriterien ist in
[`10-abschlussbericht.md`](10-abschlussbericht.md) §Abnahme nachgewiesen.
