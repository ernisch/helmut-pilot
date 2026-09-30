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

Fuer lokale DeepSeek-Arbeit gilt ein gemeinsamer harter Tagesdeckel von10USD je
UTC-Tag ueber alle Helferprozesse. Der Launcher meldet ab8USD und verlangt vor
einer neuen konservativen Reservierung ab9USD eine ausdrueckliche
Tageserhoehung. Ohne konkretes GO bleibt10USD der harte Deckel. Ein GO erhoeht nur den
Deckel fuer diesen UTC-Tag; bestaetigte oder gebundene Kosten werden niemals auf
null gesetzt. Der harte Deckel umfasst bestaetigte Kosten, laufende Reservierungen
und ungeklaerte konservative Bindungen. Fertige Aufgaben enden sofort. Nicht das
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
Freitag07:00-09:00 sowie13:00-04:00 des Folgetags.

Ein manueller Nutzerprompt darf die Sperre fuer genau einen Auftrag aufheben, wenn
seine erste nichtleere Zeile exakt `PEAK GO EINMALIG` lautet. Terra setzt dann
nur fuer die zu diesem Auftrag gehoerenden DeepSeek-Helfer den Launcher-Parameter
`--peak-go-einmalig`. Der Parameter wird nicht gespeichert und gilt nur fuer
den jeweiligen Launcher-Prozess. Automationen und Scheduler duerfen das Codewort
oder den Parameter niemals selbst erzeugen oder aus einem frueheren Prompt
wiederverwenden. Die Ausnahme veraendert weder Kostenlimits noch Production-,
Merge- oder sonstige Schutzregeln.

Technisch prueft der Launcher die Sperre vor der Reservierung und unmittelbar vor
dem Provider-Versand ueber dieselbe zentrale Tarif- und Peak-Funktion
`runtime.peak()`. Ohne einmalige Ausnahme wird ein Peak-Lauf weiterhin blockiert
und endet mit `peak_blocked` (Exit79). Mit `--peak-go-einmalig` wird nur fuer
diesen Prozess nicht blockiert; die Peak-Tarife bleiben voll wirksam. Die lokale
halbstuendliche Helmut-Automation bleibt unveraendert Off-Peak gebunden und startet
am ersten halbstuendlichen Off-Peak-Termin automatisch wieder.

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

Schon vor10USD wird gefragt: wuerde eine neue Reservierung mindestens9USD
Tagesbindung erzeugen und existiert noch keine Tageserhoehung, liefert der Starter
`daily_extension_go_required` mit Exit80. Terra fragt den Betreiber sofort nach
einem hoeheren Tagesdeckel fuer genau diesen UTC-Tag. Der Kostenzaehler wird dabei
nicht zurueckgesetzt. Reicht auch ein bereits freigegebener hoeherer Deckel nicht,
liefert der Starter Exit78 mit `daily_go_required`. Ein ausdrueckliches GO wird mit UTC-Datum in
`day_approvals` eingetragen, z.B.
`"2026-09-28": {"usd": 25, "explicit_user_approval": "Beleg der konkreten Nutzerfreigabe"}`.
Ein belegter alter Freigabewert bis zum harten Standarddeckel ist redundant und
senkt den Deckel nicht. Ohne reales GO keinen solchen Eintrag anlegen. Am
Folgetag gilt wieder10USD. Die8-USD-Warnschwelle braucht kein GO.

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
  `daily_go_required`, damaligen15-USD-Zwischenstand sowie unveraenderte Laufdeckel
  2/3/4/5USD und unveraenderte einmalige Erweiterung. Keine bezahlten
  Fehlerwiederholungen, kein Provider-Aufruf in den Tests.
- Historischer Zwischenstand: Die damalige Runtime, der spaeter ersetzte15-USD-Deckel, die Peak-Sperre und die eng begrenzte
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
