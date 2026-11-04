# W15: sichere innere Prepare-Fehlerweitergabe

Stand04.11.2026. Entwicklungsauftrag ausschließlich für die Fehlerweitergabe;
kein neuer Original-/Diagnoselauf, keine Profilaktivierung oder Serienfreigabe.

## Beleg und nachgewiesener Diagnosefehler

[Run41818696152](https://github.com/ernisch/helmut-pilot/actions/runs/41818696152),
Job126536023497 auf Runtime789ea3ad bleibt FAIL nach425Sekunden in
`mock500-controller-prepare`. Der authentifizierte erhaltene Log enthält nur
diese Phase und `WORKER_REPORTED_FAILURE`. Private innere Prepare-Logs und
die innere Fehlerdatei sind nicht mehr erreichbar; es gibt kein Artefakt.
Die konkrete damalige Assertion bleibt **UNKNOWN**. Kein nachträglicher PASS.

Nachgewiesen und klein synthetisch reproduziert ist der Diagnoseverlust:
Der Controller sammelt die Node-Ausgabe privat, transportiert aber nur Phase
und Materials-Details. Eine vorhandene Prepare-Kennung erreicht die wirklichen
Workflow-/Worker-/Pipe-Grenzen nicht. Derselbe Gegenfall besteht nach dem Fix.
Der vorhandene JS-Fehlerdatensatz enthält außerdem keinen Stack. Sein lediglich
regexgeprüfter Nachrichtentext wird ausdrücklich nicht öffentlich weitergegeben.

## Eng begrenzte Änderung

Ein reiner Projektor bildet die erste Prepare-Ausnahme auf vier feste Felder ab:
`schema`, `stage`, `category`, `kind`. Die Kategorie enthält ausschließlich
einen bekannten öffentlichen Codemodul-Präfix und eine Zeilennummer1–65535;
ohne bekannte Prüfstelle bleibt sie `PREPARE_UNMAPPED`. Keine Nachricht, Rohstack,
SQL, URL, Kennung, Eingabewert oder privater Pfad ist Teil dieses Formats.

Der erste Fehler wird vor `finally` synchron als kleiner JSON-Frame auf dem
bereits vorhandenen stderr-Kanal gemeldet. Der bestehende Supervisor liest ihn
ausschließlich im Prepare-Schritt bis512Bytes; nur der erste gültige Frame zählt.
Das bereits bestehende private Stage-Log und der begrenzte Pipe-Transport werden
weiterverwendet. Ein zuerst beobachteter nichtnulliger Prozessabschluss darf
seinen nachlaufenden vollständigen Fehlerframe behalten. Bereits frühere Wächter-,
Timeout-, Signal- oder Leserfehler werden nicht durch spätere Abbruchmeldungen
umgedeutet. Teilnachrichten, Übergröße und ungültige Angaben bleiben UNKNOWN.

`prepareFailure` wird nur von der exakten gestagten Controller-Fehlerklasse in
Phase `mock500-controller-prepare` übernommen, dann an jeder bestehenden Grenze
erneut geschlossen geprüft: Mock-Workflow → Worker → bestehende64KiB-Pipe →
öffentliche JS-Action. Spätere Bereinigungsfehler können die erste Kennung nicht
ersetzen. Eine Diagnose erzeugt weder Ausführungsrechte noch Ergebnis-/Cleanup-PASS.

## Gezielte Prüfungen und Grenzen

Neun Python-Gruppen prüfen den tatsächlichen Controller-/Workflow-/Pipe-Weg,
die echten Stage-Reader, verspäteten Exit, partielle/überlange Frames, vorherige
Wächterfehler, Signal/Bereinigungsfehler und die exakte Fehlerklassenbindung.
Sieben JS-Gruppen prüfen die tatsächlichen Prepare-/Kalender-/Recorder-Funktionen,
Erstfehler vor `finally`, Recorderfehler, den unveränderten Erfolgsweg, sichere
Codestellen, Canary-/Getterfälle, JS-/Python-Parität und die echte öffentliche
Action nach dem realen Pipe-Transport. Alle bestehen ausschließlich synthetisch.
Ein unabhängiger Review fand zusätzlich Signal-/Wartefehler vor dem verspäteten
ersten Frame. KeyboardInterrupt, Warte-IO-Fehler und negativer Signalexit wurden
vor der Korrektur reproduziert; danach behalten sie Vorrang. Nur ein normaler
positiver Fehlerexit darf seinen vollständig nachlaufenden Frame übernehmen.
Die sieben betroffenen bestehenden Erstfehlerprüfungen bestehen ebenfalls.
Pflicht-CI und unabhängige Sicherheitsabnahme des exakten Endkopfs sind Pflicht;
ihre tatsächlichen Belege werden am zugehörigen PR gebunden.

Der ausgeführte Runtimecommit789ea3ad, der Ausführungsbranch, Originalbelege,
alle alten und neuen STOP-Anker, Journal, Kosten- und Ressourcenverträge bleiben
erhalten. Der Entwicklungsnachfolger wird nicht automatisch ausgeführt.
Keine neuen Überwachungsprozesse, Artefakte, Schlüssel oder Ressourcen.

## Kleinster weiterer Diagnoseweg

Mit vorhandenen Belegen ist die alte innere Assertion nicht wiederherstellbar.
Nach positiver technischer Abnahme kann eine gesondert freigegebene Prüfung
denselben echten Prepare-Eingabepfad mit dem geprüften Nachfolger bis zur
ersten Fehlerkennung ausführen und vor jeder Verarbeitung/Profilaktivierung
stoppen. Eine solche geschützte Wirkung ist hier weder implementiert noch
freigegeben; sie muss zuerst konkret begrenzt und sicher abgenommen werden.
Keine neue vollständige Mock500-Ausführung auf Verdacht und keine Wiederaufnahme
des weiterhin geltenden UNKNOWN-Serienstopps aus diesem Entwicklungs-GO.
