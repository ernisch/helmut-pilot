# Health-Report — rollierende Crawl-Betrachtung

**Stand:** 2026-07-17 · **Status:** implementiert + offline getestet, **nicht
deployt**. Motivation: Betriebsbefund B1 — der 06:00-Report sah nur den
jüngsten Crawl (`getLatestCrawlRun`) und übersah die stark degradierte
20:00-Störung, weil der 04:00-Lauf davor wieder gesund war
(`production_beweisprotokoll.md`, Morgenzyklus Teil 2).

## 1 · Was der Report jetzt betrachtet

`lib/helmut/rolling-health.js` (`buildRollingCrawlHealth`) wertet die
persistierten Crawl-Läufe aus:

- **Zeitraum:** striktes 24-h-Fenster. Störungen altern nach Fensterablauf
  ehrlich heraus (kein Dauer-Alarm nach Erholung); forensisch bleiben sie in
  `crawlRuns`/Telemetrie. Kein Lauf im Fenster → `unbekannt` (die
  Überfälligkeit alarmiert parallel der Cron-Check).
- **Je Lauf:** Zustand aus dem neuen `runState`-Feld, für Alt-Läufe abgeleitet
  aus den Zählern (rückwärtskompatibel).
- **Kennzahlen:** Anzahl Läufe im Fenster, Anzahl degradierter Läufe, Anzahl
  stark degradierter/fehlgeschlagener, **schlechtester Lauf** (runId, Zähler,
  Zustand), jüngster Zustand, **Erholung** (`recovered`: starke Störung im
  Fenster + jüngster Lauf gesund).

## 2 · Die fünf Report-Zustände

| Zustand | Bedeutung | Alarmwirkung (Empfehlung) |
|---|---|---|
| `aktuell-gesund` | jüngster Lauf gesund, keine Störung im Fenster | ok |
| `gesund-mit-stoerung-im-zeitraum` | jüngster Lauf gesund, aber genau 1 degradierter Lauf im Fenster (transient, ggf. `recovered`) | **Warnung**: eigene Report-Zeile 🟡 + Felder im Webhook-Payload; kippt `report.ok` NICHT |
| `aktuell-degradiert` | jüngster Lauf degradiert (einmalig) | **Alarm**: kippt `report.ok` |
| `wiederholt-degradiert` | ≥ 2 degradierte Läufe im Fenster (auch wenn der jüngste gesund ist) | **Alarm**: kippt `report.ok` |
| `unbekannt` | keine bewertbaren Läufe | Warnung (ehrlich, kein stilles Grün) |

**Begründung der Empfehlung (keine endgültige Produktentscheidung):** Ein
einmaliger, selbst-erholter Ausreißer soll sichtbar sein, aber keinen
WhatsApp-Alarm um 06:00 auslösen (Fehlalarm-Müdigkeit); ab dem zweiten
degradierten Lauf im Fenster oder bei aktueller Degradation ist es ein echter
Alarm. Wer strenger fahren will, kann die Warnstufe im Code auf Alarm heben —
eine Zeile (`alertLevel`-Mapping in `rolling-health.js`).

## 3 · Integration

- `buildHealthReport` (server.js) lädt `listCrawlRuns(10)` (ersetzt den
  bisherigen separaten `getLatestCrawlRun`-Read — ein Store-Read weniger, kein
  Inkonsistenzfenster zwischen „jüngster Lauf" und Fenster-Sicht), baut
  `rollingCrawl` und ergänzt bei Abweichung vom Normalzustand eine eigene Textzeile.
  Basis der Frische-/Qualitätsachsen ist der jüngste **nicht bewusst
  google-übersprungene** Lauf — ein `crawl-abstand`-Skip-Lauf ist eine
  Schutzmaßnahme und reißt die Absolutschwellen (minSuccessfulSources) nicht
  mehr fälschlich.
  (🟡 Störung im Fenster + „inzwischen erholt" / 🔴 wiederholt bzw. aktuell
  degradiert / ⚪ unbekannt).
- `report.ok` wird zusätzlich von `rollingCrawl.alertLevel === "alarm"` gekippt.
- **Webhook-Payload** (`buildAlarmPayload`): neues Allowlist-Feld
  `rollingCrawl` — ausschließlich Zustands-Slugs und Zähler (status,
  alertLevel, latestState, windowRuns, degradedRuns, stronglyDegradedRuns,
  recovered, worstState, worstFailed/CheckedSources). Keine URLs, Titel, Namen.
- Der Mehr-Mandanten-Aggregatreport übernimmt die rollierende Sicht des
  schlechtesten Mandats.

## 4 · Grenzen (ehrlich)

- Datengrundlage ist die Blob-Liste `crawlRuns` (Retention 20 Läufe) — bei
  > 20 Läufen/24 h (nicht der Normalfall) wäre das Fenster unvollständig.
- `lock-uebersprungen` erzeugt keinen Lauf-Datensatz und erscheint daher nicht
  im Fenster (bewusst; der Lock-Skip ist im Cron-Response sichtbar).
- Der Report bleibt täglich (06:00) — eine Störung wird also frühestens beim
  nächsten Report gemeldet. Eine sofortige Push-Eskalation je degradiertem Lauf
  wäre der nächste Ausbauschritt (nicht Teil dieses Sprints).
- `wiederholt-degradiert` alarmiert auch dann, wenn der jüngste Lauf schon
  wieder gesund ist — bewusst: ≥ 2 degradierte Läufe an einem Tag verdienen
  einen (einmaligen) Alarm; mit täglichem Report und 24-h-Fenster ist das genau
  ein alarmierter Report, danach altert die Störung heraus.
- Admin-/Release-Check-Ansichten (`isFullCrawlHealthy` u. a.) nutzen weiterhin
  den jüngsten Lauf und sind nicht skip-bewusst — ein Cooldown-Skip-Lauf kann
  dort bis zum nächsten Cron als „Prüfen" erscheinen (rein visuell, kein Alarmpfad).

## 5 · Testbelege

`scripts/rolling-health-test.js` (18 Assertions): B1-Regressionsfall
(Störung bleibt sichtbar, Warnung statt stillem Grün, schlechtester Lauf,
Erholung sichtbar), alle fünf Zustände, Fenster-/lastN-Verhalten, Alt-Läufe
ohne `runState`, `cooldown-reduziert` zählt nicht als Degradation.
Zusätzlich `scripts/alarm-payload-test.js` (Allowlist um `rollingCrawl`
erweitert, PII-/Secret-Redaction unverändert belegt).
