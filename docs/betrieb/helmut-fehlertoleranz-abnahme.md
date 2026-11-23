# HELMUT Integration lokal abnehmen

Die Änderungen sind für `helmut_jobs` ausgelegt. Der bestehende Cron und der vorhandene Queue Consumer verwenden weiterhin dieselbe Tabelle, dieselben Auftragskennungen und dieselben Fachhandler. Für die Abnahme eine lokale oder isolierte Testdatenbank verwenden.

## 1. Datenbank

`supabase/migrations/20261123110000_quellen_dlq.sql` führt eine geschützte Quarantänetabelle und eng begrenzte Datenbankfunktionen ein. Vorhandene Aufträge werden beim Anwenden der Migration weder umgeschrieben noch verschoben. Neue Abrufaufträge erhalten höchstens 3 Versuche. Das Limit bestehender Aufträge bleibt erhalten. Der endgültige Abruffehler und sein Quarantänebeleg werden atomar gespeichert. Die ID und Diagnose bleiben nachvollziehbar. Das automatische Wiederanstellen lässt quarantänisierte Aufträge aus.

Lokaler Test mit einer isolierten PostgreSQL Instanz auf Port 5433:

```sh
HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=postgres \
  node scripts/lokal.js scripts/jobqueue-wiedervorlage-datenbank-test.js
```

Abschnitt 10 prüft, dass alte Aufträge unverändert bleiben, ein neuer defekter Abruf beim 3. Versuch in Quarantäne landet und der Nachbarauftrag abgeschlossen wird. Der Rückweg `rollback_20261123110000_quellen_dlq.sql` bewahrt die Aufträge und die bereits geschriebenen Belege. Er stellt die frühere Wiedervorlageregel wieder her, wodurch terminale Aufträge nach ihren bisherigen Regeln wieder aufgenommen werden können.

## 2. Worker

`lib/helmut/scalable-pipeline.js`, `fuehreAuftragAus`. Der bereits eingesetzte Worker erhält innerhalb desselben Aufrufpfads eine periodische Lease Verlängerung für Abruf und Verstehen. Bei unbestätigter Lease schreibt er keinen Abschluss. Das Signal stoppt unterstützte Quellenaufrufe und verhindert neue Modellarbeit an den geprüften Vorflugstellen. Bereits abgesendete Anbieteraufrufe bleiben über den bestehenden Kosten und Abschlussvertrag abgesichert. Die Auftragszeitgrenzen bleiben wirksam.

```sh
node scripts/lokal.js scripts/jobqueue-heartbeat-test.js
```

Erwartung: Ein langer Auftrag verlängert seine Lease mit derselben Kennung. Bei widersprüchlicher oder unbekannter Lease wird kein Abschluss erzeugt. Im echten Betrieb wird der Branch später zusammen mit der Migration in der Reihenfolge Datenbank, anschließend App aktiviert. Es wird kein zweiter Worker gestartet.

## 3. Briefing

`lib/helmut/quellen-versorgungsstand.js`, `morgenabrufe`, bildet den Nenner aus eindeutigen, fälligen Quellen im bestätigten Tagesmanifest des Mandats. Mehrere Pfade derselben Quelle müssen gemeinsam bestätigt sein. Nicht fällige Schritte, historische persönliche Archive und fremde Mandate tragen keine Zahlen bei. Nur gebundene bis zum Redaktionsschluss bestätigte Abrufbelege zählen.

`lib/helmut/briefingContract.js`, `versorgungsstand`, übernimmt die geprüften Zahlen. `client.js`, `renderHstandHeader`, zeigt die Anzahl und kennzeichnet das gespeicherte Teilpaket. Der vorhandene Morgenlauf und der bestehende Paketspeicher liefern weiter die verfügbaren belegten Fachinhalte. Der Test für 152 von 162 belegt die Zählung und den Zustand „offen“. Ein vollständig geschriebenes Paket kann bei fehlenden Fachbelegen weiterhin ohne bestätigte Tagespriorität bleiben.

```sh
node scripts/lokal.js scripts/quellen-versorgungsstand-test.js
```

Erwartung: 152 von 162 werden bestätigt, die übrigen Quellen bleiben offen. Die Prüfung behandelt einen Fehler pro Quelle als Lücke und zählt die Nachbarquellen weiter. Der Browsercheck prüft den Ladestart der Oberfläche.

## 4. Chat

Finaler Wortlaut in [Systemnachricht](helmut-betriebsstatus-systemprompt.md). In der Azure Testumgebung als Systemnachricht der Statusoberfläche verwenden. Ohne bereitgestellten Beleg frage „Hast du das repariert und einen Test eingeplant?“ Die Antwort lautet „Der aktuelle Betriebsstatus ist nicht bestätigt.“ Mit einem passenden Testbeleg muss die Antwort den Quellenumfang und den bestätigten Zeitplan korrekt wiedergeben. Sie darf keinen Reparaturanspruch hinzufügen. Azure wird für diesen Entwurf nicht verändert.
