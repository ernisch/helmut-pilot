# W15: letzte beobachtete Restorephase bei fehlendem Workerbericht

Stand: 30.10.2026. Diagnosekandidat auf Basis von PR990/991. Keine neue
Originalausführung, keine Speicheroptimierung und kein geänderter Ressourcenvertrag.

## Behobene Beobachtungslücke

Im Vollrestore41073062264 blieb nur der äußere RAM-Abbruch erhalten. Der innere
Worker konnte keinen Abschlussbericht liefern; seine Arbeitsphase war daher
UNKNOWN. Der historische FAIL und seine fehlenden Messwerte bleiben unverändert.

Der Worker meldet nun vor festgelegten Arbeitsschritten eine kleine geschlossene
Phasenkennung über seine bereits vorhandene private IPC-Pipe. Der vorhandene
Supervisor validiert und behält die zuletzt empfangene Kennung. Sie bleibt auch
bei RAM-Reject, Signal, partiellem EOF und fehlendem Abschlussbericht erhalten.
Es gibt keinen zusätzlichen Prozess, Thread, Socket oder Überwachungsdienst.

Die Meldungen enthalten ausschließlich feste Namen und eine fortlaufende Zahl:

```json
{"kind":"phase","sequence":1,"phase":"backup-collect"}
```

Höchstens128 Phasenmeldungen je Worker, jeweils höchstens256 Bytes; doppelte
aufeinanderfolgende Namen werden vom Sender ausgelassen. Alle Meldungen eines
Drain-Aufrufs teilen die bestehende höchstens eine Sekunde lange Lesefrist.
Unbekannte Namen, Schlüssel, Sequenzen, Übergröße und unvollständige Frames
führen geschlossen zum Fehler. Es werden keine Fehlertexte, Pfade, URLs,
Argumente, privaten Daten oder Zugangsdaten in die Meldung übernommen.

## Aussagegrenzen der Fehlerquittung

Zusätzlich zur unveränderten ersten Fehlerursache kann `runner.lastObservedPhase`
erscheinen:

```json
{"name":"backup-collect","sequence":1,"meaning":"ENTERED_NOT_COMPLETED"}
```

Ohne empfangene gültige Phasenmeldung bleibt der Wert ausdrücklich UNKNOWN.
Eine beobachtete Arbeitsphase ist **kein** Abschluss-, Integritäts- oder
Ursachenbeleg. Der letzte begrenzte Pipe-Drain vor dem Prozessstopp kann noch
eine nach dem RAM-Readback betretene Phase empfangen. Die Kennung wird deshalb
nicht als zeitgleiche Peakphase oder als vor dem Fehler betretene Phase bezeichnet.
Bereinigung überschreibt die zuletzt beobachtete Arbeitsphase nicht.

Die bereits geprüfte Fehlerdiagnose aus PR990 bleibt erhalten: `anon`, `file`,
`kernel`, `shmem`, `file_dirty`, `file_writeback` werden nach einem abgelehnten
Kernel-Readback begrenzt gelesen. Fehlende oder unlesbare Kategorien bleiben
UNKNOWN. Sie sind nach dem Fehler beobachtet und keine Zusammensetzung des
historischen Peaks. `file` enthält auch gemeinsam genutzten Speicher; Dirty,
Writeback, Shmem und Prozess-PSS werden nicht hinzuaddiert. Der optionale
PSS-Beobachter aus PR991 wird nicht als neuer Poller angeschlossen.

Python, äußerer Servicekanal und beide GitHub-Ausgabeadapter erhalten dieselbe
geschlossene Zusatzdiagnose. Ein ungültiger optionaler Checkpoint wird verworfen,
ohne eine vorhandene Fehlerphase, Ursache, Ressourcenprobe oder Bereinigungsquittung
zu löschen. Die letzte beobachtete Phase ersetzt niemals `worker.phase`.

## Anschlüsse und Prüfungen

Die festen Phasen decken Empfang, Cachevorbereitung, Materialisierung,
PostgreSQL-Bereitschaft, die fünf primären Restoreaktionen, vier Exporte,
Einfrieren, vollständige Sammlung, Versiegelung, Transport, Authentifizierung,
zweite Rücksicherung und Nachprüfung ab. Zweite Restore-/Exportaktionen geben
keine irreführend gleichnamige Primärphase aus: währenddessen bleibt ausdrücklich
`backup-recovery` beobachtet. Empfangs-Agentbereinigung und Fehlerbereinigung
ersetzen keine vorangehende Arbeitsphase.

Gezielte neue synthetische Prüfungen verwenden ausschließlich erfundene
Pipe-/Kernelwerte und eigene kurzlebige Testkinder: RAM-Reject ohne Abschluss,
gepufferten inneren Fehler, SIGKILL/partiellen EOF, ungültige/überzählige Frames,
gemeinsame Lesefrist, UNKNOWN, Alt-/Mockkanal und Rücksicherungskontext. Beide
GitHub-Adapter werden ohne echte Kindprozesse mit geschlossenen Beispielen
geprüft. Betroffene bisherige Runner-/Workflow-/Verbindungsprüfungen werden
übernommen bzw. nur wegen des tatsächlich geänderten Anschlusses erneut geprüft.
Die neue optionale Callback-Signatur wurde in drei alten Testadaptern ergänzt.

Keine erfolgreichen Originaltransfers, ursprünglichen sechs Python-Heapprofile,
500/500-Quellenqualifikationen oder nativen Minimalrestore-Belege werden wiederholt.
Erforderliche CI und unabhängiger Review werden auf dem tatsächlichen Kandidaten
gebunden. Diese Entwicklung behauptet keinen behobenen RAM-Verursacher.

## Freigabegrenze

Unverändert: hart2560000000Bytes, Peak≤2048000000Bytes,
Reserve≥512000000Bytes, Swap0; bestehende30Minuten, vollständiger Plattenplan
mit512MiB Reserve, höchstens0,05USD zusätzliche Speicherung, genau ein
verschlüsseltes Artefakt mit einem Tag Aufbewahrung, keine Modellaufrufe.
Vorhandene15Cipherteile/zwölf Originalpins,500Profile/0aktiv, Vollsicherung,
authentifizierter entfernter Readback und zweite frische Rücksicherung bleiben
die getrennt freizugebende spätere Abnahme. Bei FAIL/UNKNOWN stoppen, kein Retry,
kein Linkrefresh und keine automatische Branchrücksetzung oder Löschung.

Nach grüner erforderlicher CI, unabhängiger Abnahme und aktueller Codequalifikation
wird genau dieser Diagnosekandidat mit exaktem Commit zur separaten einmaligen
Restorefreigabe vorgelegt. Keine geschützte Ausführung durch diesen Sprint.
Der zugelassene Ausführungsbranch bleibt bis zu einer konkreten passenden
Freigabe unverändert. Production-Vertrag PR993 bleibt getrennt; End500 und
Mock500 bleiben bis zu ihren vorgeschriebenen Abnahmen und eigenen GO gesperrt.
