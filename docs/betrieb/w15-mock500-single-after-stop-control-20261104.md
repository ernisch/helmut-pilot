# Einmaliger Voll-Mock500 nach STOP: getrennte Control-Entwicklung

Die vorhandene Serie bleibt nach zwei verbrauchten Plätzen und zwei UNKNOWN-STOPs
geschlossen. Ihr Journal mit fünf Ereignissen, Grant, Reservierungen und fehlende
sichere Terminals werden nicht geändert. Der neue Helfer erlaubt ausschließlich
eine ausdrücklich neu authentisierte Ausnahme für Platz 3 am selben Serienroot:
ein Voll-Mock auf Runtime `33d588b6209ad912c5045f6561c07b7dc3d60e63`, höchstens
0,05 USD zusätzlich und 0,15 USD insgesamt. Kein Refund, Retry, Linkrefresh,
neues Serienjournal oder automatisches Aufheben der STOPs.

`mock500_after_stop.py` verwendet den vorhandenen Lock ohne Initialisierung und
prüft zwölf unveränderliche Bytebindungen, das vollständige Verzeichnisinventar,
beide STOPs, die beiden Reservierungen und das leere Terminalregister. Ein fester
SPENT-Anker wird vor dem Claim dauerhaft geschrieben. Ein fehlender oder teilweise
geschriebener Anker sperrt die Ausnahme. Feste LINKS-/POST-Dateien und die bestehenden
separaten Child-Anker verhindern erneute Verbrauchsschritte. Der Claim bindet den
lebenden Launcherprozess; ein Neustart kann ihn nicht als neuen Start übernehmen.

Eine authentisierte neue Betreiberanweisung mit Ausführungszweck bindet Runtime,
separaten Control-Commit, Nonce, GO, Request, Original-Metadaten, Quellenqualifikation
und unabhängigen Review. Entwicklungsfreigaben scheitern am Zulassungstor. Root muss
die tatsächliche Quelle der Anweisung authentisieren; JSON-Flags erzeugen keine
Berechtigung. Der private Adapter hat einen festen bestehenden Serienroot und einen
festen zukünftigen Child-Pfad. Seine Acceptance-Dateien bleiben bis zur jeweiligen
echten Abnahme beziehungsweise späteren Ausführungsanweisung abwesend.

Die vollständige authentisierte globale manuelle GitHub-Historie einschließlich der
getrennt genehmigten Prepare-Diagnosen wird vor Launch/READY abgeglichen. Control-CI
und Runtime-CI bleiben getrennte Nachweise. Der vorhandene unveränderte Fullsender
prüft weiterhin Quellen, Original-Metadaten, CI, Review, End500, Umgebung, Branch und
Zeitfenster vor READY. Ein bis dahin verbrauchter Claim wird auch bei einem späteren
Preflightfehler nicht erstattet. Nach frischen Links finden nur lokale Bindungs-,
Anker-, Ablaufzeit- und Claimprüfungen statt; keine zusätzlichen GitHub-Abfragen.

Ein akzeptierter Dispatch verbraucht den Versuch, beweist aber kein Mock500-PASS.
Fehler oder unklarer Dispatch schließen UNKNOWN. Eine spätere PASS-/FAIL-Schließung
benötigt tatsächlichen Run/Job, Receipt, unabhängigen Review, bekannte Bereinigung,
Originalintegrität und native Nullaktivität. Keine Schließung öffnet einen weiteren
Versuch oder ändert das historische Slot-2-UNKNOWN.

Validierung: acht neue synthetische Fälle im bestehenden Serien-Testentry prüfen
Entwicklungs-/gefälschte Autorität, Bindungen, Drift, fehlende und zusätzliche Anker,
globale Historie, parallele Claims, Absturz/fsync, Ablauf und Terminalauthentisierung.
Fünf private synthetische Integrationstests verwenden die tatsächlichen neuen
Adapter-/Launcher-/Link-Templates mit temporären Roots und Fake-API/Sender. Das ist
keine Wiederholung von Originalverarbeitung oder ein Voll-Mock-Nachweis. Die private
äußere Tool-Anbindung und der bestehende Metadatenbinder werden ebenfalls kopiert
und auf Runtime33d/CI41889108711/PR1042 gebunden; die alten Dateien bleiben erhalten.

Runtime33d samt CI41889108711 und unabhängigem Kalender-vor-Seal-Review wird
übernommen. Empfang41037459441 und End50041325430429 werden übernommen. Der nächste
geschützte Lauf ist bei späterem ausdrücklichem GO direkt der Voll-Mock; kein neuer
Prepare-Diagnoselauf wird vorausgesetzt. Diese Entwicklung erzeugt weder GO, Nonce,
Link, Reservation, Profilaktivierung noch Job. Vor einem Start sind die eigene
Control-CI/Abnahme und alle frischen Bindungen auf Runtime33d weiterhin erforderlich.
