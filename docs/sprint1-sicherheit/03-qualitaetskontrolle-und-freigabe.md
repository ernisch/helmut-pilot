# Sprint 1 — Qualitätskontrolle & Freigabeschritte

**Stand:** 2026-07-16. Basis: alle Änderungen dieses Sprints, volle Offline-Suite
**120/120 grün** (117 vorbestehend + 3 neu). Kein Production-Eingriff.

## Teil 7 — Qualitätskontrolle (10 Fragen)

| # | Frage | Antwort (belegt) |
|---|---|---|
| 1 | Nutzerbezogene Tabellen ohne Mandantenschutz? | **Nein.** Alle `user_id`-Tabellen tragen RLS-Policy (Backstop) UND App-Guard (durchsetzend). Die 7 latenten Blob-Leser sind gehärtet; `getStoreSummary`/Watchdog sind dokumentierte, bewusste Global-/Telemetrie-Pfade. |
| 2 | service_role-Zugriffe ohne ausdrückliche Validierung? | **Nur bewusst mandantenlose** (Korpus/Konfig/Telemetrie/Locks/Budget). Tenant-Pfade validieren app-seitig vor dem Bypass. `main-auth`-Blob bleibt dokumentierte Restlücke (Folgeschritt). |
| 3 | Endpunkte mit frei übergebbarer user_id? | **Nein** für reguläre Nutzer (`pickPoliticianId` validiert gegen Session). Admin/Cron/Debug nur secret-/rollen-gated (Betreiber, by design). |
| 4 | Globale Cache-Schlüssel für nutzerbezogene Inhalte? | **Nein** (verifiziert durch `cache-isolation-test`: `bf-<userId>-…`, `office-<user>-…` tragen die Mandanten-ID). |
| 5 | Können Cron-Prozesse versehentlich nur den Pilotmandanten bedienen? | **Ja, per Default** (session-loser Fallback auf das damals hartkodierte Pilotprofil; Matching/Decisions nur für den Pilotmandanten). **Dokumentiert als Freigabepunkt** (Cron-Umbau, nicht in Sprint 1 — kein Cron-/Zeit-Eingriff ohne Freigabe; inzwischen umgesetzt: Mandate aus der DB, siehe `docs/multitenancy-pilot-neutralisierung.md`). |
| 6 | Können Briefings/Decisions/Matchings überschrieben werden? | Schreibpfade sind per-Mandant-gescoped; Cross-Tenant-Batch jetzt blockiert. Blob-Last-Write-Wins bleibt ein bekanntes, separat adressiertes Thema (atomare Locks vorhanden, Flag AUS). |
| 7 | Sind alle Migrationen rückrollbar? | **Ja.** Die neue Härtungs-Migration (20260721) hat Rollback + Runbook + statischen Symmetrie-Test. |
| 8 | Sensible Werte aus Logs/Fehlermeldungen entfernt? | Kostenlog trägt keine PII/Inhalte; per-Mandant-Limits (JSON) enthalten nur IDs+Zahlen; `redactSensitive` auf systemErrors (vorbestehend, geprüft). |
| 9 | Kompatibel mit dem bestehenden Datenmotor? | **Ja.** Alle Änderungen additiv/Default-AUS; Understanding/Backfills als geteilte Calls korrekt vom per-Mandant-Deckel ausgenommen; volle Suite grün. |
| 10 | Neue unnötige Komplexität? | Minimiert: per-Mandant-Deckel nutzt die **vorhandene** SQL-Funktion (keine neue Migration); Guard-Härtung folgt dem bestehenden `assertTenant`-Muster; keine neue Abhängigkeit (`dependencies: {}` bleibt). |

## Akzeptanzkriterien (10)

| # | Kriterium | Status |
|---|---|---|
| 1 | Alle nutzerbezogenen Datenpfade inventarisiert | ✅ `01-zugriffsmatrix.md` |
| 2 | Zielarchitektur dokumentiert | ✅ `02-zielarchitektur.md` |
| 3 | Sämtlicher sicher ausführbarer Code umgesetzt | ✅ Guards, Kostendeckel, Provisioning |
| 4 | Migrationen inkl. Rollback vorbereitet | ✅ 20260721 (+ Rollback + Runbook) |
| 5 | Zwei Testmandanten vollständig getrennt | ✅ `provision-tenant-test` (A/B getrennt) + `cross-tenant-security-test` |
| 6 | Provisionierung vollständig getestet | ✅ 30 Checks (idempotent, Rollback, Schutz, Deaktivierung) |
| 7 | Kostendeckel je Mandant atomar | ✅ `tenant-llm-cap-test` (31 Checks) |
| 8 | Alle Tests grün | ✅ 120/120 Offline-Suiten |
| 9 | Keine bekannte kritische Cross-Tenant-Lücke verbleibt | ✅ negativer Sicherheitstest grün; offene Punkte sind dokumentierte Freigabeschritte |
| 10 | Pilotmandant nicht beeinträchtigt | ✅ Default-AUS/additiv; Pilot-Pfade grün; bestehende Mandanten (Pilot + Demo) über den datengetriebenen Provisionierungs-Schutz (`provisionedBy`-Marker) hart geschützt |

## Neue/erweiterte Tests

| Test | Checks | Deckt ab |
|---|---|---|
| `tenant-llm-cap-test.js` | 31 | Tageslimit je Mandant exakt, Parallelität, globaler Zusatzdeckel, kein Aushungern, fail-closed, geteilte Calls, Konfig-Präzedenz (Anf. 14-17, 8) |
| `cross-tenant-security-test.js` | 43 | negativer Sicherheitstest: A↛B lesen, Kontext-Guards, Cross-Tenant-Write blockiert, Auth-Grenze (Anf. c/d/e/2/3) |
| `provision-tenant-test.js` | 30 | Provisionierung idempotent, halber-Account-Rollback, Schutz echter Mandanten, Deaktivierungs-/Teardown-Isolation (Anf. h/i) |
| `security-hardening-sql-test.js` | 26 | Migration/Rollback-Symmetrie, additiv, freigabepflichtig |

Bestehende Deckung (unverändert grün): `llm-budget` (l/n/o), `llm-reservation`/
`budget-rollout` (m global), `drei-profile-e2e` (getrennte Decisions/Matching/Lage,
Pilotprofil intakt), `mandantentrennung`/`tenant-guard` (a/b/e), `cache-isolation` (b),
`p1-security-check` (d live).

## Adversariale Review (durchgeführt) — gefunden & behoben

Eine adversariale Mehr-Linsen-Review der Kernänderungen fand **0** Regressionen in
der Guard-Härtung und folgende echte Bugs, die **alle behoben + negativ getestet** sind:

| Fund | Schwere | Behebung |
|---|---|---|
| `provisionTenant` übernahm/degradierte ein bestehendes Admin-/Referent-Konto mit gleicher E-Mail (politicianId=null → Konfliktprüfung verfehlt) | **hoch** | Konfliktprüfung: E-Mail nur bei exakt gleicher (E-Mail, id)-Paarung übernehmen; sonst Abbruch `email-belongs-to-other-account`. Test: Admin bleibt Admin. |
| `teardownTenant` löschte über `deleteProfileData` geteilte Personen-/News-Rohdaten **fremder** Mandanten (inkl. des Pilotmandanten) mit | **hoch** | Neue, strikt gescopte `storage.deleteTenantScopedData` (nur explizit eigene rawItems, kein person/news/term-Match). Test: fremdes Personen-Rohitem überlebt. |
| Lokaler Mandanten-Zähler verdrängte einen HEUTE aktiven, ausgeschöpften Mandanten (Cap-Umgehung im Datei-Modus) | mittel | Eviction nur für Zähler **früherer Tage**. Test: ausgeschöpfter Mandant bleibt gedeckelt trotz 9 weiterer. |
| Rollback entfernt dangling Fremd-Zuweisungen zur id | niedrig | dokumentiert (akzeptierter Randfall: Verweis auf ein Mandat, dessen Anlage scheiterte). |

## Zweite adversariale Gegenprüfung (Rollout-Vorbereitung)

Eine unabhängige zweite Gegenprüfung (Fix-Verifikation + 14 Sicherheitsfragen) bestätigte:
die drei Review-Fixes sind **korrekt und ohne neue Fehler**; keine konkrete Cross-Tenant-
Lücke. Daraus behoben/dokumentiert:

| Fund | Status |
|---|---|
| E-Mails im Provisionierungs-Protokoll (PII in stdout/log) | **behoben** — `maskEmail` maskiert den lokalen Teil (Domain + 1 Zeichen bleiben); Passwörter waren nie im Log. Test in `provision-tenant-test`. |
| Teardown-Main-Store-Write ohne Verifikations-/Retry-Pass (last-write-wins-Race) | **dokumentiert, vorbestehend** — identisches Muster wie `deleteProfileData` und jeder Main-Store-Write; für per `provisionTenant` angelegte Mandanten nicht erreichbar (Laufzeit-Writes gehen in den `p-<id>`-Store). Nicht Fix-induziert. |
| „Profil ohne Konto"-Lücke der Konfliktprüfung | **dokumentiert, vorbestehend** — nur über das Admin-CLI erreichbar (kein HTTP), Bedienfehler-Risiko, keine Remote-Übernahme. |
| Budget-Telemetrie-Leser (`getLlmUsage`/`…Today`/`canSpendLlm`) aggregieren bei `null` global | **dokumentiert** — Bestandscode, Admin-Aggregation (keine Fremd-Inhalte), gleiche Kategorie wie `getStoreSummary`-Ausnahme. |
| Blob-`save*`-Pfade vertrauen dem session-aufgelösten Aufrufer | **dokumentiert, vorbestehend** — Server löst den Mandanten immer serverseitig auf; interne/Cron-Aufrufer übergeben eine aufgelöste id. |

## Verbleibende Freigabeschritte (Production) — je Schritt: Zweck · Risiko · Rollback · Freigabe

### F1 — Per-Mandant-Kostendeckel scharf schalten
- **Zweck:** atomaren Tagesdeckel je Mandant aktiv durchsetzen.
- **Schritt:** `HELMUT_TENANT_LLM_CAP=1` (+ optional `HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY`
  / `HELMUT_TENANT_LLM_LIMITS`). Nutzt die bereits eingespielte SQL-Funktion.
- **Risiko:** ein zu niedriges Limit drosselt echte Mandanten (den Pilotmandanten).
  Empfehlung: das Limit des Pilotmandanten hoch/uneingeschränkt setzen, ehe scharf
  geschaltet wird.
- **Rollback:** `HELMUT_TENANT_LLM_CAP` leeren → sofort byte-identisches Altverhalten.
- **Benötigte Freigabe:** Env-/Flag-Änderung in Production.

### F2 — Security-Advisor-Härtungs-Migration anwenden
- **Zweck:** offene Advisor-Punkte schließen (search_path ×5, REVOKEs).
- **Schritt:** `20260721_security_advisor_hardening.sql` manuell einspielen (Runbook).
- **Risiko:** minimal (nur Grants/search_path; App nutzt service_role → unberührt).
  Vorher auf Supabase-Branch verifizieren empfohlen.
- **Rollback:** `…_rollback.sql`.
- **Benötigte Freigabe:** DDL/Grant-Änderung in Production.

### F3 — Zweiten echten Mandanten provisionieren
- **Zweck:** einen kontrollierten zweiten Abgeordneten anlegen.
- **Schritt:** `provision-tenant.js --allow-production --spec …` (nach Vorab-`--validate`).
- **Risiko:** Production-Write (neuer Auth-Nutzer + Profil). Idempotent, mit Rollback bei
  Teilfehler; berührt keine anderen Mandanten. **Bestehende Mandanten (Pilot + Demo) sind
  datengetrieben hart geschützt (`provisionedBy`-Marker + optional
  `HELMUT_PROTECTED_TENANT_IDS`).**
- **Rollback:** `--teardown <id>` (strikt gescoped).
- **Benötigte Freigabe:** Production-Nutzer/Profil anlegen.

### F4 — Cron-Versorgung für mehrere Mandanten
- **Zweck:** Matching/Decisions/Pushes auch für den zweiten Mandanten erzeugen.
- **Schritt:** Umgesetzt — Crons laden ihre Mandate aus der DB und verarbeiten
  **alle aktiven Mandate isoliert** (siehe `docs/multitenancy-pilot-neutralisierung.md`).
  Keine Env-/Flag-Aktivierung nötig, kein bevorzugtes Mandat.
- **Risiko:** höhere KI-Kosten skalieren mit der Zahl aktiver Mandate — hier
  greift F1 (globaler Tagesdeckel) als Schutz; Cron-Laufzeit/Zeitbudget beachten.
  Optionaler per-Mandant-Deckel: `HELMUT_TENANT_LLM_CAP` (eigener Freigabepunkt).
- **Rollback:** kein Flag-Rückweg nötig; ein Mandat lässt sich über das Admin-/
  Provisionierungswerkzeug deaktivieren (nimmt dann nicht mehr an Crons teil).

### F5 — (Später) Echte DB-seitige Trennung (GoTrue, Option B)
- **Zweck:** RLS wirksam machen (Defense-in-Depth statt nur App-Guard).
- **Risiko/Aufwand:** großer Umbau (Login/Session/Token), freigabepflichtig.
- **Rollback:** Feature-Flag/Stufenrollout.
- **Benötigte Freigabe:** eigener Meilenstein, nicht Teil von Sprint 1.
