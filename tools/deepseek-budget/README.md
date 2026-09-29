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

Mit ausdruecklichem Betreiberauftrag vom29.09.2026 gelten fuer lokale
DeepSeek-Arbeit zwei Tagesgrenzen je UTC-Tag ueber alle Helferprozesse gemeinsam:
10USD Warnschwelle und20USD harter Sicherheitsdeckel. Die Warnschwelle informiert
nur und stoppt keine Arbeit. Ab ihr soll Terra ausschliesslich den kritischen Pfad
bearbeiten und hoechstens zwei bezahlte DeepSeek-Agenten gleichzeitig starten.
Der harte Deckel umfasst bestaetigte Kosten, laufende Reservierungen und
ungeklaerte konservative Bindungen. Fertige Aufgaben enden sofort. Nicht das
gesamte Laufbudget wird ausgegeben oder vorab blockiert: vor jedem Modellaufruf
wird dessen konservativer Hoechstverbrauch atomar reserviert.
Bestaetigter Verbrauch gibt den ungenutzten Rest wieder frei. Historische belegte
Nutzung des Installationstags wird einmalig aus Codex-Verbrauchsquittungen uebernommen.
Reasoningtokens sind bereits in den Ausgabetokens enthalten und werden nicht doppelt
berechnet. Peak-Tarife sichern Reservierungen; Abrechnung beruecksichtigt Cache
und Tageszeit konservativ. Tarifquelle und Pruefdatum stehen in der Konfiguration.
Die Laufdeckel2/3/4/5USD und die einmalige Erweiterung bleiben unveraendert.

## Peak-Sperre (keine neue autonome Arbeit)

Montag bis Freitag genau [01:00,04:00) und [06:00,10:00) UTC startet keine neue
autonome Helmut-KI-Arbeit. Das Wochenende ist ganztägig frei. In Tuerkei-Zeit
(UTC+3) sind das die Pausen04:00-07:00 und09:00-13:00; Arbeit ist Montag bis
Freitag07:00-09:00 sowie13:00-04:00 des Folgetags. Nur eine ausdrueckliche,
fallbezogene Nutzerfreigabe hebt die Sperre fuer genau diesen Fall auf. Ein
bereits vor Peak gestarteter Aufruf darf sauber zu Ende laufen und wird nicht
abgebrochen.

Technisch prueft der Launcher die Sperre vor der Reservierung und unmittelbar vor
dem Provider-Versand ueber dieselbe zentrale Tarif- und Peak-Funktion
`runtime.peak()`. Faellt die Zeit nach der Reservierung in Peak, wird die
Reservierung auf0 abgerechnet/freigegeben und der Provider nicht aufgerufen.
Der Lauf endet dann mit dem eigenen Fehlercode `peak_blocked` (Exit79), nicht mit
`daily_go_required`. Die lokale halbstuendliche Helmut-Automation nutzt getrennte
aktive Werktag-/Wochenend-RRULEs, plant in Peak keinen Modelllauf ein und startet
am ersten halbstuendlichen Off-Peak-Termin automatisch wieder. Der UTC-Check im
Automationsprompt bleibt eine zweite Sperre gegen Fehlplanung.

Einmal pro Helferlauf darf ein Kosten- oder Ausgabetokenlimit automatisch mehr
Spielraum erhalten: doppelter kumulativer Laufdeckel und bei Tokenlimit doppelte
Ausgabegrenze bis zum Providermaximum. Tagesdeckel und Reservierungen gelten
unveraendert weiter. Ein Kostenlimit wird vor Versand derselben noch ausstehenden
Anfrage behandelt. Bei Tokenlimit werden unvollstaendige Modellantworten samt
Werkzeugaufrufen zurueckgehalten, bevor dieselbe Anfrage einmal wiederholt wird.
Bereits abgeschlossene Werkzeugaktionen werden nicht erneut ausgefuehrt. Ein
spaeteres zweites Limit erzeugt keine dritte automatische Ausfuehrung.

Ungeklaerte Provider-/Transportausgaenge bleiben konservativ gebunden und
werden nicht automatisch wiederholt. Der Status kennzeichnet sie getrennt als
`unknown`; laufende Reservierungen bleiben `reserved`, bestaetigte Nutzung
`spent` beziehungsweise historische bestaetigte Nutzung `historical`. Reservierungen decken einen moeglichen
UTC-Tageswechsel ab; bei Abschluss am gleichen Tag wird die Folgetagsbindung
entfernt. Ein tatsaechlich ueber Mitternacht laufender Aufruf wird konservativ
an beiden Tagen beruecksichtigt. Ein verschwundener Prozess setzt keine Kosten
auf null. Abweichungen vom reservierten Hoechstverbrauch sperren weitere Laeufe.

Reichen20USD nicht, wird keine Anfrage gesendet. Der Starter liefert Exit78
mit `daily_go_required`; der Orchestrator muss den Betreiber ausdruecklich um
mehr Tagesbudget fuer genau diesen UTC-Tag bitten und kostenlose unabhaengige
Arbeit fortsetzen. Ein ausdrueckliches GO wird mit UTC-Datum in
`day_approvals` eingetragen, z.B.
`"2026-09-28": {"usd": 25, "explicit_user_approval": "Beleg der konkreten Nutzerfreigabe"}`.
Ein belegter alter Freigabewert bis zum harten Standarddeckel ist redundant und
senkt den Deckel nicht. Ohne reales GO keinen solchen Eintrag anlegen. Am
Folgetag gilt wieder20USD. Die10-USD-Warnschwelle braucht kein GO.

`~/bin/helmut-deepseek status` zeigt bestaetigte Kosten, aktive Reservierungen,
ungeklaerte Bindungen, Gesamtbindung sowie den noch verfuegbaren Betrag bis
Warnschwelle und hartem Deckel getrennt. Eine Reservierung ist daher nicht als
bereits bezahlte Providerrechnung zu interpretieren.

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
Zusaetzlich installiert er idempotent eine eng begrenzte Codex-Regel fuer den
exakten absoluten Launcherpfad. Dadurch laufen Keychain-Zugriff, Provider-Netzwerk
und Kostenbuch ausserhalb der Workspace-Sandbox, ohne andere Befehle freizugeben;
bestehende Codex-Regeln werden erhalten.
Der Repository-GUARD in `runtime.py` bewahrt die zusaetzlichen Saetze
"Keine Secrets lesen, kopieren oder veraendern. Keine Vercel-Aenderungen.",
damit eine Neuinstallation sie nicht entfernt.
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

## Verifikation am29.09.2026

- 33 gezielte Offline-Tests erfolgreich (`python3 -B tools/deepseek-budget/test_budget.py`):
  zusaetzlich Peak-Grenzfenster, Wochenende, Block vor Reservierung und vor dem
  Provider-Versand, Uebergang zwischen Reservierung und Versand mit sauberer
  Freigabe, Retry-Recheck in Peak, eigener Exitcode `peak_blocked` gegen
  `daily_go_required`, 15-USD-Tagesdeckel sowie unveraenderte Laufdeckel
  2/3/4/5USD und unveraenderte einmalige Erweiterung. Keine bezahlten
  Fehlerwiederholungen, kein Provider-Aufruf in den Tests.
- Die geaenderte Runtime, der15-USD-Deckel, die Peak-Sperre und die eng begrenzte
  Launcher-Regel wurden lokal installiert. Repository- und Installationskopie der
  Runtime werden vor Abschluss per SHA256 abgeglichen.

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
