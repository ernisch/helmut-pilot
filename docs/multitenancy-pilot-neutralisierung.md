# Mandantenneutralisierung — Entfernung jeder Pilot-Sonderbehandlung

Stand: 2026-07-17 · Branch `claude/remove-pilot-tenant-hardcoding-qkqxw0`

## 1. Ziel und Grundregeln

Der Pilotmandant war an vielen Stellen fest eingebaut (Vollprofil als Konstante,
Default-Parameter, Cron-Fallbacks, Schutzliste, Personenquelle, Paketbindung).
Dieser Umbau entfernt jede Sonderbehandlung — **und ersetzt sie NICHT durch eine
Environment-Variable.** Es gibt **keinen Pilot-, Default-, primären oder
Fallback-Mandanten** mehr, weder im Code, noch in einer Env-Variable, noch als
Cron-Fallback.

1. **Kein Nutzer ist bevorzugt.** Profildaten (auch die des bestehenden Mandanten)
   leben ausschließlich als normale Datensätze im Store/der Datenbank.
2. **Nutzeranfragen** bestimmen ihr Mandat aus verifiziertem Kontext:
   - Account-Modus: Session + Zuweisungen.
   - Legacy-Zugang (geteiltes `PILOT_SECRET`, keine Accounts): die **aktiven
     Mandate der Datenbank sind die Zugriffsmenge** (allgemeine, datenbankbasierte
     Zugangszuordnung).
3. **Mandantenbezogene Crons** verarbeiten **immer alle aktiven DB-Mandate**,
   jedes isoliert — kein Env, kein Flag, kein Einzel-Mandats-Fallback.
4. **Fehlender authentifizierter Mandantenkontext** bricht sicher ab (403 im
   Account-Modus; `TenantContextError` intern).
5. Budgets/Quellenpakete/Cache-Schlüssel stammen aus Profil bzw. validiertem
   Mandantenkontext; das persönliche Paket folgt der Konvention
   `profil-<mandats-id>`, die Personenquelle `<mandats-id>-news`.
6. **Es ist KEINE mandantenspezifische Env-Variable nötig** — der bestehende
   Mandant funktioniert nach dem Merge als normaler aktiver DB-Mandant.

## 2. Wie der Mandant bestimmt wird

### Nutzeranfragen
- **Account-Modus** (`HELMUT_AUTH_MODE=accounts`): `politicianId` kommt aus
  Session + Assignments (`auth.getAllowedPoliticianIds` / `pickPoliticianId`).
  Ohne gültiges Mandat: 403 (`no-mandate`) — kein stiller Fallback.
- **Legacy-Zugang** (`tenant-context.resolveActiveTenant`):
  1. `?politicianId=`, falls es ein **aktives** DB-Mandat benennt → dieses.
  2. sonst **genau ein** aktives Mandat → dieses (ohne Auswahl, ohne Env).
  3. sonst (mehrere aktive, keine Auswahl) → **Mandatsauswahl** (der Client
     rendert eine Auswahl der aktiven Mandate); keines → ehrlicher Leerzustand.
  Es wird **niemals** ein Mandat geraten. Der Admin-Bypass (secret-geschützt)
  darf zusätzlich jedes Mandat per `?politicianId=` wählen.

### Crons/Hintergrundprozesse
`tenant-context.resolveCronTenants` liefert **alle aktiven DB-Mandate**
(`listActiveTenantIds` → `storage.listFullProfiles`, gefiltert nach
`isActiveMandate`: nicht deaktiviert, nicht gelöscht), deterministisch sortiert.
`runCronForTenants` iteriert sie isoliert (try/catch je Mandat, hartes
Zeitbudget). Grund-Codes: `ok` (≥1), `keine-aktiven-mandanten` (0, `ok:true`),
`mandanten-liste-nicht-ladbar` (Ladestörung → `ok:false` + Systemfehler).

## 3. Verhalten bei 0 / 1 / mehreren Mandanten

| Aktive Mandate | Nutzeranfrage (Legacy) | Mandatsbezogener Cron |
|---|---|---|
| **0** | `/api/app/start` → 200 Leerzustand (kein Profil, **kein 503**); andere mandatsbezogene API → Auswahl-/Leerzustand | `{ ok:true, tenants:0, results:[] }` — sauberer Lauf mit 0 verarbeiteten |
| **1** | das eine aktive Mandat wird **ohne Env/Auswahl** serviert | dieses eine Mandat wird verarbeitet |
| **≥2** | `?politicianId=` (aktives Mandat) wird serviert; ohne Auswahl → Mandatsauswahl (kein geratener Mandant) | **jedes** Mandat isoliert; ein fehlerhafter Mandant stoppt die anderen nicht |

## 4. Cron-Inventur (Zeiten unverändert — vercel.json nicht angefasst)

| Prozess (UTC) | Typ | Mandantenladung | 0 Mandanten | Fehlerhafter Mandant | Idempotenz |
|---|---|---|---|---|---|
| `/api/cron/crawl` (04:00, 20:00) | mandantenbezogen | alle aktiven DB-Mandate (`runCronForTenants`) | `ok:true, tenants:0` | isoliert (try/catch je Mandat) | Lock `crawl-<id>`, Hash-Dedup |
| `/api/cron/pipeline` (16:00) | mandantenbezogen | wie crawl | wie crawl | wie crawl | wie crawl |
| `/api/cron/morning-briefing` (05:00) | mandantenbezogen | wie crawl (deaktivierte übersprungen) | `ok:true, tenants:0` | isoliert + 240 s-Deadline | Push-Dedup `briefing-push:<id>:<Tag>` |
| `/api/cron/lage-briefing` (05:45) | mandantenbezogen | alle Profile, deaktivierte übersprungen | Leerlauf | isoliert + 240 s-Deadline | Tages-Cache + Lock je User |
| `/api/cron/lage-check` (10:00) | mandantenbezogen | alle aktiven DB-Mandate | `ok:true, tenants:0` | isoliert + 280 s-Gesamt-Timeout | Push-Dedup `lage-change:<id>:<Tag>` |
| `/api/cron/health-report` (06:00) | mandantenbezogen | je aktives Mandat ein isolierter Report; **eine aggregierte Alarm-Nachricht je Kanal** (kein „erstes" Mandat, kein N-fach-Spam); top-level `ok` = alle Mandate ok | `ok:true, tenants:0` | isoliert | nicht idempotent (Versand), 1×/Tag, `dryRun=1` |
| `/api/cron/understanding` (05:30, 21:30) | **global** | benötigt keinen Mandanten | No-Op | per-Cluster try/catch | je `vorgang_id` + globaler Lock |
| `/api/cron/pipeline-status` | global, read-only | — | — | — | idempotent |

`/api/release/public` ist **mandatsagnostisch**: es gibt **keine** Mandats-ID,
keine Per-Mandant-Metriken und keine Pilot-/Tenant-Konfiguration aus — nur ein
globales Bereitschaftssignal (`{ ok, ready, storage }`: persistenter Speicher
aktiv + jüngster Crawl frisch). Die detaillierte, mandatsbezogene Pitch-
Readiness bleibt dem authentifizierten `/api/release/check` vorbehalten.

## 5. Auswirkung auf den bestehenden Production-Mandanten

Production läuft im Legacy-Zugang (keine Auth-Nutzer). Die Datenbank enthält
neben dem realen Mandanten zwei **Demo-Mandate** (`james-brown`, `angela-merkel`,
vom Audit bereits als „vor Vertrieb löschen" markiert). Daraus folgt:

- **Crons** verarbeiten nach dem Merge alle aktiven Mandate isoliert — der reale
  Mandant ist immer dabei (≥1, **kein leerer Lauf, kein 503**).
- **Bare-Root-Aufruf** (ohne `?politicianId=`): Solange mehrere aktive Mandate
  existieren, zeigt die App eine **Mandatsauswahl** (einmalige Auswahl, danach
  lokal gemerkt). Der reale Nutzer erreicht sein Mandat weiterhin sofort über
  `?politicianId=<id>` bzw. seine gemerkte Auswahl. **Sobald die zwei
  Demo-Mandate entfernt sind** (reine Daten-Hygiene, kein Code/Schema), bleibt
  genau ein aktives Mandat und wird **ohne jede Konfiguration** automatisch
  serviert.
- **Keine neue Env-Variable, keine Migration, kein Production-Write** ist für den
  Betrieb des bestehenden Mandanten nötig. Die bestehenden DB-Zeilen (Profil,
  Paket `profil-…`, Abrufweg `rp-…-news`) bleiben unverändert gültig.

## 6. Merge- und Rollback-Plan

- **Merge:** PR mergen → Vercel deployt. **Ohne zusätzliche Konfiguration.** Der
  reale Mandant funktioniert als normaler aktiver DB-Mandant.
- **Empfohlen (Daten-Hygiene, separat, kein Teil dieses Diffs):** die zwei
  Demo-Mandate über das Provisionierungs-/Admin-Werkzeug deaktivieren/entfernen —
  danach entfällt die Mandatsauswahl am Bare-Root-Aufruf.
- **Rollback:** vorheriges Deployment re-deployen bzw. Revert-Commit. Keine
  Daten-/Schemarücknahme nötig (nichts migriert, kein Production-Write).
