# Materials-Diagnose ohne Profilaktivierung

## Warum das erteilte GO nicht ausführbar ist

Das GO vom02.11.2026 bindet exakt `d0b497cb477d7c975845afb267598ad002c3a452`
und verbietet jede Profilaktivierung. Dieser Stand startet Materials ohne
`--atomic-prepared0`: `UNIT0=true` führt nach der Vorbereitung auch das bestehende
Aktivierungs-SQL für500 synthetische Profile aus. Controller und Runtime erlauben
dafür noch `temporarySyntheticProfiles=500`. Das widerspricht dem neuesten GO.
Es wurde deshalb kein Branch vorgespult, keine Nonce/Linkrunde angelegt und kein
Diagnosejob gestartet. Das d0-GO ist unverbraucht, gilt aber nicht für einen Fixcommit.

Die Ursache des ursprünglichen Materialfehlers in Run41500229995 bleibt UNKNOWN.
Dieser Widerspruch ist ein belegter Startblocker, kein nachträglicher Ursachenbeleg.
Der vorhandene End500-Funktionsnachweis41325430429 und Mockoriginalempfang41037459441
bleiben übernommen; keine erneute Qualifikation oder Datenbeschaffung.

## Kleinste Korrektur

Nur die bereits bestehende begrenzte Materials-Diagnose startet denselben Node mit
dem vorhandenen `--atomic-prepared0`. Die Bound-Namespacebindung hat weiterhin
Vorrang vor historischen Fixturepfaden. Der bestehende native Vorbereitungszweig
installiert den vorbereiteten Slot, ohne `aktivieren` aufzurufen. Danach laufen
dieselben vier Outputproduzenten und dieselben vier Kopien:

- `processing-materials.PRIVATE.json`
- `current-command.PRIVATE.json`
- `mock-fixtures.PRIVATE.json`
- `audit-inputs.PRIVATE.json`

Das echte Diagnose-Owner-GO verlangt0 temporäre Profile und0 Units. Runtime-setup
prüft diese Bindung. Zusätzlich prüft der Materials-Einstieg vor jedem SQL Flag,
Diagnosemodus, Bestätigung, isolierte Datenbank,0 Profile/Units und die geschlossenen
Modell-/Production-/Fullfreigaben. Fehlendes Flag oder Aktivierungs-GO scheitert
vor dem Datenbankzugriff. Full behält seinen bisherigen Nodeaufruf und sein500-GO.

Die Diagnose endet weiterhin vor Atomic-Bootstrap,prepare,run,Audit und vollständiger
Sicherung. Sie prüft native Nullaktivität, unveränderte Profilfachfelder und
Prozessstillstand. Der geschlossene Erstfehlerkanal aus PR1023 bleibt unverändert.
Kein neuer Modus, keine neuen Secrets, kein RAM-Eingriff und keine Dummydateien.

Die Aktivierungssektion des Fullpfads wird damit ausdrücklich nicht untersucht.
Ein erfolgreicher Materials-/Kopierabschluss ist weder ein Mock500-PASS noch ein
Beweis, dass diese historische Aktivierungssektion fehlerfrei war.

## Gezielte Abnahme

Die bestehende VM-Probe lädt die tatsächlichen Materials-/Runtime-Funktionen mit
fiktiven privaten Dateien: fehlendes Flag, falscher Modus und jede falsche Owner-
Freigabe müssen vor SQL scheitern. Gültige Diagnose muss `UNIT0=false` ergeben;
Full ohne Flag bleibt `UNIT0=true`. Keine DB, Schlüssel oder Originale werden benutzt.
Die vorhandene kleine Controller-Fixture prüft Diagnose-GO0/0, Flag, alle vier
Kopien, jeden ersten Kopierfehler, Nullabschluss und fehlende Units/Provider.
Die bestehende Diagnose-Suite prüft weiterhin Startschutz und sicheren Abschluss.
Pflicht-CI und unabhängiger Review sind auf dem tatsächlichen neuen PR-Kopf Pflicht.

## Erforderliches neues Einmal-GO

Nach grünem finalen CI und unabhängigem Review muss der Betreiber den genauen
Fixcommit neu freigeben. Keine Übertragung des d0-GO auf andere Commits.

Genau eine frische private Linkrunde und ein Materials-Diagnosejob im bestehenden
Environment `helmut-ci-originals`, sicherer Fast Forward des Ausführungsbranches
von9d8e72e5 auf den dann exakt benannten Fixkopf. Ausschließlich Materialvorbereitung
und vier Kopien;0 Profilaktivierungen,0 Units/Provider/Modelle, kein Full-Mock500.
Höchstens20min äußerer Job/18min Worker, dynamisches Hostlimit mit mindestens
2.147.483.648Byte tatsächlicher Reserve, Swap/OOM/harte Grenzereignisse0 und
mindestens512MiB freie Platte. Höchstens0,05USD Speicherung und eine verschlüsselte
Fehlerkapsel mit1Tag Aufbewahrung. Alle bisherigen Original-/Empfänger-/Codebindungen,
Linkrestgültigkeit>90s und Parameter≤65535 bleiben Pflicht.

Das bestehende unveränderte Tagesstarttor verlangt auch für diese Diagnose das
volle gemeinsame UTC-/Berliner Fenster: Start vor19:30UTC. Am02.11. war es bei
der Vorprüfung bereits geschlossen. Keine Rückdatierung oder Lockerung; vor dem
nächsten echten Start die tatsächliche Uhrzeit und sämtliche Bindungen frisch prüfen.

Bei FAIL/UNKNOWN sicher stoppen, Erstphase und geschlossene Kategorie erhalten,
native Nullaktivität und alle eigenen Prozessabschlüsse unabhängig prüfen.
Kein Retry/Refresh, keine automatische Branchrücksetzung oder Löschung.
Originale, Drive und Secrets erhalten; kein Merge/Deployment/Production-Eingriff.
