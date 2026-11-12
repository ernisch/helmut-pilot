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

Status: Pflicht-CI und Coderollout ausstehend. Kein Nachweis fuer einen
wiederhergestellten Briefingbetrieb; weitere betriebliche Laeufe bleiben gestoppt.
Ausfuehrliche Betriebsnachweise bleiben lokal, dieser Nachweis enthaelt nur die
Codekorrektur und deren Pruefstand.
