# Anbieterpausen im Quellenhandler — 12.11.2026

Der Quellenhandler verlor strukturierte Pauseninformationen beim Umbau eines
Abrufresultats in einen Fehler. Der gemeinsame Worker konnte die Anbieterpause
dadurch als Fehlversuch werten und sogar den letzten erlaubten Versuch verbrauchen.
Die Korrektur reicht vorhandene Objektmetadaten an den bestehenden Vertagungspfad
weiter. Echte Abruffehler bleiben Fehler; Grenzen und historische Zaehler bleiben
unveraendert. Rueckweg: gezielter Code-Revert.

Gezielt lokal ueber lokal.js bestanden: Anbieter-Fachpfad62/62 und
HTTP-/Blob-Entkopplung63/63. Vier neue Fehlerfaelle waren vor der Korrektur rot.
Sieben Verhaltenspruefungen decken unter anderem den letzten Versuch, Lease,
Klassenslot und eine nicht verfuegbare Vertagung ab.

Der [erste Pflichtlauf](https://github.com/ernisch/helmut-pilot/actions/runs/43242780955)
scheiterte an einem historischen Literalverbot in quellenvorlauf-500-test.js.
Die Anbietergrenze, Workflow-Isolation und die begrenzte Sonderlauf-Fortsetzung
bleiben geprueft. Das Literalverbot wurde durch einen echten Source-Handler-Test
ersetzt: genau ein Abruf, kein Sonderlauf-Warten, freier Slot und erhaltene
Pauseninformation.35/35Vorlaufgruppen bestehen. Eine isolierte In-Memory-Gegenprobe
ohne Metadatenweitergabe laesst den neuen Test scheitern. Kein Runtimefile wurde
fuer die Gegenprobe geaendert.

Der folgende Pflichtlauf scheiterte im nativen Kontodatenbanktest; seine genaue
Ursache ist mangels lesbarer Rohlogs unbekannt. Die isolierte lokale Reproduktion
mit echtem PostgreSQL17.6 und PostgREST12.2.3 bestand44/44Pruefungen. Eine einmalige
Wiederholung desselben CI-Laufs scheiterte frueher an der bewusst erhaltenen
Erstversuchsbindung der synthetischen Anschlussprobe. Weitere Blindwiederholungen
unterbleiben. Eine geschlossene Annotation im Kontodatenbanktest meldet nun nur
statische Phase, erlaubte Fehlerklasse, numerischen Exitstatus und Codezeile;
Fehlermeldungen, SQL und Zugangsdaten gehen nicht in diese Annotation ein.
Pruefauswahl, Einmalbindung, Grenzwerte und Abnahmekriterien bleiben erhalten.
Die bestehende synthetische Kontosuite besteht mit der Annotation16/16Pruefungen,
einschliesslich einer Gegenprobe gegen die Ausgabe beliebiger Fehlertexte.
Der neue Pflichtlauf grenzt den Abbruch auf den Auth-Feldpatch-Abschnitt ein;
die vorherigen Abschnitte erreichen dessen Aufruf. Die Diagnose nennt deshalb
zusaetzlich die genaue Fixture-Zeile, einen erlaubten Fehlertyp und gegebenenfalls
den numerischen HTTP-Fehlerstatus. Deren gezielte synthetische Gegenprobe besteht;
beliebige Fehlermeldungen bleiben verworfen. Die eigentliche Ursache ist noch offen.

Zwischenzeitlich wurde PR1155 auf main integriert. Dessen Korrektur erneuert das
lokale HTTP-Tor nach den synchronen SQL-Importproben, bevor die Feldpatch-Probe
beginnt. Die Konfliktaufloesung behaelt diesen vorhandenen Fix und die geschlossene
Diagnose gemeinsam; keine Kopie oder Abschwaechung des Nachweises.
Der integrierte native Kontodatenbanktest besteht lokal44/44Pruefungen mit echtem
PostgreSQL17.6 und PostgREST12.2.3, einschliesslich aller neun Feldpatch-Faelle.
Der Testcluster wurde danach beendet und entfernt. Der neue Pflichtlauf blieb
bis zu seinem tatsaechlichen erfolgreichen Abschluss offen.

Status: PR1168 gemergt und Quellenkorrektur live. Kein Nachweis fuer einen
wiederhergestellten Briefingbetrieb; weitere betriebliche Laeufe bleiben gestoppt.
Ausfuehrliche Betriebsnachweise bleiben lokal, dieser Nachweis enthaelt nur die
Codekorrektur und deren Pruefstand.

Abschluss: Beide Pflichtchecks des integrierten Kopfes sind im
[Lauf43261005785](https://github.com/ernisch/helmut-pilot/actions/runs/43261005785)
erfolgreich, einschliesslich aller Datenbank-, Offline-, Bereichs- und abschliessenden
Z22-Pruefungen. Browserausfuehrung planmaessig uebersprungen; Pflichtcheck erfolgreich.
[PR1168](https://github.com/ernisch/helmut-pilot/pull/1168) ist auf3b790d2c gemergt.
Regulaeres Deployment READY; Hauptdomain und exakter laufender Commit rein lesend
bestaetigt. Kommunikationssperre und abgewiesene anonyme Sitzung bestaetigt.
Keine Quellen-, Modell- oder Briefingausfuehrung fuer diese Rolloutkontrolle.
Die Produktionsneustartursache bleibt offen; kein frisches Tagesbriefing behauptet.
