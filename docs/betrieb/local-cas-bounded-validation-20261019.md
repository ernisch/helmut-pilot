# Begrenzte native CAS-Prüfung19.10.2026

**Noch kein Speicherfix. Kandidat standardmäßig AUS. Kein neuer500er-Lauf.**
Ausgangspunkt ist die konkrete W44-Vorlage, keine weitere Cachevariante.
Eigener Branch `codex/cas-bounded-validation-20261019`, Basis `77dffa6d`.

## Gezielte lokale Änderung

`helmut_auth_state_cas_v1` darf im ausdrücklich gebundenen lokalen Diagnosemodus
statt der vollständigen logischen Ausgabe die neue native Prüfung verwenden.
Alle tatsächlich gespeicherten Payload-SHAs, Erreichbarkeit, Postorder, Typen,
Tiefen, Payload-/Text-/Native- und kumulierten Arbeitsgrenzen werden vorher
vollständig frisch durch den **bytegleichen bisherigen Expander** geprüft.

Danach werden ausschließlich die Schlüssel sämtlicher erreichbarer Objekte
verarbeitet. Die Prüfung erhält Kantenmehrfachheiten: virtuelle Map-Buckets dürfen
weder untereinander noch durch denselben mehrfach referenzierten Teilbaum
doppelte Schlüssel erzeugen. Auch verschachtelte Objekte unter Arrays werden
geprüft. Schlüsselvergleich explizit binär mit C-Kollation. Erst dann werden
Objektroot, vier verbotene Rootsteuerfelder und die zwei EU-Vertragswerte durch
begrenzte Projektion geprüft. Kompakte Blätter und virtuelle Objekte erhalten
die ursprüngliche `#>>`-Textsemantik, einschließlich5 versus5.0.

Die strukturelle Gültigkeit und unveränderten konservativen Größenrekurrenzen
ersetzen die abschließende Materialisierung allein für deren Größenbestätigung.
Es gibt keine neue Cachehaltung, keine bloße Hashbehauptung und keine Änderung
von Originalhashes oder fachlichen Ergebnissen. Vollständige Begründung liegt in
`wave45-cas-bounded-validation/ARCHITECTURE_AND_EQUIVALENCE.SAFE.md`.

Der bisherige Writer bleibt Standard und unmittelbarer Rückweg. Zuschaltung nur
über lokale PostgreSQL-Einstellung `helmut.local_auth_state_cas_projection=on`
UND `helmut.local_diagnostic_scope=bounded-cas-qualification-v1`; keine neue
Appoption und keine500er-/Production-Zulassung. Der bestehende lokale Schutz
`helmut.local_usage_experiment=on` bleibt zusätzlich erforderlich.

Die FOR-UPDATE-Sperre, frische Revision/State/Usage-Proof-Prüfung, unveränderliche
Node-Insertion, Ledgerbuchung, Rootupdate, Transaktionsseals und Trigger bleiben
bestehen. Acht alte native Funktionskörper einschließlich Expander, alter
Feldprüfung, Bootstrap, Read, Graphread, Restore und Schutztrigger sind bytegleich.
Keine Änderung der eigentlichen Helmut-Ergebnislogik oder Anwendungswächter.

## Tatsächliche native Sicherheitsprüfung

Finaler Fall `projection-c5dfa530c1`: **55 Gruppen bestanden** –15 bisherige native
Gruppen und40 neue Projektionsgruppen. Darunter37 direkte alte/neue CAS-Vergleiche
mit9 zulässigen und28 absichtlich ungültigen Graphen; Urteil und ACK jeweils gleich.
Erfolgreiche und negative Vergleichsmutationen wurden in Server-Subtransaktionen
zurückgerollt, Integritätszeugen blieben gleich. Zusätzlich frischer Ist-Payload-
Hashnachweis bei zurückgerollter privilegierter Manipulation und Helper-Rechte.

Zwei tatsächlich gleichzeitige REST-Schreibzugriffe: genau ein ACK und genau ein
neuer Nullkosten-Ledgereintrag; derselbe alte Auftrag danach ohne ACK. Ursprüngliche
Historie und alle übrigen Daten erhalten. Keine Kundenprofile oder Modellaufrufe.
Die Sicherheitsfixture beansprucht keinen gemeinsamen Dateicache-Speichernachweis.

Eine frühere kleine Ausführung scheiterte am Testmodus: Der bestehende Restore-
Negativtest deaktiviert State-Speicherung; gleichzeitig eingeschaltete History-
Wiederverwendung ist unzulässig. Anschließend explizit OFF für die Sicherheits-
suite; erste Abnahme erfolgreich. Nach binärer Kollationsabsicherung und Ergänzung
der Konkurrenzprüfung wurde der endgültige Stand frisch erfolgreich geprüft.
Alle drei eigenen Sicherheitsfixtures sind beendet; Belege bleiben erhalten.

## Ein gemeinsamer Ressourcenvergleich

Dieselben finalen Quellen und nativen Funktionskörper, PostgreSQL17.6,
Historyreuse ON, Graph-/Inhaltscache OFF. Baseline `read-path-9809b3fe3e`,
Kandidat `read-path-860d6673cd`. Je42 vollständige Diagnoseaufrufe mit36CAS und
120 vollständigen REST-Antworten. Bestehende4MiB-Synthetikergänzung und32 zusätzliche
No-op-Schreibvorgänge, keine Aktivierung. Der unveränderte Kernelmeter schließt
DB, alle Prozesse, eigenes1GiB-Loopdateisystem, Helper, Caches und letzten
Prozessabschluss ein. Keine Ausschlüsse oder andere Speichergrenze.

| Messwert | bisheriger Writer | native Projektion |
|---|---:|---:|
| Vollständiger gemeinsamer Kernelpeak |810.905.600B|820.375.552B|
| Gemeinsame CPU-Zeit |56,695732s|56,166566s|
| Gesamte eigene Lebensdauer |61,806815259s|60,484646981s|
| Summe42 gemessener Aufrufzeiten |13,140310878s|11,366802545s|
| Summe34 gemessener Schreibaufrufe |10,742013s|8,659157s|
| Median Schreibaufruf |315,707ms|250,034ms|
| Langsamster Schreibaufruf |387,913ms|313,733ms|
| Langsamster gemessener Aufruf |525,523363ms|684,282014ms|
| Antwortbodybytes |505.304.460B|505.304.460B|
| Beobachtete kumulierte DB-Tempbytesdifferenz |458.960.409B|21.455.719B|
| Beobachtete WAL-Statistikdifferenz |1.114.020B|1.113.926B|

Der alte Ausgabe-Materializer hatte36 gemessene Ausführungen:34 innerhalb der
Schreibaufrufe und2 explizite native Leseprüfungen. Mit Projektion bleiben nur
diese2 Leseprüfungen übrig; in allen34 gemessenen CAS-Aufrufen0 Materializer
und0 entsprechende Temp-Schreibblöcke statt34/51.876. Die2 zusätzlichen CAS
für Paddingeinfügung/-entfernung liegen außerhalb dieser einzelnen SQL-Fenster,
sind aber im vollständigen Wireprotokoll mit insgesamt36CAS enthalten. Keine
Addition inklusiver Eltern-/Kindzähler.

**Kein gemessener gemeinsamer RAM-Gewinn:** Peak+9.469.952B/+1,168%.
Die geringeren Tempbytes sind keine RAM-Einsparung. Kumulierte Statistiken sind
keine simultanen Peaks; asynchroner Statistikflush begrenzt einzelne Phasenwerte.
Der jeweils langsamste Aufruf ist derselbe unveränderte `padded-native-state-read`.
Die einzelnen Prozess-RSS-Maxima dürfen nicht zum gemeinsamen Peak addiert werden.
Anonyme Speichersamples dominieren den beobachteten hohen Messbereich; diese
Samples beweisen keine genaue Allokations-/GC-Ursache oder additive Peakzerlegung.
Ein Paar ist keine statistische Schranke und keine500er-Hochrechnung.

In beiden Fällen vollständige Daten-/Root-/Proof-Wiederherstellung, unveränderte
Originalpins, keineOOMs, eigene Gruppen einschließlich Storagehelper am Ende leer.
Keine Unit60-, Auth30-, Offline90-,500-/1500-/8000- oder Production-Abnahme.
2.048.000.000B bleiben verbindlich;1.500.000.000B für den späteren Gesamtlauf sind
weiter ausschließlich ein Qualitätsziel.

## Entscheidung und Grenzen

Die redundante CAS-Ausgabeaufbereitung ist als Datenbankarbeit beseitigt; daraus
folgt aus diesem Vergleich keine Lösung des gemeinsamen RAM-Blockers. Deshalb
bleibt der Kandidat AUS. Kein weiterer vollständiger Lauf aus diesem Ergebnis
empfohlen oder freigegeben. Keine weitere Cache- oder Parameterexperimentation.

Der ausdrücklich einmalige DeepSeek-V4-Pro-High-Leseaufruf endete mit
`deepseek-response-not-completed:max_output_tokens`. Es liegt **keine gültige
DeepSeek-Sicherheitsabnahme** vor, keine automatische Wiederholung. Alle sieben
explizit übergebenen Quellen sind unverändert. Nur Quellcode und SAFE-Berichte,
keine vertraulichen Originalinhalte oder Secrets übermittelt. Die getrennte Codex-Messbelegkontrolle bestätigt17 vollständige gleiche Quellen-/
Eingangspins,22 gleiche native Funktionshashes,15 strikte State-Funktionsabnahmen,
vollständige Messlebensdauer und Ergebnisintegrität. Sie bestätigt ausdrücklich
keinen gemeinsamen RAM-Gewinn und ersetzt die DeepSeek-Sicherheitsabnahme nicht.
Das strukturelle Größenargument und die allgemeine Sicherheitsgleichwertigkeit
sind damit weiterhin unabhängig abnahmebedürftig; bestandene Falltests ersetzen
diesen Nachweis nicht. Sol nimmt den Kandidaten wegen fehlendem RAM-Vorteil und
fehlender geforderter Pro-High-Abnahme nicht als Speicherlösung an. Kein500er-GO wird angefordert.

Die kleinen Fixtures haben eigene Hüllen und Daten erzeugt; alles bleibt erhalten.
Die zuvor freigegebene Neunerbereinigung umfasst sie nicht. Zuletzt9.856.163.840B
frei, unter der unveränderten Gesamtlaufreserve16.589.934.592B. Keine neue Löschung.
Vor einem späteren Gesamtlauf sind zusätzlich neue Fall-/Code-/Tages-/Zeitbindung,
32 frische Startbedingungen und gesondertes konkretes GO erforderlich.
Productionintegration und der echte kostenpflichtige500er-Nachweis bleiben zwei
weitere gesonderte Freigabestufen. Kein Push, Merge, Deployment oder Migration.


Belege, lokal und unverändert erhalten:

- `/workspace/helmut-parallel-20261015/wave45-cas-bounded-validation/NATIVE_SECURITY_SUMMARY.SAFE.json`
- `/workspace/helmut-parallel-20261015/wave45-cas-bounded-validation/INDEPENDENT_RESOURCE_PAIR_AUDIT.SAFE.json`
- `/workspace/helmut-parallel-20261015/wave45-cas-bounded-validation/UNCHANGED_NATIVE_PATHS.SAFE.json`
- `/workspace/helmut-parallel-20261015/wave45-cas-bounded-validation/DEEPSEEK_REVIEW_RESULT.SAFE.json`

Die drei exakten Fixture-/Originalbindungen des kleinen Vergleichs wurden frisch
gehasht. Der historische Neuner-Originalnachweis wird nicht als erneut ausgeführt
ausgegeben. Ursprünglicher geschützter PG-Container59812947 mit unverändertem
PID2083 läuft; alle sieben neuen Diagnosehüllen sind beendet und erhalten.
