# Lokaler DeepSeek-Budgetwaechter

Betreiberauftrag vom27.09.2026. Der produktiv verwendete lokale Einstieg bleibt
`~/bin/helmut-deepseek` mit denselben acht Modi. Die dauerhafte Konfiguration ist
`~/.codex-deepseek/budget.json`, der gemeinsame atomare Zaehler
`~/.codex-deepseek/budget.sqlite3`. Das sind lokale Agentenkosten, nicht Helmuts
Production-Modellbudget. Kein Abonnement und kein dauerhafter Server.

| Modell / Denkstufe | Anfaenglicher Helferlauf-Deckel |
|---|---:|
| Flash High |2USD|
| Flash Max |3USD|
| Pro High |4USD|
| Pro Max |5USD|

Tagesdeckel:10USD je UTC-Tag, ueber alle Helferprozesse gemeinsam. Fertige Aufgaben
enden sofort. Nicht das gesamte Laufbudget wird ausgegeben oder vorab blockiert:
vor jedem Modellaufruf wird dessen konservativer Hoechstverbrauch atomar reserviert.
Bestaetigter Verbrauch gibt den ungenutzten Rest wieder frei. Historische belegte
Nutzung des Installationstags wird einmalig aus Codex-Verbrauchsquittungen uebernommen.
Reasoningtokens sind bereits in den Ausgabetokens enthalten und werden nicht doppelt
berechnet. Peak-Tarife sichern Reservierungen; Abrechnung beruecksichtigt Cache
und Tageszeit konservativ. Tarifquelle und Pruefdatum stehen in der Konfiguration.

Einmal pro Helferlauf darf ein Kosten- oder Ausgabetokenlimit automatisch mehr
Spielraum erhalten: doppelter kumulativer Laufdeckel und bei Tokenlimit doppelte
Ausgabegrenze bis zum Providermaximum. Tagesdeckel und Reservierungen gelten
unveraendert weiter. Ein Kostenlimit wird vor Versand derselben noch ausstehenden
Anfrage behandelt. Bei Tokenlimit werden unvollstaendige Modellantworten samt
Werkzeugaufrufen zurueckgehalten, bevor dieselbe Anfrage einmal wiederholt wird.
Bereits abgeschlossene Werkzeugaktionen werden nicht erneut ausgefuehrt. Ein
spaeteres zweites Limit erzeugt keine dritte automatische Ausfuehrung.

Ungeklaerte Provider-/Transportausgaenge bleiben konservativ reserviert und
werden nicht automatisch wiederholt. Reservierungen decken einen moeglichen
UTC-Tageswechsel ab; bei Abschluss am gleichen Tag wird die Folgetagsbindung
entfernt. Ein tatsaechlich ueber Mitternacht laufender Aufruf wird konservativ
an beiden Tagen beruecksichtigt. Ein verschwundener Prozess setzt keine Kosten
auf null. Abweichungen vom reservierten Hoechstverbrauch sperren weitere Laeufe.

Reichen10USD nicht, wird keine Anfrage gesendet. Der Starter liefert Exit78
mit `daily_go_required`; der Orchestrator muss den Betreiber ausdruecklich um
mehr Tagesbudget bitten und kostenlose unabhaengige Arbeit fortsetzen. Ein
ausdrueckliches GO wird mit UTC-Datum in `day_approvals` eingetragen, z.B.
`"2026-09-28": {"usd": 12, "explicit_user_approval": "Beleg der konkreten Nutzerfreigabe"}`.
Ohne reales GO keinen solchen Eintrag anlegen. Am Folgetag gilt wieder10USD.

## Installation und Pruefung

```
python3 -B tools/deepseek-budget/test_budget.py
python3 -B tools/deepseek-budget/install.py
python3 -B tools/deepseek-budget/install.py --install
~/bin/helmut-deepseek status
```

Der Installer sichert die bisherigen Dateien, erhaelt das Modellrouting und
uebernimmt vorhandene datierte Freigaben. Ein laufender alter DeepSeek-Helfer
verhindert die Installation. Updates setzen das Kostenbuch nicht zurueck.
Der Launcher startet einen nur fuer diesen Lauf bestehenden Loopback-Proxy.
Der echte API-Schluessel bleibt im Proxy; Codex erhaelt nur ein zufaelliges
lokales Zugangstoken. Rohprompts, API-Schluessel und Reasoning stehen nicht im
Kostenbuch. Direkte Starts mit der alten Provider-URL sind in der lokalen
Codex-Konfiguration gesperrt; der Launcher setzt den kontrollierten Laufport.
Socket- und Codex-Idle-Timeout sind beide auf die ausdrueckliche zweistuendige
Streamgrenze gebunden. Dadurch werden legitime lange High-/Max-Antworten nicht
schon nach fuenf Minuten als unbekannte Kosten abgebrochen.

Der lokale Test verwendet getrennte temporaere Kostenbuecher und Provider-Doubles,
keine Production und keine bezahlten Fehlerwiederholungen. Der praktische Leselauf
prueft zusaetzlich den installierten Starter, die echte Providerantwort und deren
Verbrauchsquittung. Versionskopie im Repository und installierte Runtime muessen
vor Abschluss denselben SHA256 haben.

## Verifikation am27.09.2026

- 25 gezielte Offline-Tests erfolgreich: gemeinsame Tagesgrenze auch bei parallelen
  Prozessen, einmalige Erweiterung, UTC-Wechsel, unbekannte Kosten, Tarifabrechnung
  und unveraendertes Modellrouting. Keine bezahlten Fehlerwiederholungen.
- Ein echter Flash-High-Leselauf ueber den installierten Starter endete erfolgreich:
  Session `01a0e2fe-70ef-7ea2-9430-0b5e4a93378a`, abgerechnete Kosten0,041138USD,
  keine offenen Reservierungen. Kein Production-Aufruf.
- Installation um13:21:32UTC: Repository und installierte Runtime identisch,
  SHA256 `050c141d206f7c71246ada4cfa3dd2bc2e5db6e496db1db1304ffb4237dbbfe9`.
  Anschliessende reine Statusabfrage:0,213398USD Tagesbindung, davon0,172260USD
  einmalig uebernommene historische Nutzung. Updates haben den Zaehler erhalten.
- Rueckweg: urspruengliche Starter-/Providerdateien liegen in
  `~/.codex-deepseek/backups/budget-20260927T131141532599Z/`; das Kostenbuch bei
  jeder Reparatur erhalten. Einen ungemessenen alten Starter nicht fuer neue
  Aufrufe verwenden; bevorzugt die gepruefte versionierte Runtime neu installieren.

Quellen: [Codex-Providerkonfiguration](https://learn.chatgpt.com/docs/config-file/config-reference),
[DeepSeek Responses](https://api-docs.deepseek.com/guides/responses_api/),
[DeepSeek-Tarife](https://api-docs.deepseek.com/quick_start/pricing/).
