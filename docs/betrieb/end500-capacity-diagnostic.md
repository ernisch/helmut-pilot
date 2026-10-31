# Isolierte End500 Kapazitätsdiagnose, Version 1

Vertrag: `helmut-w15-end500-capacity-diagnostic/1`.
Workflowmodus: `end500-full-capacity-diagnostic`.
Dieser Modus ist eine getrennte Messung und keine Änderung des offiziellen
End500-, Mock500- oder Production-Prüfvertrags.

Der vorhandene gemeinsame cgroup-Lebenszyklus erhält von Anfang bis Ende exakt
4.999.999.488 Bytes hart. Mindestens 2.147.483.648 Bytes tatsächlich verfügbare
Hostreserve werden vor dem Start und bei den vorhandenen Ressourcenprüfungen
verlangt. Swap, OOM und Speichergrenzereignisse müssen null bleiben. Die alte
Verarbeitungsspitze von 2.048.000.000 Bytes wird ausgewiesen, beendet ausschließlich
diesen Diagnosemodus aber nicht. Es gibt keinen Phasenwechsel des RAM-Limits,
keinen Peakreset, keine Cachemanipulation und keine Speicheroptimierung.

Unveränderter Funktionsumfang: vorhandene verschlüsselte Eingangsteile und zwölf
Dateipins; isolierter Restore; 500 Auth CAS, 6.000 vollständige logische Usagezeilen
und 3.501 exakte native Postimages; null aktive Profile; vollständige Exporte und
bestätigter Dienst-, Datenbank- und Watcherstopp. Erst nach diesem vollständigen
funktionalen Abschluss folgen Verschlüsselung, authentifizierte entfernte
Rücklesung und eine zweite frische isolierte Rücksicherung mit Integritätsvergleich.
Keine Profilaktivierung und keine Modellaufrufe.

Zeitlimit: 3.600 Sekunden gemeinsamer Ablauf. Der vorhandene vollständige
Plattenplan mit mindestens 512 MiB freier Reserve bleibt verpflichtend.
Zusätzliche Speicherung höchstens 0,05 USD, maximal ein verschlüsseltes Artefakt
mit einem Tag Aufbewahrung. Keine Klartextartefakte oder privaten Logausgaben.

Die vorhandene Supervisorprüfung sammelt begrenzte Kernelmessungen nach festen
Arbeitsphasen. Ein reiner Collector erhält erste und letzte Beobachtung,
Lebenszeitpeak, maximal beobachteten aktuellen Verbrauch, Kategorie-Maxima,
PSI und Swap-/OOM-Werte. Die Historie wird nötigenfalls ausdrücklich verdichtet.
Der äußere abschließende Kernelwert bleibt die maßgebliche Messung des ganzen
gemeinsamen Lebenszyklus; die inneren Phasenproben erklären dessen Verlauf.
Der Zeitpunkt und die Zusammensetzung eines zwischen Proben entstandenen
Kernelpeaks bleiben unbekannt.

Optionale Prozess-PSS basiert auf vorhandenen cgroup-/proc-Messungen mit
PID-, Startzeit- und Container-Namespacebindung. Erfasste PostgreSQL-, Node-
und PostgREST-Prozesse liefern gegebenenfalls nur bestätigte Untergrenzen.
Nicht zugeordnete Prozesse und unvollständige Beiträge bleiben UNKNOWN.
PSS wird weder mit Dateicache noch mit zeitlich anderen Maxima addiert.
Es entstehen keine zusätzlichen Überwachungsprozesse.

Bestätigte CAS-Zähler werden über die bestehende private Prozessverbindung
übermittelt. Usage und Postimages werden erst durch die vollständige native
Abschlussprüfung als exakt bestätigt. Vorher bleiben diese Zähler UNKNOWN.
Empfangszeiten von Fortschrittsmeldungen sind keine gleichzeitigen RAM-Proben.
Supervisorhistorie und bereits bestätigter Fortschritt bleiben auch ohne
Workerabschlussbericht verfügbar. Die erste Fehlerphase wird nicht ersetzt.
Die Ergebnisgrenze von 65.536 Bytes bleibt unverändert; doppelte optionale
Workerhistorien werden bei vorhandener Supervisorhistorie weggelassen.

Ein vollständiger Diagnoseabschluss trägt ausschließlich einen MEASURED- bzw.
COMPLETED-Diagnosestatus. Sämtliche alten RAM-, End500-, Mock500- und
Production-Abnahmen bleiben ausdrücklich gesperrt. Historische FAILs bleiben
unverändert. Ein funktionaler Diagnoseabschluss allein erlaubt keine Folgestufe.

Vor einer echten Ausführung sind Pflicht-CI und unabhängiger Review auf dem
exakten Commit, die gebundene öffentliche Codequalifikation, private bestehende
Restore-Funktionsbelege sowie deren unabhängige Kompatibilitätsprüfung nötig.
Der Startvertrag verlangt ein separates einmaliges GO für diesen exakten Commit
im bestehenden Environment `helmut-ci-originals`. Der vorgesehene Ausführungsbranch
darf erst innerhalb dieses GO sicher per Fast Forward vorgesetzt werden.
Alle Vorbereitungen erfolgen vor frischen Links. Unmittelbar vor dem einzigen
Start: tatsächliche Linkrestgültigkeit über 90 Sekunden und höchstens 65.535
Zeichen Gesamtparameter. Kein Retry und kein Linkrefresh.

Bei FAIL, UNKNOWN oder einer Sicherheitsverletzung stoppen nur eigene Prozesse;
deren tatsächlicher Stillstand wird geprüft. Quellen, Secrets und Drive-Dateien
bleiben erhalten; keine automatische Löschung oder Branchrücksetzung.
Keine Merges, Deployments oder Production-Eingriffe.
