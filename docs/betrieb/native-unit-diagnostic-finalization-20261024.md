# Native Einzelunit: Fehler und Abschluss absichern

Stand: 24.10.2026 UTC. Lokaler Code-/Synthetiknachweis auf Basis
`2fc821fd7bbdef1cf9846001e041a847a9f58f8f`; keine neue native Diagnose.

## Befund und Grenze

Für den gemeldeten Fall `32b3682761d17a768fa907b78df6a885` wurden in diesem
Arbeitsstand keine erreichbaren Primärartefakte gefunden. Die gemeldeten vier
Schreibbestätigungen, Statistikaufnahmen, Exit1 und der bei `checkedCount=0`
unterbrochene RAW-Endcheck werden weder wiederholt noch nachträglich als Erfolg
gewertet. Ein abgebrochener Lesecheck belegt keine Originalmutation. Sein
ursprünglicher Auslöser bleibt unbekannt.

Der getrennte vorhandene [31er Fehlerbeleg](belege/v12-native-unit-integration-20261022/NATIVE_31_ENTRY_START_FAILURE.SAFE.json)
nennt zuerst `source-host-reply-deadline` und danach den fehlenden Service im
Hostmapping. Er ist kein Primärbeleg für die Kennung `32b368…`.

Der Code ermöglicht diese Fehlerkaskade: `NodeChild` räumt einen fehlgeschlagenen
Dienst bereits vor der Controller-Fehleraufzeichnung ab; der Host sucht dessen
lebende PID weiter und scheitert mit `source-service-host-mapping`. Der Supervisor
stoppt dann SOURCE. Dessen bisheriger Signalhandler wirft auch während des letzten
RAW-Hashes erneut `InterruptedError`. Zusätzlich konnten PG- oder private
Log-Schreibfehler die folgenden Originalprüfungen ganz überspringen. Dies grenzt
einen Codefehler ein, rekonstruiert aber nicht den unbekannten Erstfehler von32b.

## Änderung

- SOURCE speichert den ersten konkreten Fehler atomar vor dem Kinder-Abbruch.
  Auswahl und aktuelle Controllerstufe sind gebunden; der langlebige Service
  erhält Stufenwechsel. Spätere Fehler ersetzen den Beleg nicht. PRIVATE-Trace
  maximal8192ASCII-Zeichen, Gesamtrahmen maximal64KiB; keine privaten Details im
  öffentlichen Ergebnis. Fehlgeschlagene Persistenz wird ausdrücklich gemeldet.
- Der Controller erfasst auch Konstruktorfehler und hält den ursprünglichen
  Exceptiongegenstand intern für den privaten Worker-Fallback. Ein eigener
  Fehlerabschluss speichert tatsächlichen Serviceexit und natürliche EOF-Flags;
  unbekannte Werte ergeben keinen Erfolg und erlauben keinen Retry.
- Der Host erkennt ausschließlich den exakt gebundenen SOURCE-Fehler als
  dauerhaften Zustand `SOURCE_FAILED`, schließt seine registrierten Kinder und
  lässt SOURCE seine Originalchecks beenden. Es gibt keine neue Erfolgsantwort.
  Die Nachprüfung im Host-Exceptionpfad gilt nur für den bekannten Mappingfehler;
  ein anderer früher Hostfehler bleibt erhalten.
- Der Worker hält den Erstfehler getrennt von PG-/Log-Cleanupfehlern und erreicht
  danach weiter die Originalchecks. TERM/INT bricht laufende Arbeit weiterhin ab.
  Nur im terminalen Cleanup-/Leseabschluss wird ein Folgesignal gezählt und lässt
  den vorhandenen Abschluss weiterlaufen; jedes solche Signal erzwingt FAIL.
  Vor Erfolgsentscheidung und Ergebnisspeicherung gilt wieder normales Abbrechen.
- Das Ergebnis nennt Cleanupfehler, Folgesignale und geprüfte/erwartete Quellpins.
  Bei einem RAW-/Quelllesefehler bleibt der Rest ehrlich unvollständig. Auch
  `originalRAWUnchanged` wird durch den tatsächlichen Endcheck überschrieben;
  ein früheres True bleibt nicht als aktuelle Bestätigung stehen. False bedeutet
  hier fehlende Bestätigung und behauptet keine nachgewiesene Mutation.

Die bisherigen270-/300-/35s-Grenzen und die vorhandenen Notabschlussfristen
bleiben unverändert. Kein Retry unbekannter Writes, kein Ersatzoriginal,
keine Änderung an `local-unit-native-transaction-guard.js`, Supervisor oder CI.

## Gezielte synthetische Prüfung

Alle folgenden finalen Befehle endeten mit Exit0:

| Befehl | Ergebnis |
| --- | --- |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/helmut-resource-meter/local-unit-native-worker-final-capture-test.py` |17/17 PASS |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/helmut-resource-meter/local-unit-native-execution-source-test.py` |24/24 PASS |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/helmut-resource-meter/local-unit-native-execution-controller-test.py` |33/33 PASS |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/helmut-resource-meter/local-unit-native-execution-host-test.py` |156/156 PASS |

Der erste Controllerlauf scheiterte an genau einem bestehenden Testfake ohne die
neue Kontextsignatur/Stufe. Nach Anpassung dieses Fakes bestand die Suite; dies
war kein nativer Diagnosefehler. Worker-/Host-Wiederholungen prüften anschließend
neue Abschluss-DTO- beziehungsweise Erstfehler-Regressionen.

Worker und Controller verwenden isolierte AST-/Speicher-/Dateifixtures. Die
Host-Suite nutzt zusätzlich kurze isolierte Python-/Node-Testprogramme, unter
anderem für Pipes und den Beobachtercode in einer synthetischen Node-VM. SOURCE
verwendet kurze synthetische Pythonkinder zur echten Prüfung von Pipes, Exit und
TERM/KILL. Keine nativen Diagnose-, Docker-, PG- oder Motorstarts,
Anbieteraufrufe oder Originalzugriffe. Die grünen CI-Läufe wurden nicht wiederholt.

Die abschließende Code-/Diffprüfung und Syntaxprüfung sind bestanden. Die
Workerfunktionen für Pins, Guards, Capture, Laufzeitumgebung und Queries sowie
die SQL-/Runtime-Einstellungen sind per AST-Vergleich zur Basis unverändert;
`local-unit-native-transaction-guard.js` ist byteidentisch. Ein echter nativer
Fehlerabschluss, Originalerhaltung des
historischen32b-Laufs oder eine neue Unit60-/500er-Abnahme sind damit nicht belegt.
