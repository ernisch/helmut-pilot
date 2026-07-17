# Mandantenneutralisierung — Entfernung der Pilot-Sonderbehandlung

Stand: 2026-07-17 · Branch `claude/remove-pilot-tenant-hardcoding-qkqxw0`

## 1. Ziel und Grundregeln

Der Pilotmandant war bisher an vielen Stellen fest in den Code eingebaut
(Vollprofil als Konstante, Default-Parameter, Cron-Fallbacks, Schutzliste,
Personenquelle, Paketbindung). Dieser Umbau entfernt jede dieser
Sonderbehandlungen. Es gelten ab jetzt folgende Regeln:

1. **Kein Nutzer ist im Code als Standardmandant definiert.** Das frühere
   Code-Vollprofil ist ersatzlos gelöscht; Profildaten (auch die des Piloten)
   leben ausschließlich als normale Datensätze im Store/der Datenbank.
2. **Crons laden aktive Mandanten aus der Datenbank**
   (`tenant-context.resolveCronTenantIds` → `listProfiles()`).
3. **Fehlender Mandantenkontext führt zu einem sicheren Abbruch**:
   HTTP-Pfade → `503 pilot-tenant-not-configured`; interne Funktionen →
   `TenantContextError`; Crons → ehrlicher Leerlauf (`skipped`).
4. **Es gibt keinen Fallback auf einen bestimmten Nutzer** — nirgends.
5. **Budgets** stammen aus Mandatsprofil (`ki_budget_*`) oder neutraler
   Standardkonfiguration (`HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY`,
   sicherer Fallback 40); es gibt keine persönlichen Overrides im Code.
6. **Quellenpakete** stammen aus Profil und Datenbank. Das persönliche Paket
   eines Mandats folgt der Konvention `profil-<mandats-id>`
   (`profile-packages.personalPackageKeyFor`); die Personenquelle wird zur
   Laufzeit aus dem Profil erzeugt (`personNewsSource`, id `<mandats-id>-news`).
7. **Cache- und Blob-Schlüssel** entstehen ausschließlich aus validiertem
   Mandantenkontext (`requireTenantId`); Personen-Rohdaten gehören strikt dem
   Mandat, dessen Personenquelle sie geliefert hat.
8. **Admin-Werkzeuge** arbeiten mit übergebenen und validierten IDs; die
   Provisionierung schützt bestehende Mandanten **datengetrieben**
   (`provisionedBy`-Marker + optional `HELMUT_PROTECTED_TENANT_IDS`) statt
   über eine Namensliste.
9. **Tests verwenden ausschließlich künstliche Namen und IDs**
   (`tenant-alpha`, `tenant-beta`, `test-politician-one`, `test-politician-two`).
10. **Systemprozesse unterscheiden global und mandantenbezogen** (siehe
    Inventur unten).

## 2. Neue Konfiguration (alle Werte fail-closed, keine Code-Defaults)

| Variable | Bedeutung | Ohne Wert |
|---|---|---|
| `HELMUT_PILOT_TENANT_ID` | Mandats-ID, die das Legacy-Pilotgate bedient und die mandantenbezogene Crons ohne Multi-Tenant-Flag verarbeiten. Muss ein existierendes Datenbank-Profil sein (wird je Cron-Lauf gegen die DB validiert). | Pilotgate-API → 503; Crons → Leerlauf (`skipped`) |
| `HELMUT_CRON_MULTI_TENANT` | **Freigabepflichtig, Default AUS.** Mandantenbezogene Crons iterieren über alle aktiven DB-Mandate (Isolation je Mandat, Zeitbudget). | Einzel-Mandats-Betrieb über `HELMUT_PILOT_TENANT_ID` |
| `HELMUT_PROTECTED_TENANT_IDS` | Optionale zusätzliche Schutzliste (Komma) für die Provisionierung. | Datengetriebener Schutz greift trotzdem |

Der Account-Modus (`HELMUT_AUTH_MODE=accounts`) ist unverändert: Identität aus
Session + Zuweisungen, kein stiller Fallback.

## 3. Cron- und Hintergrundprozess-Inventur

Alle Zeiten unverändert (vercel.json wurde nicht angefasst — keine
Production-Cron-Änderung). „Mandanten aus DB“ = `resolveCronTenantIds`:
Multi-Tenant-Flag AN → alle aktiven Profile; AUS → konfiguriertes Pilotmandat,
gegen die DB validiert; nichts konfiguriert → Leerlauf.

| Prozess (Zeit UTC) | Typ | Mandantenladung | 0 Mandanten | Fehlerhafter Mandant | Kostenbegrenzung | Protokollierung | Idempotenz |
|---|---|---|---|---|---|---|---|
| `/api/cron/crawl` (04:00, 20:00) | mandantenbezogen | aus DB via `runCronForTenants` | `skipped`-Antwort, kein Lauf | try/catch je Mandat, Lauf der anderen unberührt | globales LLM-Tageslimit; per-Mandant-Deckel vorbereitet (`HELMUT_TENANT_LLM_CAP`, Default aus); Zeitbudget 240 s | Konsolen-Log je Mandat + `recordProcessRun`/Telemetrie | Lock `crawl-<id>` (15 min), Hash-Dedup, Understanding je `vorgang_id` |
| `/api/cron/pipeline` (16:00) | mandantenbezogen | wie crawl | `skipped` | wie crawl | wie crawl; hartes 280 s-Gesamt-Timeout | wie crawl | wie crawl |
| `/api/cron/morning-briefing` (05:00) | mandantenbezogen | Flag `HELMUT_MORNING_PUSH_ALL_PROFILES`: alle DB-Profile; sonst Cron-Mandantenauflösung | `skipped` (kein synthetisches Mandat mehr) | per-Profil try/catch + 240 s-Deadline | 0 KI (reine Lese-Transformation), Timeouts 60 s/30 s | Konsolen-Log + `recordProcessRun` | Push-Dedup `briefing-push:<id>:<Tag>` |
| `/api/cron/lage-briefing` (05:45) | mandantenbezogen | alle DB-Profile (`listProfiles`), deaktivierte übersprungen | Leerlauf (0 Ergebnisse) | **neu:** vollständige Isolation — auch `activeProfile`/`validateProfile` im try/catch; **neu:** 240 s-Deadline | KI je Mandat über `canSpendLlmForTenant` | `recordProcessRun` | Tages-Cache `bf-<user>-lage-<Tag>` + Lock je User |
| `/api/cron/lage-check` (10:00) | mandantenbezogen | aus DB via `runCronForTenants` | `skipped` | try/catch je Mandat | globales LLM-Limit + Zeitbudgets (240 s Check / 30 s Push) | Konsolen-Log je Mandat | Push-Dedup `lage-change:<id>:<Tag>`, additive Writes |
| `/api/cron/health-report` (06:00) | mandantenbezogen (Betriebsreport) | Cron-Mandantenauflösung; ein Report je Lauf (erster aufgelöster Mandant = konfiguriertes Pilotmandat) | `skipped`, kein Versand | n/a (ein Mandat je Lauf) | 0 KI | Systemfehler-Log bei Zustellfehlern | nicht idempotent (Versand je Aufruf), 1×/Tag geplant, `dryRun=1` vorhanden |
| `/api/cron/understanding` (05:30, 21:30) | **global** (einmal verstehen, mehrfach bewerten) | benötigt keinen Mandanten | No-Op (`no-pending`) | per-Cluster try/catch | globales Tageslimit + `HELMUT_UNDERSTAND_BUDGET_MS` (240 s); Understanding ist bewusst vom per-Mandant-Deckel ausgenommen | Konsolen-Log + `recordProcessRun` | je `vorgang_id` + globaler Lock (flag-gated) |
| `/api/cron/pipeline-status` | global, read-only | n/a | n/a | n/a | 0 Kosten | n/a | idempotent (0 Writes) |
| GitHub Actions `briefing-watchdog` (05:30) | global (prüft `pipeline-status`) | n/a | n/a | n/a | 0 KI | Actions-Log | idempotent |
| GitHub Actions `health-watch` | manuell (kein Schedule aktiv) | n/a | n/a | n/a | n/a | Actions-Log | idempotent |
| übrige Actions (staff-backfill, pardok, sprint9b, ko-classification) | manuell/Dry-Run | n/a bzw. explizite Parameter | n/a | n/a | dokumentierte Limits je Workflow | Actions-Log | idempotent/Dry-Run |

**Bewusst NICHT aktiviert (freigabepflichtig):**

1. `HELMUT_CRON_MULTI_TENANT` bleibt AUS — Multi-Tenant-Verarbeitung ist
   gebaut und getestet, die Aktivierung ist eine Kosten-/Betriebsentscheidung.
2. `HELMUT_TENANT_LLM_CAP` (per-Mandant-Kostendeckel) bleibt AUS (bestehender
   Freigabepunkt).
3. Bekannte Grenzen im (noch nicht freigegebenen) Multi-Tenant-Betrieb:
   `pipeline-status` meldet den letzten Lauf global (nicht je Mandat), und das
   globale Understanding-Budget ist nicht fair je Mandat verteilt (ein
   quellenstarker Mandant kann es aufbrauchen). Beides ist erst bei
   Aktivierung des Multi-Tenant-Flags relevant und dort als Vorbedingung
   dokumentiert.

## 4. Betriebs-/Merge-Hinweis (Gate)

Production läuft im Legacy-Pilotgate. **Vor dem ersten Deploy dieses Stands
muss der Betreiber `HELMUT_PILOT_TENANT_ID` in Vercel auf die Mandats-ID des
bestehenden Pilotmandats setzen** (der Wert ist Konfiguration, kein Code; das
Profil liegt bereits als normaler Datensatz in der Datenbank). Ohne diesen
Wert antwortet die App fail-closed mit einem klaren 503-Zustand und Crons
laufen leer — es werden niemals Daten eines geratenen Nutzers ausgeliefert.

Rollback: vorheriges Deployment in Vercel re-deployen (Env-Variable kann
gesetzt bleiben; der alte Stand liest sie nicht). Es gibt keine Migration und
keine Datenänderung — Production-Datensätze (Profile, Pakete, Abrufwege,
Dokumente) bleiben in beiden Richtungen unverändert.
