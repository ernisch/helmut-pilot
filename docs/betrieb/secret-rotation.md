# Secret-Rotation — Runbook (Stand 2026-07-15)

Für jedes Secret: Ablageort(e), Rotationsanlass/-intervall, exakte Schritte,
Abhängigkeiten, Prüfschritt danach. **Werte stehen NIE hier oder im Repo** —
nur im Passwort-Manager des Betreibers und in den genannten Ablageorten.

Allgemeine Regeln:

- Anlassbezogene Rotation IMMER sofort: bei Verdacht auf Leak (Secret in Log,
  Chat, Screenshot, fremder Zugriff), bei Personalwechsel, nach jedem Incident.
- Turnusrotation, wo unten angegeben; sonst nur anlassbezogen (Rotation hat
  selbst Fehlerrisiko — kein Selbstzweck).
- Nach JEDER Vercel-Env-Änderung ist ein Redeploy nötig, damit der Wert in den
  Serverless-Functions ankommt (Vercel → Deployments → aktuelles Production-
  Deployment → Redeploy, oder nächster Git-Push).
- Doppelt gepflegte Werte (Vercel + GitHub) IMMER im selben Arbeitsgang an
  beiden Orten ändern — sonst schlägt der jeweils andere Konsument still fehl.

## PILOT_SECRET (auch `HELMUT_PILOT_SECRET`)

- **Ablageort:** Vercel (Production) + Passwort-Manager. Wird an die
  Pilot-Nutzer als geteilter Zugangscode ausgegeben.
- **Anlass/Intervall:** Freigabepunkt FA-1 (früher F1) — **am 2026-07-15 ausgeführt** (in Vercel
  rotiert + Redeploy; `POST /api/pilot/unlock` → HTTP 200 `{"ok":true}` verifiziert).
  Danach bei Verdacht oder wenn ein Pilot-Teilnehmer ausscheidet. Kein fester Turnus.
- **Schritte:**
  1. Neuen zufälligen Wert erzeugen (z. B. `openssl rand -base64 24`).
  2. Vercel → Settings → Environment Variables → `PILOT_SECRET` ersetzen.
  3. Redeploy.
  4. Neuen Code an die Pilot-Nutzer kommunizieren (sicherer Kanal, nicht Mail-Verteiler).
- **Abhängigkeiten:** Login der Pilot-Nutzer (Legacy-Gate). Im
  `HELMUT_AUTH_MODE=accounts`-Betrieb nur noch Rückfallebene. Fließt zudem in
  die CSRF-Fallback-Kette ein (server.js) — kein zusätzlicher Handlungsbedarf.
- **Prüfschritt:** Login mit neuem Code funktioniert; Login mit altem Code wird
  abgewiesen.

## CRON_SECRET (Vercel) + `HELMUT_CRON_SECRET` (GitHub) — Doppelpflege!

- **Ablageorte:** (1) Vercel Production als `CRON_SECRET`; (2) GitHub → Repo →
  Settings → Secrets and variables → Actions → `HELMUT_CRON_SECRET`
  (briefing-watchdog.yml). Beide MÜSSEN wertgleich sein.
- **Anlass/Intervall:** bei Verdacht; empfohlener Turnus 12 Monate. Achtung:
  solange `HELMUT_ADMIN_SECRET` nicht separat gesetzt ist, gewährt dieser Wert
  auch Debug-Vollzugriff (`/api/debug/*`) — dann eher 6 Monate.
- **Schritte:**
  1. Neuen Wert erzeugen.
  2. Vercel `CRON_SECRET` ersetzen, Redeploy.
  3. Im SELBEN Arbeitsgang GitHub-Secret `HELMUT_CRON_SECRET` ersetzen.
  4. Passwort-Manager aktualisieren.
- **Abhängigkeiten:** alle `/api/cron/*` (Vercel-Crons senden den Wert
  automatisch aus der Env — kein Eingriff nötig, aber erst nach Redeploy
  konsistent); GitHub-Workflow briefing-watchdog; Fallback-Auth für
  `/api/debug/*` (wenn `HELMUT_ADMIN_SECRET` fehlt); manuelle Bearer-Aufrufe
  des Betreibers (curl-Snippets im Passwort-Manager anpassen).
- **Prüfschritt:** briefing-watchdog manuell per workflow_dispatch starten →
  grün. Zusätzlich Vercel-Function-Logs des nächsten Cron-Laufs: Status 200,
  kein 401/503.

## HELMUT_ADMIN_SECRET

- **Ablageort:** Vercel Production. SOLL separat von `CRON_SECRET` gesetzt sein
  (sonst greift der Fallback und das Cron-Secret öffnet die Debug-Routen).
- **Anlass/Intervall:** bei Verdacht; Turnus 6 Monate (schützt zustandsändernde
  Debug-/Admin-Endpunkte).
- **Schritte:** neuen Wert erzeugen → Vercel ersetzen → Redeploy →
  Passwort-Manager aktualisieren.
- **Abhängigkeiten:** nur `/api/debug/*`- und Admin-Bypass-Aufrufe des
  Betreibers. Keine Crons, keine Workflows.
- **Prüfschritt:** `GET /api/debug/status` mit neuem Bearer → 200; mit altem
  Bearer → 404 (fail-closed).

## SUPABASE_SERVICE_ROLE_KEY (Aliasse: `SUPABASE_SERVICE_KEY`, `SUPABASE_SECRET_KEY`)

- **Ablageorte:** (1) Vercel Production; (2) GitHub-Actions-Secret
  `SUPABASE_SERVICE_ROLE_KEY` (staff-backfill-Workflows); (3) lokale
  `.env.local` des Betreibers (Backup-Export). Drei Orte — alle mitziehen.
- **Anlass/Intervall:** bei Verdacht SOFORT (der Key ist der volle DB-Zugang
  mit RLS-Bypass); Turnus 12 Monate.
- **Schritte:**
  1. Supabase Dashboard → Project → Settings → API: neuen Service-Key erzeugen
     (bzw. Rotation auslösen; bei Legacy-Keys: erst neuen anlegen, alten danach
     widerrufen — nicht umgekehrt, sonst Downtime).
  2. Vercel-Wert ersetzen, Redeploy.
  3. GitHub-Secret ersetzen.
  4. Lokale `.env.local` aktualisieren.
  5. Alten Key in Supabase widerrufen.
- **Abhängigkeiten:** gesamte App (Store), alle Crons, staff-backfill-Workflows,
  `scripts/backup-export.js`/`restore-drill.js` lokal.
- **Prüfschritt:** App-Login + Helmut-Tab lädt Daten; ein Cron-Lauf ohne
  Storage-Fehler in den Logs; `node scripts/backup-export.js` läuft lokal durch.

## OPENAI_API_KEY / AZURE_OPENAI_KEY (+`AZURE_OPENAI_ENDPOINT`)

- **Ablageorte:** Vercel Production; zusätzlich GitHub-Actions-Secrets
  (`OPENAI_API_KEY`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_ENDPOINT`) für die
  staff-backfill-Workflows.
- **Anlass/Intervall:** bei Verdacht; Turnus 12 Monate (Provider-Konsole
  erlaubt überlappende Keys — neuen anlegen, dann alten löschen).
- **Schritte:**
  1. Neuen Key in der Provider-Konsole (Azure-Portal bzw. OpenAI-Dashboard)
     erzeugen.
  2. Vercel-Wert ersetzen, Redeploy.
  3. GitHub-Secret ersetzen.
  4. Alten Key beim Provider deaktivieren.
- **Abhängigkeiten:** alle KI-Pfade (Understanding, Büro, Kommunikation, Lage);
  staff-backfill-Workflows. Azure hat Vorrang vor OpenAI — beim Prüfen den
  tatsächlich aktiven Pfad testen.
- **Prüfschritt:** `GET /api/debug/azure-ping` (mit Admin-Bearer) → ok; oder
  einen Büro-Output erzeugen und auf echte KI-Antwort (nicht Regel-Fallback)
  prüfen. Budget beachten: der Ping/Probe-Call zählt gegen das Tageslimit.

## CALLMEBOT_APIKEY (+`CALLMEBOT_PHONE`)

- **Ablageort:** Vercel Production.
- **Anlass/Intervall:** bei Leak oder wenn CallMeBot den Key invalidiert; kein
  Turnus (der Key ist an die Telefonnummer gebunden).
- **Schritte:** neuen Key per CallMeBot-WhatsApp-Registrierung anfordern →
  Vercel-Wert ersetzen → Redeploy.
- **Abhängigkeiten:** WhatsApp-Kanal des täglichen Health-Reports. Der
  Zweitkanal `HELMUT_MONITORING_WEBHOOK_URL` ist unabhängig und bleibt aktiv.
- **Prüfschritt:** Health-Report manuell auslösen
  (`GET /api/cron/health-report` mit Bearer `CRON_SECRET`) und WhatsApp-Eingang
  prüfen. Kein `dryRun=1` verwenden — der versendet nichts.

## VAPID-Schlüsselpaar (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`)

- **Ablageort:** Vercel Production.
- **Anlass/Intervall:** NUR bei Kompromittierung des Private Key. Kein Turnus —
  eine Rotation invalidiert ALLE bestehenden Push-Abonnements; jeder Nutzer
  muss Push neu aktivieren.
- **Schritte:**
  1. Neues Paar erzeugen: `node scripts/generate-vapid-keys.js`.
  2. Alle drei Werte in Vercel ersetzen, Redeploy.
  3. Nutzer informieren, dass Push neu aktiviert werden muss.
- **Abhängigkeiten:** Web-Push (Morgen-Push, Alarm-Pushes). App läuft ohne
  Push normal weiter.
- **Prüfschritt:** Push in der App neu abonnieren und Test-Push empfangen.

## DIP_API_KEY

- **Ablageort:** Vercel Production.
- **Anlass/Intervall:** bei Ablauf (DIP-Keys sind befristet) oder Leak; sonst
  kein Turnus. Geringes Schadenspotenzial (kostenloser, personenungebundener
  Lese-Key).
- **Schritte:** neuen Key über das DIP-Portal des Bundestags beziehen →
  Vercel-Wert ersetzen → Redeploy.
- **Abhängigkeiten:** DIP-Drucksachen im Crawl. Ohne Key läuft alles außer DIP.
- **Prüfschritt:** nächster Crawl-Lauf ohne DIP-Fehler in den Logs; DIP-Items
  erscheinen weiterhin.

## VERCEL_TOKEN

- **Ablageort:** NICHT in Vercel-Envs — lokales Credential der vercel-CLI auf
  dem Betreiber-Gerät (bzw. `VERCEL_TOKEN` in der Shell für headless-Nutzung).
- **Anlass/Intervall:** bei Verdacht oder Gerätewechsel/-verlust SOFORT (der
  Token kann deployen und Envs lesen/ändern); Turnus 12 Monate.
- **Schritte:**
  1. vercel.com → Account → Tokens: alten Token widerrufen.
  2. Neuen Token erzeugen (minimaler Scope, Ablaufdatum setzen).
  3. Lokal neu einloggen (`vercel login`) bzw. Shell-Variable ersetzen.
- **Abhängigkeiten:** `scripts/vercel-deploy.sh` (CLI-Deploy-Weg) und alle
  manuellen `vercel`-Kommandos.
- **Prüfschritt:** `vercel whoami` zeigt den Account; ein `vercel env ls
  production` funktioniert.

## TARGET_SUPABASE_SERVICE_ROLE_KEY

- **Ablageort:** KEINER dauerhaft — nur ad hoc in der Shell während einer
  Restore-Übung (`scripts/restore-drill.js`). Nicht in `.env.local`, nicht im
  Passwort-Manager nötig, wenn das Testprojekt nach der Übung gelöscht wird.
- **Anlass/Intervall:** nach jeder Restore-Übung: Testprojekt löschen ODER
  dessen Service-Key rotieren (das Testprojekt enthält nach dem Drill echte,
  Art.-9-relevante Daten!).
- **Schritte:** Supabase Dashboard des TESTprojekts → Settings → API → Key
  rotieren, oder Projekt komplett löschen (bevorzugt).
- **Abhängigkeiten:** keine Laufzeit-Abhängigkeit; nur die Übung selbst. Darf
  NIE identisch mit dem Production-`SUPABASE_SERVICE_ROLE_KEY` sein.
- **Prüfschritt:** Shell-History der Übung prüfen (`history | grep TARGET_`),
  ggf. bereinigen; Testprojekt im Supabase-Dashboard nicht mehr vorhanden bzw.
  alter Key abgewiesen.
