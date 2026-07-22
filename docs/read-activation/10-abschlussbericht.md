# Abschlussbericht — Sprint 10 Read Activation Preparation

**Stand:** 2026-07-22 · **Branch:** `claude/read-activation-prep-sprint10-q2ue60` ·
**Ergebnis:** vollständige Aktivierungsvorbereitung als Dokumentation. **Keine
Produktions-, Migrations-, RLS-, JWT-, Secret- oder Datenänderung.** Kein PR, kein Merge.

---

## Die sieben Abschlussfragen

### 1. Welche Voraussetzungen fehlen heute noch?

Für einen produktiven, DB-erzwungenen Secure Read Path fehlen (alle **Bau-/Freigabe**schritte,
nicht Teil dieses Sprints):

1. **Supabase-Auth-(GoTrue)-Token-Ausstellung** — je Mandant ein technischer Auth-Nutzer +
   Custom-Access-Token-Hook, der den Claim `user_id=<politicianId>` in das Token schreibt.
   (Selbstsignatur ist tot, PGRST301.)
2. **Read-only Rolle `helmut_reader`** — in Postgres angelegt, minimal gegrantet
   (`SELECT` auf 12 Tabellen, kein `BYPASSRLS`, kein Schreibrecht). Existiert heute nicht.
3. **Einengen der Supabase-Default-Grants** — `anon`/`authenticated`-CRUD-Grants revoken,
   damit die Read-only-Trennung real ist.
4. **App-Read-Zweig `tenantReadRequest`** — der fail-closed-Zweig, der GoTrue-Token +
   Reader-Rolle nutzt, hinter dem neuen Flag `HELMUT_READER_MODE` (Default `off`).
5. **Shadow-/Diff-Harnisch** — Reader-vs-Legacy-Vergleich (analog `sprint6:dryrun`).
6. **Monitoring/Alerts** — `reader_claim_mismatch`, PGRST301-Rate, Divergenz, Latenz.
7. **Betriebsvorbedingungen:** PITR aktiv (FA-7), Branch Protection (FA-11), DSB/Anwalt-
   Freigabe der Aktivierung (FA-9), Diagnose-Endpoint `/api/admin/reader-mode`.
8. **Bestandenes Security-Gate** (G1–G8) + schriftliche Freigabe.

### 2. Welche Voraussetzungen sind bereits erfüllt?

1. **RLS-Policies liegen in Production** (23 Policies, 24 RLS-Tabellen), inert und bereit.
2. **Helper `helmut_current_tenant()`** vorhanden (liest `user_id`-Claim, NULL ohne Claim).
3. **App-seitige Tenant-Guards** (`assertTenant`/`assertTenantRows`) aktiv, hart,
   adversarial getestet — die tragende Linie heute **und** die zweite Linie später.
4. **Transport-Weiche `tenantRequest`** existiert (heute inert, fällt auf service_role).
5. **Fail-closed-Semantik** bereits im Bestand (NULL-Tenant → 0 Zeilen; PGRST301 → Fallback).
6. **Rollback-Infrastruktur:** Policy-Rollback-Migration, Vercel Instant Rollback,
   Flag-basierter Rückweg.
7. **Testabdeckung:** `tenant-jwt`, `tenant-guard`, `cross-tenant-security`, `cache-isolation`,
   `rls-policy-simulation` (19/19), `privacy-authz`, `p1-security` — grün.
8. **Klarheit über den einzig gangbaren Weg** (GoTrue, nicht Selbstsignatur) —
   dokumentiert und in dieses Dossier eingearbeitet.

### 3. Was wäre der erste produktive Aktivierungsschritt?

**Der Shadow Read (Phase 1)** — nachdem GoTrue-Token, `helmut_reader`-Rolle und
`tenantReadRequest`-Zweig auf einer Preview gebaut und verifiziert sind: in Production
`HELMUT_READER_MODE=shadow` setzen + Redeploy. Der Reader läuft dann **parallel** zum
Legacy-Read, sein Ergebnis wird **verworfen** — **null Nutzerwirkung**, reine Beobachtung.
Das ist der erste Schritt mit produktiver Berührung, aber ohne produktive **Wirkung**. Der
erste Schritt mit Nutzerwirkung (Dark Launch, Phase 3) kommt erst nach Divergenz = 0 und
grünem Security-Gate.

### 4. Was wäre der letzte Rollback-Schritt?

Der **letzte** (tiefste, selten nötige) Rollback-Schritt ist die **Policy-Rücknahme**
(`20260712_tenant_rls_policies_rollback.sql`, S4) — funktional ein NO-OP, da service_role
RLS ohnehin umgeht. Der **wirksame** Rollback ist bereits der **erste** Schritt:
`HELMUT_READER_MODE=off` + Redeploy (S1, < 5 Min) stellt den vollständigen Legacy-Zustand
her. S3 (Rolle droppen) und S4 (Policies) sind nachgelagerte Aufräum-/Verdachtsschritte ohne
Betriebswirkung. Zusammengefasst: **erster Rollback-Schritt = Flag `off`; letzter =
Policies-Rollback**, dazwischen Rolle-Drop — alle ohne Datenverlust.

### 5. Welche Risiken bleiben bis zur Aktivierung?

- **Dominierendes Rest-Risiko:** Bis zur Aktivierung trennt **nur die App-Schicht** (RLS
  inert). Ein einziger vergessener Guard wäre ein IDOR, den die DB nicht abfängt. Getragen
  durch getestete Guards + CI, vertretbar **nur** im kontrollierten Wenig-Mandanten-Betrieb
  ohne offenen Verkauf.
- **Kein zweiter echter Mandant** ohne Freigabe der Architekturentscheidung A/B/C/D
  (`mandantentrennung-architektur.md`) — dieser Read-Plan setzt Option B (GoTrue) um.
- **Aufwandsrisiko** des GoTrue-Umbaus (Provisionierung, Refresh, Session-Kopplung) — hoch
  im Aufwand, niedrig im Betriebsrisiko (reine Vorbereitung, kein Prod-Code berührt).
- Details und Restwerte je Kategorie: [`09-risikoanalyse.md`](09-risikoanalyse.md).

### 6. Ist die Plattform nach diesem Sprint vollständig aktivierungsbereit?

**Nein — und das ist auftragsgemäß.** Der Auftrag war *Vorbereitung, nicht Aktivierung*.
Nach diesem Sprint ist die Plattform **planungs- und entscheidungsbereit**: jede
Voraussetzung ist dokumentiert, jeder Schritt hat Kriterien und Rückweg, das Security-Gate
steht. **Bau-bereit** wird sie erst, wenn die acht fehlenden Bausteine (Frage 1) umgesetzt
und die Gate-Punkte grün sind. **Aktivierungsbereit** (Dark Launch) ist sie nach bestandenem
Gate. Dieses Dossier ist die vollständige Landkarte dorthin — nicht der zurückgelegte Weg.

### 7. Welche Freigaben werden dafür später zwingend benötigt?

| # | Freigabe | Wer | Bezug |
|---|----------|-----|-------|
| F-A | Architekturentscheidung **B (GoTrue)** verbindlich wählen | Gründer | `mandantentrennung-architektur.md` |
| F-B | GoTrue-Nutzer-Provisionierung (echte Auth-Konten anlegen) | Gründer | berührt „neue Auth-Flows" |
| F-C | Neue Secrets/Config in Vercel (`HELMUT_READER_MODE`, ggf. Anon/Publishable-Key) | Betreiber | `freigabepunkte.md`-Muster |
| F-D | Read-only-Rolle + Grant-Revoke-Migration auf Production | Betreiber | `03-read-only-rolle.md` |
| F-E | Supabase Pro + PITR | Gründer | FA-7 |
| F-F | DSGVO/TOM/AVV-Freigabe der Aktivierung | DSB/Anwalt | FA-9 |
| F-G | Merge des Reader-Codes nach main (= Deployment) | Gründer | FA-10, Branch Protection FA-11 |
| F-H | „Go" je Rollout-Phase (Shadow→Vergleich→Pilot→mehrere→voll) | Gründer/Betreiber | `05-aktivierungsplan-rollout.md` |

---

## Abnahmekriterien — Nachweis

| Kriterium | Erfüllt? | Nachweis |
|-----------|----------|----------|
| keine Produktionsänderung erfolgt | ✅ | nur neue Dateien unter `docs/read-activation/`; kein Code/Config/Deploy berührt |
| keine Migration ausgeführt | ✅ | keine `apply_migration`/SQL-Ausführung; alle SQL-Blöcke als „NUR ENTWURF" markiert |
| keine RLS aktiviert | ✅ | RLS-Policies unverändert (Bestand aus `20260712`, inert) |
| kein JWT aktiviert | ✅ | `tenantJwtModeEnabled()` unangetastet (hart `false`); kein GoTrue-Nutzer, kein Secret |
| kein Secure Read Path aktiviert | ✅ | kein `HELMUT_READER_MODE`, kein `tenantReadRequest`, keine `helmut_reader`-Rolle angelegt |
| vollständiger Aktivierungsplan existiert | ✅ | [`05-aktivierungsplan-rollout.md`](05-aktivierungsplan-rollout.md) (Phase 0–5, je Kriterien) |
| vollständiger Rollbackplan existiert | ✅ | [`06-rollback.md`](06-rollback.md) (S0–S4, < 5 Min, Erhalt Daten/Logs/Telemetrie) |
| vollständiges Security-Gate existiert | ✅ | [`07-security-gate.md`](07-security-gate.md) (G1–G8 + B1–B4) |
| vollständiges Operations-Runbook existiert | ✅ | [`08-operations-runbook.md`](08-operations-runbook.md) (Aktivierung→Recovery) |
| alle Dokumente nachvollziehbar | ✅ | je Aussage Code-/Doku-Beleg; Datenfluss explizit; Übersicht in [`00-uebersicht.md`](00-uebersicht.md) |

**Fazit:** Alle Abnahmekriterien erfüllt. Der Sprint liefert die vollständige,
überprüfbare Aktivierungsvorbereitung ohne jede produktive Auswirkung. Die eigentliche
Aktivierung bleibt ein eigener, freigabepflichtiger Schritt.
