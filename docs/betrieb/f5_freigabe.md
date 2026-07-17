# F5 — Zweiter Alarmkanal: Freigabe-Anleitung

**Stand:** 2026-07-17 · **Status: TECHNISCH VORBEREITET, NICHT AKTIVIERT.**
Aktivierung = Setzen von `HELMUT_MONITORING_WEBHOOK_URL` in Vercel Production —
**ausschließlich nach ausdrücklicher Gründer-Freigabe (F5)** und mit vorab
geprüfter Webhook-URL. Ohne diese Variable ist der gesamte Pfad ein sauberer
No-Op. Vorgängerdokument: `docs/betrieb/zweitkanal-alarm-vorbereitung.md`.

## 1 · Was der Kanal jetzt kann (dieser Sprint, `lib/helmut/monitoring-webhook.js`)

| Anforderung | Umsetzung |
|---|---|
| Nur technische Metadaten | Payload ausschließlich über `buildAlarmPayload` (Allowlist + `redactSensitive`-Doppelboden). Keine Namen, Nutzerprofile, politischen Inhalte, Dokumenttitel, Briefingtexte, Secrets, keine vollständigen URLs mit sensiblen Parametern. Neu: `rollingCrawl` (nur Zustands-Slugs + Zähler). |
| Stabile Ereigniskennung | `event_id`: grün → `hb-<Tag>` (ein Heartbeat/Tag); Alarm → `al-<Tag>-<hash(Zustand+Blocker+Crons+rollierender Status)>`. Gleiche Störung am selben Tag = gleiche Kennung. |
| Schutz gegen doppelte Alarme | bereits erfolgreich zugestellte Ereignisse werden übersprungen (`duplicate-event`); das Gedächtnis ist eine LISTE der letzten 20 zugestellten Kennungen — auch ein Flattern (Alarm → anderes Ereignis → derselbe Alarm) bleibt dedupliziert. Ein GEÄNDERTER Zustand erzeugt eine neue Kennung und wird zugestellt. Der Skip trägt `unconfigured=false` (Unterscheidung vom „Kanal nicht eingerichtet"-Skip — der Health-Cron wertet das aus). |
| Zustellstatus | jedes Ergebnis (eventId, eventType, sent, HTTP-Status, Versuche, Zeitpunkt, Ereignis-Gedächtnis) wird im Auth-Store persistiert (`monitoringWebhookDelivery`) — nachprüfbar, ob der Kanal real zustellt. |
| Begrenzte Wiederholung | Netzfehler/5xx/429: bis `HELMUT_MONITORING_WEBHOOK_RETRY_MAX` (Default 2) Wiederholungen mit exponentiellem Backoff; 4xx wird nie wiederholt; harte Obergrenze, 8-s-Timeout je Versuch — der Health-Cron kann nie hängen. |
| Meta-Heartbeat | auch ein GRÜNER Tagesreport wird zugestellt (`event_type=heartbeat`, `hb-<Tag>`). Bleibt der tägliche Heartbeat beim Empfänger aus, ist der Alarmweg selbst gestört — das prüft der Empfänger (z. B. Slack-Workflow „kein Heartbeat bis 09:00 → nachfragen") bzw. der bestehende GitHub-Watchdog-DryRun-Check. |
| Mock-Test | `scripts/monitoring-webhook-test.js` (20 Assertions, lokaler Mock-Webhook): No-Op ohne URL (inkl. `unconfigured`-Flag), Zustellung+Status, Dedupe inkl. Flatter-Fall, Retry-Regeln inkl. Obergrenze, Heartbeat, PII-/Secret-Freiheit, kein URL-/Token-Leak im Payload. |

Payload-Schema = bisheriges Schema (`zweitkanal-alarm-vorbereitung.md` §1) plus
`event_id`, `event_type`, `attempt`, `sent_at`, `rollingCrawl` (Zähler).

## 2 · Welche Webhook-URL geeignet ist

Geeignet ist jeder HTTPS-Endpunkt, der JSON-POSTs mit 2xx quittiert und dessen
URL-Token als Secret behandelt werden kann:

1. **Slack „Incoming Webhook"** (empfohlen: einfachster Weg, `text`-Feld wird
   direkt angezeigt) — URL-Form `https://hooks.slack.com/services/…`.
2. **Discord-Webhook** (`https://discord.com/api/webhooks/…`; Discord erwartet
   `content`, zeigt aber JSON-Posts via Integrationen — praktisch: einen
   Zapier/Make-Zwischenschritt nutzen oder Slack bevorzugen).
3. **Zapier/Make „Catch Hook"** — flexibelstes Routing (E-Mail, SMS, Tabelle),
   strukturierte Zusatzfelder nutzbar.
4. **Eigener minimaler Empfänger** (z. B. Cloudflare Worker), wenn volle
   Kontrolle gewünscht ist.

**Nicht geeignet:** Endpunkte ohne HTTPS, Endpunkte mit personenbezogener
Empfängerlogik außerhalb der Betreiberkontrolle, oder URLs, die geloggt/geteilt
werden (die URL enthält das Zugriffstoken!).

## 3 · Sichere Aktivierung (Schrittfolge, erst nach F5-Freigabe)

1. **URL vorab prüfen** (außerhalb Vercels): einmal per `curl` einen
   Beispiel-Payload posten und HTTP 2xx + korrekte Anzeige beim Empfänger
   verifizieren:
   ```bash
   curl -sS -X POST "<WEBHOOK_URL>" -H 'Content-Type: application/json' \
     -d '{"source":"helmut-health-report","text":"F5-Vorabtest (manuell)","ok":true,"event_type":"heartbeat","event_id":"hb-vorabtest"}'
   ```
2. `HELMUT_MONITORING_WEBHOOK_URL` in **Vercel → helmut-pilot → Settings →
   Environment Variables → Production** setzen (Typ „Sensitive"). Die URL
   zusätzlich NUR im Passwort-Manager ablegen — nie ins Repo, nie in Logs.
3. Optional `HELMUT_MONITORING_WEBHOOK_RETRY_MAX` setzen (Default 2 genügt).
4. **Redeploy** (Env greift erst im neuen Deployment).
5. Verifizieren ohne Versand: `GET /api/cron/health-report?dryRun=1` →
   `kanaele.webhook.konfiguriert = true`.
6. **Echter Zustellbeleg:** nächsten 06:00-UTC-Report abwarten (oder einmal
   manuell auslösen) und prüfen: Response-Feld `webhook.sent=true` + im
   Auth-Store `monitoringWebhookDelivery` (eventId `hb-<Tag>`); beim Empfänger
   kommt genau EINE Nachricht an (Dedupe: ein zweiter manueller Trigger am
   selben Tag wird übersprungen — erwartetes Verhalten).
7. Ab dann gilt: Heartbeat täglich; ausbleibender Heartbeat = Alarmweg prüfen.

## 4 · Rotation / Deaktivierung

- **Leak der URL:** neue Webhook-URL beim Anbieter erzeugen, Vercel-Wert
  ersetzen, Redeploy, alte URL beim Anbieter löschen (`secret-rotation.md`-Muster).
- **Deaktivierung:** Variable entfernen + Redeploy → Kanal still aus
  (fail-open), WhatsApp-Kanal unverändert.

## 5 · Datenschutz-Einordnung (ehrlich)

Der Kanal überträgt ausschließlich technische Betriebsmetadaten (Zähler,
Zustands-Slugs, redigierter Statustext); Tests belegen Redaction von
E-Mail/Secrets und die Abwesenheit von Profil-/Dokument-/Briefinginhalten.
**Damit ist KEINE DSGVO-Konformität behauptet** — die rechtliche Bewertung
(u. a. Empfängerdienst, Auftragsverarbeitung, Drittlandtransfer bei
Slack/Discord/Zapier) liegt beim Betreiber und ist vor F5 zu treffen.
