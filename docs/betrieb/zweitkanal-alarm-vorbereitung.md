# Zweiter Alarmkanal — technische Vorbereitung (FT2-5)

> **Hinweis 2026-07-17:** Freigabe-Nummern folgen jetzt dem eindeutigen Thread-2-Schema **FT2-x** (früher „Fx“); Mapping und verbindlicher Reststand: `docs/datenmotor-restliste.md`.

**Status: VORBEREITET, NICHT AKTIVIERT.** Aktivierung = Freigabepunkt **FT2-5** (Env-Wert
in Vercel Production setzen). Dieses Dokument beschreibt exakt, was der Code bereits
kann und welche Schritte die Aktivierung braucht — **ohne** etwas zu aktivieren.
Grundlage: rein lesende Analyse des Production-Codes (HEAD des Feature-Branches, =
aktuelles Production-Deployment).

## 1 · Was bereits im Code steht (verifiziert)

- **Sender:** `sendMonitoringWebhook(report)` (`server.js:3343`). POSTet JSON an
  `HELMUT_MONITORING_WEBHOOK_URL`, `Content-Type: application/json`, **8-s-Timeout**
  (`AbortSignal.timeout(8000)`), **fail-safe**: fehlt die URL → sauber übersprungen
  (`skipped:true`); Netz-/Timeout-Fehler brechen den Health-Cron nie ab.
- **Verdrahtung:** Der Health-Report-Cron `/api/cron/health-report` (Vercel-Plan
  `0 6 * * *` = 06:00 UTC) versendet **beide** Kanäle unabhängig und parallel
  (`Promise.all([sendCallMeBotMessage(buildAlarmText(report)), sendMonitoringWebhook(report)])`,
  `server.js:870`). Ein Kanalfehler kippt den anderen nicht.
- **Fehlerprotokollierung:** Echter Zustellfehler eines Kanals → `recordSystemError`
  (`scope:"health-report"`). Ist der Report **nicht grün** und sind **beide** Kanäle
  unkonfiguriert (skipped) → ebenfalls `recordSystemError` („kein Alarmkanal konfiguriert").
- **Datenschutz-Leitplanke (P1-7):** Der Payload wird ausschließlich über
  `buildAlarmPayload(report)` gebaut (`lib/helmut/alarm-payload.js`) — **Allowlist**
  technischer Felder **+ Redaction** des Statustextes (`redactSensitive`). Es verlassen
  **nie** Nutzerinhalte, Briefingtexte, politische Profile, Dokumentinhalte oder Secrets
  den Kanal.

### Payload-Schema, das der Empfänger-Webhook erhält (Allowlist, nichts anderes)

```json
{
  "source": "helmut-health-report",
  "text": "<redigierter, auf 2000 Zeichen gekappter technischer Statustext>",
  "ok": true,
  "state": "<max 40 Zeichen>",
  "severity": "<max 24 Zeichen>",
  "overdueCrons": ["<max 40 Zeichen>", "…"],
  "googleUrlResolutionRate": 0.0,
  "budget": { "calls": 0, "limit": 0, "remaining": 0, "skips": 0, "exhausted": false },
  "healthBlockers": ["<max 40 Zeichen>", "…"],
  "healthWarnings": ["<max 40 Zeichen>", "…"],
  "errors24": 0
}
```

Das Feld `text` ist Slack/Discord-kompatibel; strukturierte Zusatzfelder erlauben
Zapier/Make/E-Mail-Relais-Routing. Kein zusätzlicher Dienst / kein SMTP-Secret nötig.

## 2 · Sichere Prüfung VOR der Aktivierung (kein Versand, kein Env-Wert)

- **Dry-Run-Endpunkt (bereits vorhanden):** `GET /api/cron/health-report?dryRun=1`
  (Autorisierung mit `CRON_SECRET`) baut den vollständigen Report und meldet die
  **Kanalkonfiguration** (`kanaele.webhook.konfiguriert`) — **ohne** irgendetwas zu
  versenden und ohne Systemfehler zu schreiben. Damit lässt sich der Alarmweg gefahrlos
  (auch im Preview) prüfen.
- **Empfänger-Endpunkt vorab testen (außerhalb von Vercel):** Der Betreiber kann seinen
  Ziel-Webhook einmal mit einem **Beispiel-Payload** (siehe Schema oben) per `curl`
  anstoßen und prüfen, dass HTTP 2xx zurückkommt und die Nachricht korrekt ankommt —
  bevor die URL überhaupt in Vercel gesetzt wird. So ist die URL geprüft, bevor sie
  produktiv wird (das war die Bedingung des Gründers für FT2-5).

## 3 · Aktivierungsschritte (erst mit FT2-5-Freigabe des Gründers)

1. **Webhook-URL bereitstellen** (Slack „Incoming Webhook", Discord-Webhook,
   Zapier/Make-Catch-Hook oder E-Mail-Relais) und wie in §2 vorab per `curl` prüfen.
2. `HELMUT_MONITORING_WEBHOOK_URL` in **Vercel → helmut-pilot → Settings → Environment
   Variables → Production** setzen. **(= FT2-5, freigabepflichtig, hier NICHT ausgeführt.)**
   Die URL ist ein Secret (enthält oft ein Token) → nur in Vercel + Passwort-Manager,
   nie ins Repo.
3. **Redeploy** (Env-Werte greifen erst im neuen Deployment).
4. Verifizieren: `GET /api/cron/health-report?dryRun=1` →
   `kanaele.webhook.konfiguriert = true`.
5. **Echter Zustellbeleg:** den nächsten regulären 06:00-UTC-Health-Report abwarten
   (oder einmal manuell auslösen) und `webhook.sent`/`webhook.status` prüfen. Dieser
   echte Zustelltest ist Teil des Beweistags (Protokoll §3, „Zweitkanal-Alarmtest").

## 4 · Ausdrücklich NICHT Teil dieser Vorbereitung

- Kein Setzen von `HELMUT_MONITORING_WEBHOOK_URL` (das ist FT2-5).
- Kein Deploy, keine Cron-/Migration-Änderung.
- Keine künstliche Auslösung eines nicht-grünen Reports zum „Testen" (kein bewusster
  Fehlerfall während der laufenden Beweisläufe).

_Letzte Aktualisierung: 2026-07-16. Rein dokumentarisch; Code unverändert._
