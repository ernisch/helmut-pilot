# Isolierter End500-/Mock500-Funktionsvertrag v1

Betreiberfreigabe: Integrationsauftrag vom 31.10.2026. Maschinenkennung:
`helmut-w15-isolated-functional/1`. Ausschließlich isolierte GitHub-Testumgebung
`helmut-ci-originals`, zugelassener Entwicklungsbranch
`codex/w15-github-end500-preparation-20261028`. Kein Merge, Deployment oder
Productionzugriff; keine echten Modellaufrufe. Ein Funktions-PASS ist keine
reguläre RAM-, Anbieter- oder Production-Abnahme.

## Unveränderte harte Sicherheit

Die vorhandenen Maschinenkonstanten aus `phase_contract.py` gelten durchgehend:
gemeinsames Hartlimit **4.999.999.488 Bytes**, tatsächlich verfügbare separate
Hostreserve mindestens **2.147.483.648 Bytes**. Keine Addition von Anbieterbudgets.
Swap, OOM und Kontakte mit der gemeinsamen harten Grenze müssen null bleiben.
Speichergrenzkontakte, fehlgeschlagene Zuweisungen und Prozessfehler bleiben
unterschiedliche Befunde. Keine Cachemanipulation oder Rücksetzung von Peaks.
Vollständigen Plattenplan und mindestens **536.870.912 Bytes** freie Reserve
erhalten. Alle eigenen Prozesse müssen beendet und ihr Stillstand geprüft sein.

Neue Modi: `end500-full-functional-gated`, `mock500-full-functional-gated`.
Die vorhandenen Modi, alten Limits und historischen FAIL-Ergebnisse bleiben
unverändert. Die früheren gemeinsamen Verarbeitungsspitzen von 2.048.000.000
Bytes beziehungsweise 1.638.400.000 Bytes sowie die lokale kombinierte
Datenbankgruppe mit 948.191.232 Bytes sind im neuen Modus Vergleichswerte.
Sie erzeugen keinen vorzeitigen Verarbeitungsabbruch und keinen Anbieter-PASS.
Es gibt keinen Wechsel des Hartlimits während dieses Funktionsmodus.

## Stufen, Laufbindung und Versuchszahl

Ausführungsfenster 1.–7. November 2026. End500 maximal 3.600 Sekunden. Mock500
maximal 10.800 Sekunden Verarbeitung und 12.600 Sekunden insgesamt; die ganze
Maximallaufzeit muss in denselben UTC- und Berliner Kalendertag passen.
Auth unter 30 Sekunden, Unit unter 60 Sekunden, lokale Providerphase unter
20 Sekunden. Keine historischen Quellen oder Zeitstempel umdatieren.

End500: vorhandene 15 Cipherteile und zwölf Originaldateien, Restore 500/0,
500 Auth-CAS, 6.000 Usagezeilen, 3.501 native Postimages, Exporte, Nullaktivität,
bestätigter Prozessstopp, vollständige verschlüsselte Sicherung, authentifizierte
entfernte Rücklesung und zweite frische isolierte Wiederherstellung mit
vollständigem Integritätsvergleich. Bereits unabhängig geprüfte Restore-
Funktionsbelege bleiben erhalten; die neue Endabnahme entsteht aus diesem Lauf.

Mock500 startet erst nach positiver unabhängiger End500-Abnahme `/3` unter
demselben Funktionsvertrag. Diese verlangt vollständige Verarbeitung, Sicherung,
Rücklesung, Rücksicherung, Integrität und sichere gemeinsame Ressourcen.
`processingMemoryAccepted`, `legacyRegularMemoryAccepted`,
`commonLifetimeMemoryAccepted` und `providerResourceAccepted` bleiben false.
Die geprüfte Brücke bindet Endlauf, finalen Mockcode und unveränderte Originalpins.
Identischer Codekopf ist erlaubt; tatsächliche Lauf-ID und Nonce sind verschieden.
Ein bereits bestandener Mock500 ist keine Voraussetzung seines ersten Versuchs.

Mock500: exakt 500 gleichzeitig aktive synthetische Profile, 500 Units, 1.000
lokale Modellphasen, 1.500 gespeicherte und einzeln geprüfte Ergebnisse, 8.000
tatsächliche Sicherheitskontrollen und vorhandene 17.000 Auditprüfungen.
Alle Profile gleich behandeln. Fehlende, leere, doppelte, unbrauchbare und
technisch fehlerhafte Ergebnisse getrennt ausweisen. Anschließend Nullaktivität
und Prozessstillstand getrennt bestätigen. Sicherung, Rücklesung und zweite
Wiederherstellung müssen die Ergebnisse genau dieses Laufs betreffen.

Vor jedem Start: finalen Commit, Vertragsversion, neue Nonce, Eingaben, erfolgreiche
Pflicht-CI, unabhängige Codeprüfung, Umgebung und Freigabe unveränderlich binden.
Alle Vorbereitungen und sicherer Fast Forward vor frischen privaten Links.
Unmittelbar vor dem einzigen POST: tatsächliche Linkrestzeit strikt über 90 Sekunden,
gesamte Parameter höchstens 65.535 Zeichen. Ausschließlich verschlüsselter Index
und geprüfte öffentliche Codequalifikation als Parameter; keine geheimen Werte.
Vorhandene Empfängersecrets bleiben unverändert. Ein notwendiger Empfang innerhalb
des neuen Jobs ersetzt keine historische Qualifikation und wird nicht ausgelagert.

`functional_chain.py` führt im privaten bestehenden Entwicklungsbereich eine
persistente Versuchsliste. Reservierung unmittelbar vor dem vorhandenen Dispatch-
POST; keine versteckten Wiederholungen. Maximal drei Gesamtversuche: ein End500,
ein Mock500 und insgesamt genau ein korrigierter Zusatzversuch. Dieser verlangt
eindeutig beendeten vorherigen Lauf, konkrete Ursachenbelege, neuen Fixcommit,
gezielte erfolgreiche Tests, Pflicht-CI und unabhängige Abnahme. UNKNOWN blockiert
weitere Starts. Kein erneuter unveränderter FAIL, Linkrefresh oder automatischer
Branchrückweg. Höchstens 0,05 USD Speicherung und ein verschlüsseltes Artefakt
mit einem Tag Aufbewahrung je Versuch, höchstens 0,15 USD für die gesamte Kette.

## Messung und getrennte Urteile

Vorhandene Kernel-, PSS-, Phasen- und Fortschrittsmessung wiederverwenden.
Gemeinsamen Kernel-Lifetime-Peak vollständig erhalten; Cache und PSS nicht
addieren, zeitverschiedene Maxima nicht als simultane Summe ausgeben.
PostgreSQL, Node einschließlich Treiber, PostgREST und Werkzeuge soweit belegt
zuordnen. Unvollständige PSS-Zuordnung ist ein beobachteter Unterwert. End500
verwendet die vorhandene Phasen-/Kernel-/PSS-Trace; nicht öffentlich durchgeleitete
CPU-Komponenten bleiben UNKNOWN. Mock liefert zusätzlich die geschlossene passive
Ressourcenbeobachtung. Keine neuen Überwachungsprozesse.

Vercel: belegte Anbieterreferenz 2 GB und 1 vCPU je Funktionsinstanz. Supabase:
Micro 1 GB, geteilte CPU, insgesamt maximal 60 Datenbankverbindungen. Tatsächliche
Maximalverbindungen der primären und zweiten isolierten Datenbank per SHOW
bestätigen. Die genaue gemeinsame Hostingzuordnung von PostgreSQL/PostgREST
und Anbieterparität bleiben UNKNOWN; lokale kombinierte Messungen beweisen sie
nicht. Verbindungsbeobachtungen an Checkpoints sind keine behauptete Lifetime-Spitze.

Abschluss getrennt: **Mock500-Funktion PASS/FAIL/UNKNOWN**, tatsächliche
**Ressourcenwerte mit Referenzvergleich**, **Production500 nicht ausgeführt**.
Bei Erfolg ohne belegten Engpass keine weitere Optimierung. Bei Fehler sofort
stoppen, erste Ursache und Ressourcen sichern, nur eigene Prozesse kontrolliert
beenden. Rückweg: neuen Pfad nicht weiter verwenden; Quellen, Drive, Secrets und
Originalbelege unverändert erhalten, keine automatische Löschung.
