# Admin-Neuaufbau 2026-07 — Analyse, Entscheidungen, Umsetzung

Branch: `claude/helmut-admin-rebuild-tls33g`. Grundlage: Read-only-Analyse der
Codebasis (server.js, client.js, lib/helmut/*, Tests, styles.css) plus der
Design-Referenz „Helmut Admin.dc.html" und des Datenvertrags-Handoffs.
Die Codebasis ist die Wahrheit — wo Referenz und Code abweichen, gilt der Code.

## 1. Bestehender Adminaufbau (Ist-Zustand vor dem Umbau)

- Der Admin ist eine View (`"admin"`) der SPA in `client.js` (~2.400 Zeilen,
  Render-Block ~1197–3234), erreichbar nur im Account-Modus
  (`HELMUT_AUTH_MODE=accounts`) für die Rolle `admin`.
- Datenladen: `ensureViewData("admin")` holt `GET /api/admin/overview`,
  `/api/admin/data-status`, `/api/admin/recovery-status` — einmal pro Session,
  monolithisch (ein Fehler macht den ganzen Admin leer).
- Rendering: innerHTML-String-Konkatenation, Full-Rerender + globales Rebinding,
  ein einziges Perioden-Toggle (`today`/`days30`), USD-Kosten wurden mit einem
  hartkodierten Kurs 0,92 als „EUR" angezeigt (client.js `USD_TO_EUR`).
- Auslieferung: Production-Shell kommt aus `server.js indexHtml()` (nicht
  index.html); `client.js`/`styles.css` sind immutable gecacht und nur über
  `?v=ASSET_VERSION` aktualisierbar; Service Worker cached stale-while-revalidate.

## 2. Wiederverwendbare Teile (bleiben)

- Sicherheits-Muster: `requireRoleOr403` pro Route, Session-Cookie
  `helmut_session` (Identität ausschließlich serverseitig), globaler CSRF-Guard
  (`X-CSRF-Token`, HMAC-Token via `GET /api/security/csrf`).
- Client-Infrastruktur: `fetchWithTimeout` (mit CSRF-Selbstheilung), `apiSend`,
  `escapeHtml`/`escapeAttribute`, `showToast`, Theme-Logik (`data-theme`),
  Intl-Formatter-Muster (`Europe/Berlin`), Skeleton-CSS, Toast, Tabellen-
  Mobile-Muster (`td::before content: attr(data-label)`).
- Recovery-Interaktionsmuster: POST-Aktionen mit `window.confirm` + serverseitigem
  `confirm:true` (reset-failed), Status-Polling read-only — Verhalten erhalten.
- Server-Builder: `buildAdminOverview`, `buildAdminDataStatus`,
  `buildPipelineRecoveryStatus`, `buildSourceArchitectureReport`,
  `buildHelmutConfigDiagnose` und alle Admin-Statistikfunktionen in storage.js.

## 3. Ersetzte Teile

- Der komplette Admin-Render-Block in client.js (Alt-Klassen `op-*`, `ac-*`,
  Alt-Layout) → neue, modulare Bereichs-Renderer mit 7 Bereichen,
  bereichsweisem Laden, Fehler-/Leer-/Ladezuständen pro Bereich.
- Alt-Admin-CSS bleibt vorerst im Stylesheet (toter Code wird nach Abnahme am
  Stück entfernt); der neue Admin nutzt einen eigenen Präfix `adm-` auf Basis
  der bestehenden Design-Tokens (`--card`, `--line`, `--text`, `--danger`,
  `--watch`, `--chance`, `--accent`) — Light/Dark „gratis" über Tokens.

## 4. Vorhandene Endpoints (verifiziert, admin-gegatet sofern nicht vermerkt)

| Endpoint | Quelle |
|---|---|
| `GET /api/admin/overview` | buildAdminOverview (users, profiles, mandates, feedback, stats, crawlReport, system, sourceArchitecture, recentErrors, auditEvents) |
| `GET /api/admin/stats/daily` / `weekly` | getAdminStatsOverview({days:1|7}) |
| `GET /api/admin/stats/costs?days` | getAdminStatsCosts (USD!) |
| `GET /api/admin/stats/crawl?days` | getAdminStatsCrawl |
| `GET /api/admin/stats/crawl-report` | getAdminStatsCrawlReport |
| `GET /api/admin/data-status` | buildAdminDataStatus (teuer, 25s-Timeout im Client) |
| `GET /api/admin/tenant-mode` | nur Booleans/Diagnose |
| `GET /api/admin/recovery-status` | buildPipelineRecoveryStatus |
| `POST /api/admin/recovery/*` | release-lock, reset-failed (confirm:true), run-understanding, pending-diagnose |
| `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id` | accounts (sanitizeUser — nie Hashes) |
| `GET/POST/DELETE /api/admin/assignments` | accounts |
| `GET/POST/PATCH /api/admin/profile/:id` (+ `/test-briefing`) | Profile + profile-validation |
| `PATCH /api/admin/feedback/:id` | setFeedbackDone |
| `GET/POST /api/admin/ko-enrichment-backfill` | Dry-Run per GET, Ausführung nur POST |
| `GET /api/privacy/export?politicianId=` | exportProfileData + Audit `privacy.export` (Admin oder Inhaber) |
| `POST /api/privacy/delete?politicianId=` | deleteProfileData, Server-Confirm `"DELETE"`, Audit `privacy.delete` |

Abweichungen vom Handoff-README:
- Die Privacy-Routen existieren bereits unter `/api/privacy/*` — es werden
  KEINE neuen `/api/admin/privacy/*`-Duplikate gebaut.
- `/api/admin/presentation-backfill` ist CRON_SECRET-gegatet (kein
  Session-Admin-Zugriff) — im Admin nur als Hinweis dargestellt, nicht als Button.
- `/api/ops/status` enthält hartkodierte, falsche Cron-Zeiten (Audit-Befund) —
  der neue Admin zeigt Cron-Zeiten aus vercel.json-Wahrheit nicht über diese Route.
- `getLatestPipelineDebugReport` ist tote Datenbasis (Schreiber ohne Aufrufer) —
  wird nicht angeschlossen.

## 5. Ergänzte Routen (alle `requireRoleOr403(…, "admin")`, lesend; Umfang minimal)

| Route | Funktion |
|---|---|
| `GET /api/admin/stats/budget-today` | getLlmUsageBreakdownToday() + Monat-bis-heute (getLlmCostSince) |
| `GET /api/admin/stats/costs-per-user?days` | getAdminCostsPerUser + Namen + Pro-Mandant-Budgets (evaluateTenantBudget, Profile-Cents) |
| `GET /api/admin/stats/process-runs?limit&process` | listProcessRuns + letzter Lauf je Prozess |
| `GET /api/admin/audit?limit` | accounts.listAuditEvents |
| `GET /api/admin/feedback?limit` | listFeedback (bisher nur im Overview-Payload) |
| `GET /api/admin/customers` | Aggregat aus accounts.listUsers(): MRR, Zahlungsstatus-Zähler, Trials, Kundenliste, aktive Sessions (nur Anzahl) |
| `GET /api/admin/sources-status` | listSourceArchitectureRows-Aggregat (Statuszähler, problematische Wege, Herausgeber-Gruppen) + Google-News-Anteil aus crawlRuns.providerBreakdown + Shadow-Lauf |

Minimale Bibliotheks-Ergänzung: `accounts.countActiveSessions()` — zählt nicht
abgelaufene Sessions (gesamt + pro Nutzer-ID), gibt ausschließlich Zähler zurück,
niemals Token-Hashes. (Es gab bisher keinerlei Lesefunktion für Sessions.)
Zusätzlich additiv: `adminMandateSummary` liefert jetzt auch `validierung`
(profile-validation, reine Funktion) für die Profil-Tabelle.

## 6. Erkennbare Risiken / bewusste Entscheidungen

- **Währung:** Es gibt KEINE EUR-Umrechnung im Code. Alle KI-Kosten werden im
  neuen Admin ausdrücklich als **USD** ausgewiesen. Kundenpreise
  (`customer.pricePerMonth`) und Mandanten-Budgets (`aiBudget*Cents`) sind EUR.
  Der Schutzdeckel vergleicht USD↔EUR-Cent bewusst 1:1 (llm-budget.js) — das
  wird im Admin so erklärt, nicht versteckt.
- **RLS/Tenant-Modus:** `tenantJwtModeEnabled()` ist hart `false`; jeder
  DB-Zugriff läuft über service_role; 23 RLS-Policies sind vorbereitet, aber
  inert. Der Admin zeigt genau das an (keine Beschönigung).
- **Kostensummen können zu niedrig sein:** Records unbekannter Modelle tragen
  `estimatedCost:"unknown"` und fallen aus Summen heraus; llmUsage ist auf
  5000 Einträge gekappt. Der Admin kennzeichnet Kosten als Schätzwerte.
- **Zeitfenster:** Budget-Anzeigen nutzen ausschließlich
  `getLlmUsageBreakdownToday` (UTC-Kalendertag); Trends nutzen die rollierenden
  Fenster von `getAdminStatsCosts`. Beide werden nicht vermischt.
- **Locks:** Im atomaren Lock-Modus (HELMUT_ATOMIC_LOCK) sieht der Blob-Read
  keine SQL-Locks — die Lock-Anzeige übernimmt die bestehende
  recovery-status-Logik unverändert und erbt diese bekannte Grenze.
- **Referenten:** Es gibt vorerst keinen Referentenzugang als Produkt. Bestehende
  `referent`-Rollen werden sachlich als bestehende Rollenstruktur angezeigt,
  ohne neue Funktionalität.
- Tests, die das Alt-Markup einfrieren (`admin-overview-test.js`,
  `admin-source-ui-test.js`), wurden auf den neuen Admin umgeschrieben;
  die Sicherheits-Invarianten aus `p1-security-check.js` und
  `admin-config-diagnose-test.js` (Funktionsnamen, confirm-Muster,
  Guard-Muster) bleiben erhalten und grün.

## 7. Tests & Nachweise

- Neu: `scripts/admin-neue-routen-test.js` (`npm run test:admin-routen`) —
  echter HTTP-Server, echter Login: 401 anonym / 403 Nicht-Admin / 200 Admin für
  alle neuen Routen, Shapes, USD-Feldvertrag, keine Hashes in Antworten,
  CSRF-Pflicht + Server-Confirm der Löschung, Mandats-Pinning, keine
  Kostenfelder in `/api/app/start`.
- Umgeschrieben: `scripts/admin-overview-test.js` (61 Assertions, vm-Rendertest
  der neuen Bereiche inkl. `—`-Regel, Währungs-, XSS- und Gefahren-Aktions-
  Invarianten) und `scripts/admin-source-ui-test.js` (18 Assertions).
- Gesamtlauf: `node scripts/run-offline-tests.js` → **128/128 Suiten grün**;
  `scripts/browser-smoke-test.js` → 32/32.
- E2E + Screenshots: `scripts/admin-screenshots.js` (Werkzeug, kein Suitentest)
  startet Helmut lokal, legt über die echten APIs Betreiber/Mandat/Kunde an,
  klickt alle sieben Bereiche in Chromium durch (Desktop 1440, Schmal 390,
  Hell-Modus) und bricht bei jedem `pageerror` ab. Ergebnisse:
  `docs/visual/admin-neuaufbau-2026-07/*.png` (21 Screenshots, 0 Fehler).
