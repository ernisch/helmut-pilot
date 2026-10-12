# EU500: Tagesbuch vor dem ersten kostenpflichtigen Aufruf

Die Finanzierungslesung und die Command-Installation verlangen ein echtes
EU-Tagesbuch. Bisher legt erst `testkosten-budget.reserviere()` ein fehlendes
Buch an. Damit fehlt vor dem ersten bezahlten Aufruf ein geschlossener
administrativer Einstieg. Diese Änderung bereitet diesen Einstieg vor.

## Begrenzter Schreibumfang

`synthetik-500-eu-daybook-init.prepare()` erstellt ausschließlich einen reinen
Plan aus einem Budgetausschnitt, dem tatsächlichen Tageszähler und gebundenen
Metadaten. Sie liest keine Zugangsdaten und ruft weder Speicher noch RPC auf.
Der vorhandene Historienrechner wird unverändert zusätzlich exportiert.
Ein Plan ist kein nativer Nachweis und erteilt keine Laufautorität.

Die neue Funktion `public.helmut_synthetik500_eu_daybook_init` nimmt sechs
skalare erwartete Werte entgegen: aktuellen UTC-Tag, MD5 von Auth, Main und
Profilen, Zählerstand und berechnete Historienkosten. Sie liest und berechnet
den tatsächlichen Zustand innerhalb ihrer Datenbanktransaktion selbst.
Kein vollständiger Auth-Speicher wird vom Aufrufer hochgeladen.

Bei fehlendem Buch sind nur folgende Änderungen zulässig:

- Ein unverbrauchtes EU-Buch für den tatsächlichen aktuellen UTC-Tag anlegen.
- Die Buchkapazität bei Bedarf auf die notwendige Mindestanzahl erhöhen,
  höchstens 47; bereits bereitgestellte Mindestkapazität beibehalten.
- Die vorhandene Auth-CAS-Revision nach dieser Änderung erneuern.

Ein bereits identisches unverbrauchtes Buch führt zu einer Änderung von null
Zeilen. Historische Bücher, Kostenhistorie, Tickets einschließlich ungeklärter
alter U-Ausgänge, private Reserve, Preisvertrag, Limits und alle anderen
Speicherfelder bleiben erhalten. `runDayUTC` bleibt `null`. Ein tatsächlicher
Nichtnull-Kostenbestand des aktuellen Tages wird berechnet und abgewiesen,
niemals auf null gesetzt. Ungeklärte EU-Reservierungen werden abgewiesen.

## Atomare Grenzen

Der Aufrufer muss tatsächlich `service_role` verwenden. PUBLIC, anon und
authenticated erhalten kein EXECUTE-Recht. Die Funktion verwendet einen festen
Suchpfad und verlangt READ COMMITTED. Tabellensperren erfassen Profile,
Endwächterbindungen, Jobs/Outbox/Prozesse/Pipelines, Tageszähler und Speicher;
danach werden Main/Auth in stabiler Reihenfolge gesperrt. Damit sind auch
Einfügungen in einen bislang fehlenden Tageszähler während der Prüfung blockiert.

Die Prüfung verlangt 500 inaktive, nicht gelöschte Profile und keinen laufenden
Arbeitsbestand. Abgeschlossene historische Commands bleiben erhalten. Ein
laufender oder zukünftiger Slot, ein laufendes Journal oder eine offene
Endwächterbindung stoppt. Der native UTC-Tag wird nach Wartezeiten und vor/nach
dem Schreiben erneut geprüft. Der gültige Preiszeitraum endet am 25.10.2026.

Der äußere RPC-Aufruf muss bereits vor Ausführung einen `statement_timeout`
von höchstens 15 Sekunden besitzen; die Funktionskonfiguration allein startet
den Timer eines schon laufenden Statements nicht neu. `lock_timeout` beträgt
3 Sekunden. Der verfügbare berechtigte Aufrufweg und seine tatsächliche
Zeitbegrenzung müssen vor einer Anwendung nachgewiesen werden.

## Entwicklung und Production getrennt

Die isolierten Tests verwenden synthetische Daten in einem PostgreSQL-17-
Container ohne Netzwerk oder Ports. Nur in der Testkopie wird die native Uhr
auf einen festen Vertragstag gesetzt. Die echte Migration enthält weder einen
Uhrparameter noch einen Testschalter. Die Pflicht-CI verwendet ihren bereits
vorhandenen netzlosen EU-Container und führt den neuen Datenbanktest in einer
eigenen temporären Datenbank aus.

Merge/Rollout, das Anwenden dieser Migration und die tatsächliche Tagesbuch-
Initialisierung werden mit dieser Entwicklung nicht ausgeführt. Vor der
Production-Anwendung sind ein konkretes GO für den geprüften Umfang, grüne
Pflicht-CI, unabhängige Abnahme, frische native Werte und ein berechtigter,
zeitlich begrenzter Aufrufweg erforderlich. Für einen Lauf am 13.10. wird das
Buch erst am tatsächlichen UTC-13.10. vorbereitet. Das ist keine Reservierung,
Command-Installation, Profilaktivierung oder Freigabe für Modellaufrufe.

Ein unklarer Schreibausgang erlaubt keinen Wiederholungsversuch: zunächst
rein lesend den tatsächlichen Zustand klären. Das separate Rollback entfernt
nur die neue Funktion; es löscht keine Bücher und senkt keine Budgets.
