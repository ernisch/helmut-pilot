# Aufgabe 7 — Security Gate

**Regel:** **Kein Dark Launch** (Phase 3, erster Live-Reader-Mandant) ohne dass **jeder**
Punkt dieser Checkliste nachweislich erfüllt ist. Das Gate ist eine **harte
Vorbedingung** — ein einziger offener Punkt = No-Go.

> Jeder Punkt braucht einen **überprüfbaren Nachweis** (Testlauf, Reviewprotokoll,
> Migrations-/Rollen-ID, Screenshot). „Sieht gut aus" zählt nicht. Verantwortliche und
> Datum werden je Zeile eingetragen.

---

## 1. Gate-Checkliste

| # | Kriterium | Nachweis (Soll) | Status | Verantwortlich | Datum |
|---|-----------|-----------------|--------|----------------|-------|
| G1 | **RLS geprüft** | Auf Preview-Branch: alle 24 Tabellen RLS-enabled; 23 Policies vorhanden; `helmut_current_tenant()` liefert NULL ohne Claim; Isolationsprobe A/B (Mandant-A-Token sieht 0 B-Zeilen, `main-auth`/`main`/`pipeline_locks` = 0); `get_advisors(security)` ohne neue WARN/ERROR. | ☐ | | |
| G2 | **Read-only Rolle geprüft** | `pg_roles`: `helmut_reader` `rolsuper=f`, `rolbypassrls=f`, `rolcanlogin=f`; `role_table_grants`: ausschließlich `SELECT`, nur auf den 12 freigegebenen Tabellen; Schreibversuch der Rolle → DB-Fehler; kein Grant auf `main-auth`/`pipeline_locks`. | ☐ | | |
| G3 | **Pen-Test bestanden** | Adversariale Prüfung: manipulierter/fehlender/abgelaufener `user_id`-Claim → 0 Fremdzeilen; fremder Tenant-Claim → Schnittmenge leer; `anon`-Token → Deny; kein Pfad, der service_role bei Reader-Fehler still einspringt. Bericht mit Befunden + Behebung. | ☐ | | |
| G4 | **DSGVO-Review bestanden** | Claims enthalten keine personenbezogenen Daten (nur pseudonyme `politicianId`); TOM aktualisiert („DB-seitige Trennung in/nach Aktivierung"); Datenfluss/AVV (GoTrue = Auftragsverarbeiter Supabase, bereits im Bestand) geprüft; DSB/Anwalt-Freigabe der Aktivierung (vgl. FA-9). | ☐ | | |
| G5 | **Code-Review bestanden** | Unabhängiger Review des `tenantReadRequest`-Zweigs, der GoTrue-Token-Beschaffung, des Refresh-Handlings und des fail-closed-Verhaltens; kein Fallback auf service_role im Reader-Zweig; Secrets nie im Client/Repo. | ☐ | | |
| G6 | **Rollback getestet** | Auf Preview/Staging: `HELMUT_READER_MODE=off`+Redeploy stellt Legacy in < 5 Min her (belegt); Vercel Instant Rollback erprobt; Log-/Telemetrie-Erhalt bestätigt ([`06-…`](06-rollback.md)). Übung ≤ 30 Tage alt. | ☐ | | |
| G7 | **Shadow erfolgreich** | Phase 1+2 ≥ 7 Tage: Shadow-Erfolgsrate > 99 %, **Divergenz = 0** (Reader- vs. Legacy-Ergebnis für den Piloten byte-/zahlengleich), keine Cross-Tenant-Sichtung in Stichproben. | ☐ | | |
| G8 | **Coverage unverändert oder besser** | Testabdeckung ≥ Stand vor dem Reader-Umbau; neue Tests für Reader-Pfad/Rolle/Claim-Fehlerfälle ergänzt; CI-Gate (`.github/workflows/ci.yml`) grün; keine deaktivierten/übersprungenen Bestands-Suiten. | ☐ | | |

---

## 2. Ergänzende (nicht optionale) Betriebsvorbedingungen

Diese sind **zusätzlich** zu G1–G8 zu erfüllen, bevor Phase 3 startet:

| # | Vorbedingung | Grund |
|---|--------------|-------|
| B1 | **Backup/PITR aktiv** (Supabase Pro, FA-7) | Ohne Point-in-Time-Recovery kein sicherer Live-Schritt an der Zugriffsschicht. |
| B2 | **Branch Protection aktiv** (FA-11) | Kein ungeprüfter Merge des Reader-Codes nach main. |
| B3 | **Monitoring/Alerts scharf** | `reader_claim_mismatch`, PGRST301-Rate, Divergenz, Latenz-Regression müssen alarmieren (siehe [`08-…`](08-operations-runbook.md) §Monitoring). |
| B4 | **Freigabepunkt dokumentiert** | Gründer-/Betreiber-Freigabe „Go Dark Launch Pilotmandant" schriftlich (analog `docs/freigabepunkte.md`). |

---

## 3. Mapping der Kriterien auf vorhandene Nachweismittel

| Kriterium | Bereits vorhandenes Mittel | Noch zu schaffen |
|-----------|----------------------------|------------------|
| G1 RLS | `scripts/rls-policy-simulation-test.js` (19/19, Prädikatlogik); `docs/rls-isolation-test-results.md` (echter PG, 19/19) | Isolationsprobe **mit `helmut_reader`-Rolle** (Grant-Ebene), nicht nur `authenticated` |
| G2 Rolle | — | Rolle existiert noch nicht → Preview-Anlage + Grant-Audit |
| G3 Pen-Test | `scripts/tenant-jwt-test.js`, `scripts/cross-tenant-security-test.js`, `scripts/tenant-guard-test.js` | Adversarial-Lauf gegen den **echten** GoTrue+RLS-Pfad (nicht nur Offline-Mock) |
| G4 DSGVO | `docs/recht/` (Entwürfe, FA-9); Claim-Minimierung dokumentiert (`04-…`) | verbindliche DSB/Anwalt-Freigabe |
| G5 Code-Review | CI-Gate; bestehende Review-Praxis | Review des neuen Reader-Zweigs |
| G6 Rollback | `06-rollback.md` (Plan); Vercel Instant Rollback (Bestand) | tatsächliche Übung auf Staging |
| G7 Shadow | `npm run sprint6:dryrun` als Vorbild eines Diff-Harnischs | Reader-vs-Legacy-Diff-Harnisch |
| G8 Coverage | `audit/qa-strategy.md`; volle Offline-Suite | Reader-spezifische Tests |

---

## 4. Gate-Entscheidung

- **Alle** G1–G8 **und** B1–B4 grün + schriftliche Freigabe → **Go** für Phase 3
  (Dark Launch Pilotmandant).
- **Ein** offener/roter Punkt → **No-Go**; Phase bleibt bei Shadow (Phase 1/2).
- Das Gate wird **vor jeder** Ausweitung (Phase 4) und vor der vollständigen Aktivierung
  (Phase 5) **erneut** bestätigt — es ist kein einmaliger Stempel.
