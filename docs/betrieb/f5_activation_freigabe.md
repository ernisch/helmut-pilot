# F5 — Zweiter Alarmkanal: Aktivierungs-Freigabevorlage

**Stand:** 2026-07-18 · **Status: TECHNISCH BETRIEBSBEREIT, NICHT AKTIVIERT.**
Diese Vorlage bündelt alles, was für die kontrollierte **Aktivierung** von F5
nötig ist. Aktivierung = Setzen von `HELMUT_MONITORING_WEBHOOK_URL` in Vercel
Production + Redeploy — **ausschließlich nach ausdrücklicher Gründer-Freigabe**
und mit vorab geprüfter Webhook-URL. Ohne diese Variable bleibt der gesamte Pfad
ein sauberer No-Op (fail-open).

**Verbindliche Grundlagen (gelesen):** `f5_freigabe.md`,
`zweitkanal-alarm-vorbereitung.md`, `health_report_rollierend.md`,
`production_beweisprotokoll.md` (§4.2, §5, §8), `env-inventar.md` (Zeile
`HELMUT_MONITORING_WEBHOOK_URL`).

**Geprüfter Stand (rein lesend, 2026-07-18):**
- **main** = `2ca0239` (GitHub-Wahrheit); der F5-vorbereitete Code liegt auf main.
- **Production** = Deployment `dpl_H45iY4wrhDSo6dnfbxpZJZAtAkwn` (target=production,
  READY), Commit `2ca0239` — identisch mit main. Der gehärtete Webhook-Code ist
  also **deployt**, aber **inaktiv** (`HELMUT_MONITORING_WEBHOOK_URL` ungesetzt;
  Beweisprotokoll §8.2: 06:00-Report grün, Webhook sauber übersprungen,
  `unconfigured`-Pfad).
- **Offline-Suite:** 129/129 Suiten grün (inkl. `monitoring-webhook-test` 20/20,
  `alarm-payload-test` 15/15, `secret-redaction`, `privacy-vollstaendigkeit`,
  `rolling-health`, `env-inventar`).

---

## 1 · Empfohlener Webhook-Empfänger

| Rang | Empfänger | Warum / Wann |
|---|---|---|
| **1 (empfohlen)** | **Slack „Incoming Webhook"** | Einfachster Weg; das Payload-Feld `text` wird direkt als Nachricht angezeigt; strukturierte Zusatzfelder bleiben im JSON erhalten. URL-Form `https://hooks.slack.com/services/T…/B…/…`. |
| 2 (Alternative, falls **nicht** Slack) | **Zapier/Make „Catch Hook"** | Flexibelstes Routing: kann den Alarm per E-Mail/SMS/Tabelle weiterleiten und die strukturierten Felder (`state`, `rollingCrawl`, …) auswerten. Kein SMTP-Secret in Helmut nötig. |
| 3 | **Eigener minimaler Empfänger** (z. B. Cloudflare Worker) | Volle Kontrolle über Verbleib/Verarbeitung der Metadaten (relevant für die Rechtsbewertung: Datenhaltung in eigener Hand statt bei Slack/Zapier). |
| — | Discord-Webhook | Technisch möglich, aber Discord erwartet `content` statt `text`; besser über einen Zapier/Make-Zwischenschritt. Nicht erste Wahl. |

**Nicht geeignet:** Endpunkte ohne HTTPS; Empfänger mit personenbezogener
Weiterverarbeitung außerhalb der Betreiberkontrolle; jede Umgebung, in der die
URL geloggt/geteilt wird (die URL **ist** das Zugriffstoken).

**Empfehlung, falls Slack nicht gewünscht:** **Zapier/Make Catch Hook** (flexibel,
E-Mail-/SMS-Routing) oder ein **eigener Cloudflare Worker** (Datenhoheit).

---

## 2 · Benötigte URL

- **Form:** ein einziger HTTPS-Endpunkt, der einen JSON-`POST` mit **2xx**
  quittiert. Beispiel Slack: `https://hooks.slack.com/services/T…/B…/…`.
- **Eigenschaft:** die URL ist ein **Secret** (enthält das Zugriffstoken) →
  ausschließlich in Vercel (Typ „Sensitive") + Passwort-Manager. **Nie** ins
  Repo, nie in Logs, nie in Chat/Tickets.
- **Vorprüfung durch den Betreiber (außerhalb Vercels), bevor die URL produktiv
  wird:**
  ```bash
  curl -sS -X POST "<WEBHOOK_URL>" -H 'Content-Type: application/json' \
    -d '{"source":"helmut-health-report","text":"F5-Vorabtest (manuell)","ok":true,"event_type":"heartbeat","event_id":"hb-vorabtest"}'
  ```
  Erwartung: HTTP 2xx **und** die Nachricht erscheint korrekt beim Empfänger.

---

## 3 · Genaue Payload

Der Payload wird **ausschließlich** von `buildAlarmPayload(report)`
(`lib/helmut/alarm-payload.js`) gebaut (Allowlist) und im Umschlag um
`event_id`/`event_type`/`attempt`/`sent_at` ergänzt
(`lib/helmut/monitoring-webhook.js`). Nichts anderes verlässt den Kanal.

**Heartbeat (grüner Tagesreport):**
```json
{
  "source": "helmut-health-report",
  "text": "<redigierter technischer Statustext, ≤2000 Zeichen>",
  "ok": true,
  "state": "Gesund",
  "severity": "info",
  "overdueCrons": [],
  "googleUrlResolutionRate": 0.998,
  "budget": { "calls": 12, "limit": 100, "remaining": 88, "skips": 0, "exhausted": false },
  "healthBlockers": [],
  "healthWarnings": [],
  "errors24": 0,
  "rollingCrawl": {
    "status": "aktuell-gesund", "alertLevel": "ok", "latestState": "gesund",
    "windowRuns": 3, "degradedRuns": 0, "stronglyDegradedRuns": 0,
    "recovered": false, "worstState": null,
    "worstFailedSources": null, "worstCheckedSources": null
  },
  "event_id": "hb-2026-07-18",
  "event_type": "heartbeat",
  "attempt": 1,
  "sent_at": "2026-07-18T06:00:03.123Z"
}
```

**Alarm (nicht-grüner Report):**
```json
{
  "source": "helmut-health-report",
  "text": "<redigierter technischer Statustext>",
  "ok": false,
  "state": "Degradiert",
  "severity": "alarm",
  "overdueCrons": ["crawl"],
  "googleUrlResolutionRate": 0.42,
  "budget": { "calls": 100, "limit": 100, "remaining": 0, "skips": 7, "exhausted": true },
  "healthBlockers": ["crawl-degradiert"],
  "healthWarnings": [],
  "errors24": 3,
  "rollingCrawl": {
    "status": "wiederholt-degradiert", "alertLevel": "alarm",
    "latestState": "stark-degradiert", "windowRuns": 3, "degradedRuns": 2,
    "stronglyDegradedRuns": 1, "recovered": false, "worstState": "stark-degradiert",
    "worstFailedSources": 129, "worstCheckedSources": 144
  },
  "event_id": "al-2026-07-18-<sha256-12>",
  "event_type": "alarm",
  "attempt": 1,
  "sent_at": "2026-07-18T06:00:03.456Z"
}
```

**Feld-Semantik (nur technische Metadaten):**
- `text` — freier Statustext, **redigiert** über `redactSensitive`, auf 2000
  Zeichen gekappt (Doppelboden gegen versehentliche Inhalte).
- `state`/`severity` — kurze Zustands-Slugs (≤40 / ≤24 Zeichen).
- `overdueCrons`/`healthBlockers`/`healthWarnings` — Listen technischer Slugs
  (je ≤40 Zeichen), keine Inhalte.
- `budget` — reine Zähler der KI-Budget-Achse.
- `rollingCrawl` — Zustands-Slugs + Zähler der rollierenden 24-h-Crawl-Sicht.
- `event_id` — **stabile Ereigniskennung** (Dedupe): grün → `hb-<Tag>` (ein
  Heartbeat/Tag); Alarm → `al-<Tag>-<hash(state|severity|healthBlockers|overdueCrons|rollingCrawl.status)>`.
  Gleiche Störung am selben Tag = gleiche Kennung.
- `event_type` — `heartbeat` | `alarm`. `attempt` — Versuchsnummer. `sent_at` — ISO-Zeitpunkt.

**Auslöser eines Alarms** (`report.ok=false`, aus `classifyOperationalState` +
rollierender Sicht): Store-Ausfall; veralteter/zu dünner Crawl (Frische,
`minCheckedSources`/`minSuccessfulSources`, Fehlerquote); veraltetes Output
(jüngstes complete-KO); veralteter Lage-Check; `errors24`;
`rollingCrawl.alertLevel === "alarm"` (`aktuell-degradiert` oder
`wiederholt-degradiert`). Ein **grüner** Report erzeugt statt eines Alarms den
Heartbeat.

---

## 4 · Datenschutzgrenzen

**Es werden ausschließlich technische Betriebsmetadaten übertragen.**
Doppelte Durchsetzung im Code:
1. **Allowlist** (`buildAlarmPayload`): nur die oben gelisteten technischen
   Skalar-/Zählfelder werden übernommen — Fremdfelder fallen weg.
2. **Redaction** (`redactSensitive`): der `text` läuft zusätzlich durch die
   Secret-/PII-Redaction (Env-Secret-Werte, JWT, `Bearer …`, `key=/token=/…`,
   E-Mail, Telefon, lange Hex-/Base64-Blobs).

**Ausgeschlossen (durch Tests belegt):** politische Inhalte, Briefingtexte,
Dokumenttitel/-inhalte, Namen, Nutzerprofile, E-Mail-Adressen, Secrets, sowie
die Webhook-URL/das Token selbst (kein Token-Leak im Payload).

> **Keine DSGVO-Konformitätsbehauptung.** Diese Grenzen sind technisch und durch
> Tests belegt, **nicht** rechtlich bewertet. Die Rechtsprüfung (Empfängerdienst,
> Auftragsverarbeitung, Drittlandtransfer bei Slack/Discord/Zapier) liegt beim
> Betreiber und ist **vor** der Aktivierung zu treffen.

---

## 5 · Risiken

| Risiko | Bewertung / Minderung |
|---|---|
| **URL-Leak** (URL = Token) | Nur in Vercel (Sensitive) + Passwort-Manager; nie loggen/committen. Bei Leak → Rotation (§6). |
| **Drittland-/Auftragsverarbeitung** (Slack/Zapier US) | Offen bis zur Rechtsprüfung des Betreibers; alternativ eigener Empfänger (Datenhoheit). Keine DSGVO-Aussage ohne juristische Prüfung. |
| **Fehlalarm-Ermüdung** | Warnstufe (🟡) kippt `report.ok` **nicht**; nur echte Alarme feuern. Dedupe verhindert Doppel-Alarme am selben Tag. |
| **Ausbleibender Heartbeat unbemerkt** | Empfänger-seitige Gegenprüfung nötig (z. B. Slack-Workflow „kein Heartbeat bis 09:00 → nachfragen") bzw. bestehender GitHub-Watchdog. |
| **Hängender/ausfallender Empfänger** | 8-s-Timeout je Versuch + begrenzter Retry; ein Kanalfehler kippt **weder** den Health-Cron **noch** den WhatsApp-Kanal (fail-safe, `Promise.all` unabhängig). |
| **Doppelte Zustellung** | Ereigniskennung + Dedupe-Liste (letzte 20) inkl. Flatter-Fall. |
| **Nebenbefund (vorbestehend):** stiller `watchdogStates`-Write-Ausfall | Betrifft nur das „Erholt"-Label, **nicht** Alarmlogik/rollierende Sicht/Zustellstatus. Als offener Punkt in der Restliste geführt. |

---

## 6 · Rollback / Deaktivierung

- **Sofort-Deaktivierung:** `HELMUT_MONITORING_WEBHOOK_URL` in Vercel Production
  entfernen + Redeploy → Kanal still aus (fail-open). WhatsApp-Kanal unverändert.
  Kein Code-Change, keine Migration.
- **URL-Rotation (bei Leak):** neue Webhook-URL beim Anbieter erzeugen,
  Vercel-Wert ersetzen, Redeploy, alte URL beim Anbieter löschen
  (`secret-rotation.md`-Muster).
- **Deployment-Rollback:** das vorherige Production-Deployment ist
  Rollback-Kandidat (Vercel „Promote to Production" der vorigen READY-Version);
  siehe `deploy-rollback.md`. Für die reine F5-Abschaltung genügt jedoch das
  Entfernen der Env-Variable + Redeploy.

---

## 7 · Testablauf (nach Aktivierung)

1. **Verifizieren ohne Versand:** `GET /api/cron/health-report?dryRun=1`
   (Bearer `CRON_SECRET`) → `kanaele.webhook.konfiguriert = true`. Kein Versand,
   kein Systemfehler.
2. **Meta-Heartbeat:** nächsten 06:00-UTC-Report abwarten **oder** einmal manuell
   auslösen (`GET /api/cron/health-report`, Bearer `CRON_SECRET`). Erwartung:
   `webhook.sent = true`, `event_type = heartbeat`, `event_id = hb-<Tag>`; beim
   Empfänger kommt **genau eine** Nachricht an.
3. **Zustellstatus:** im Auth-Store `monitoringWebhookDelivery` prüfen
   (eventId/eventType/sent/status/attempts/at/recentEventIds).
4. **Deduplizierung:** denselben Report am selben Tag erneut auslösen → Antwort
   `webhook.skipped = true`, `reason = "duplicate-event"`; beim Empfänger kommt
   **keine** zweite Nachricht an.
5. **Payload-Datenschutz:** die beim Empfänger angekommene Nachricht gegen die
   Allowlist prüfen — keine Namen/Profile/Briefingtexte/Dokumenttitel/E-Mail/Secrets.
6. **Kontrollierter technischer Testalarm (ohne echte Störung):** siehe §8, Punkt 5
   — nur mit ausdrücklicher Freigabe, **keine künstliche Störung auf Production**.

---

## 8 · Production-Aktivierung (Schrittfolge — erst nach Freigabe)

1. **Webhook-URL vorab prüfen** (§2, `curl` außerhalb Vercels): HTTP 2xx + korrekte Anzeige.
2. **Env-Wert setzen:** `HELMUT_MONITORING_WEBHOOK_URL` in Vercel → helmut-pilot →
   Settings → Environment Variables → **Production**, Typ **Sensitive** (§9/§10).
3. *(optional)* `HELMUT_MONITORING_WEBHOOK_RETRY_MAX` setzen (Default 2 genügt).
4. **Redeploy** (Env greift erst im neuen Deployment).
5. **Dry-Run-Verifikation** (§7.1): `kanaele.webhook.konfiguriert = true`.
6. **Meta-Heartbeat** auslösen/abwarten und Zustellung bestätigen (§7.2/§7.3).
7. **Deduplizierung** prüfen (§7.4).
8. **Kontrollierter Testalarm — ohne Production-Störung:** Der Alarmpfad ist durch
   die Offline-Suite (Mock-Server-Sturm) belegt. Ein *echter* Zustellbeleg des
   **Alarm**-Formats (statt Heartbeat) ist auf Production **nur** ohne künstliche
   Störung zu erbringen — Optionen, jeweils freigabepflichtig:
   (a) auf den **nächsten natürlichen** nicht-grünen Report warten (kein Eingriff);
   (b) den Heartbeat-Zustellbeleg als ausreichenden Live-Nachweis akzeptieren und
   den Alarm-Pfad weiter durch die Offline-Suite als belegt führen.
   **Keine bewusste Fehlerinjektion auf Production.**
9. **Payload-Datenschutz** am Empfänger prüfen (§7.5).
10. **Rollback-Möglichkeit** dokumentieren/bereithalten (§6).

---

## 9 · Notwendiger Env-Wert

| Variable | Pflicht | Wert | Ort |
|---|---|---|---|
| `HELMUT_MONITORING_WEBHOOK_URL` | für F5 | die geprüfte HTTPS-Webhook-URL (Secret) | Vercel Production, Typ **Sensitive** |
| `HELMUT_MONITORING_WEBHOOK_RETRY_MAX` | optional | ganze Zahl ≥0; Default **2** | Vercel Production (nur bei Bedarf) |

Kein weiterer Env-/Cron-/Migrationswechsel nötig. Der Health-Report-Cron
(`0 6 * * *`, `vercel.json`) und `sendMonitoringWebhook` sind bereits verdrahtet.

---

## 10 · Klare Anleitung für Vercel

1. **Vercel Dashboard** → Team **Nohut** → Projekt **helmut-pilot** →
   **Settings** → **Environment Variables**.
2. **Add New:**
   - **Key:** `HELMUT_MONITORING_WEBHOOK_URL`
   - **Value:** die geprüfte HTTPS-URL (aus §2).
   - **Environments:** **nur Production** ankreuzen (Preview/Development leer
     lassen — die URL ist ein Secret).
   - **Type:** **Sensitive** wählen (Wert danach nicht mehr lesbar; nur überschreibbar).
   - **Save.**
3. *(optional)* dieselbe Maske für `HELMUT_MONITORING_WEBHOOK_RETRY_MAX`.
4. **Deployments** → das aktuelle Production-Deployment → **⋯** → **Redeploy**
   (oder einen neuen Commit deployen). Env-Werte greifen erst im **neuen**
   Deployment.
5. **Verifizieren** wie §7 (Dry-Run → Heartbeat → Zustellstatus → Dedupe).
6. **Deaktivieren** (falls nötig): Variable entfernen → Redeploy (§6).

> Die URL zusätzlich **nur** im Passwort-Manager ablegen — nie ins Repo, nie in
> Logs, nie in Chat.

---

## 11 · Freigabe-Gate (vor jeder Production-Änderung)

Vor der Ausführung von §8 sind gebündelt zu klären:
1. die **geprüfte Webhook-URL** (per `curl` vorab verifiziert, HTTP 2xx);
2. Freigabe, **`HELMUT_MONITORING_WEBHOOK_URL`** in Production zu setzen;
3. Freigabe für den **Production-Redeploy**;
4. Freigabe für einen **kontrollierten technischen Testalarm** (im Rahmen von §8.8,
   **ohne** künstliche Störung auf Production).

Bis dahin bleibt F5 inaktiv; Code, Env, Cron und Migrationen unverändert.

_Letzte Aktualisierung: 2026-07-18. Rein dokumentarisch; Code/Env/Production unverändert._
