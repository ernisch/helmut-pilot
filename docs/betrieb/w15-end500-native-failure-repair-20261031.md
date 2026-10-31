# Isolierter End500: vorbereitete Importkette und erster innerer Fehler

Der vorbereitete End500-Prozess lädt `server.js` ohne einen HTTP-Listener zu
starten. Dessen öffentliche Importkette lädt über `bb-nachweis-operator.js` auch
`scripts/bb-nachweis-importpaket-generator.js`. Diese Datei muss zusammen mit
den bereits kopierten Bibliotheken im vorbereiteten Anwendungsverzeichnis
liegen. Der kleine Importtest verwendet genau diesen Verzeichniszuschnitt,
keine Originaldaten und keine Datenbank. Ein passender reproduzierbarer
Importfehler beweist allein nicht nachträglich die Ursache eines historischen
Laufs ohne innere Fehlerquittung.

Die erste innere Fehlermeldung enthält ausschließlich feste Phasen,
Fehlerkategorien, erlaubte technische Codes, begrenzte Zahlen und einen festen
Prüfhinweis. Freie Meldungen, Stacktraces, Dateipfade, SQL, URLs, Geheimnisse und
Hashwerte privater Inhalte werden nicht weitergegeben. Nicht belegte Werte
bleiben `UNKNOWN`. Die CAS-Zahl bezeichnet nur bereits dauerhaft bestätigte
Vorgänge als Untergrenze; null bestätigte Vorgänge beweisen keine null
Schreibversuche.

Ein einzelner kleiner Fehlercheckpoint erreicht den Supervisor über die
vorhandene private Pipe vor der inneren Bereinigung. Der Supervisor erhält
keinen zusätzlichen Überwachungsprozess. Er bewahrt diesen ersten Fehler auch
bei späterem Signal, fehlendem Abschlussbericht oder einer fehlgeschlagenen
Ressourcenmessung. Nachfolgende Fehler und Bereinigungsergebnisse bleiben
getrennt; eine zuletzt betretene Bereinigungsphase ersetzt nicht die innere
Fehlerphase. Unbestätigter Prozessstillstand bleibt `UNKNOWN`.

Die bestehenden RAM-, Zeit-, Kosten-, Integritäts- und Freigabeverträge ändern
sich nicht. Der Kapazitätsmodus bleibt eine Diagnose und kann die reguläre
End500-Speicherabnahme oder eine Mock500-Abnahme nicht ersetzen. Ein echter
Lauf benötigt weiterhin die gebundene einmalige Betreiberfreigabe, grüne
Pflicht-CI, unabhängige Prüfung, aktuelle Startbedingungen und frische private
Links erst nach Abschluss der Vorbereitung. Diese Änderung startet keinen Lauf.
