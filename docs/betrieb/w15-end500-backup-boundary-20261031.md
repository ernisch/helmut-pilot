# End500: private Gatewaydatei und erste Sicherungsfehlerphase

Die Shell legt die umgeleitete Gateway-Logdatei an, bevor der Node-Prozess
startet. Deshalb muss die bestehende Startzeile ihre private Dateimaske selbst
setzen. Mit `umask 077` entsteht die Datei als `0600`; der Sicherungscollector
behält seine strenge Prüfung sämtlicher privater Dateien bei.

Die gezielte Gegenprobe verwendet die tatsächliche vorbereitete Anwendung,
die vorhandene Materialisierung und den echten Collector mit kleinen fiktiven
Eingaben. Eine geerbte Maske `022` darf keine lesbare private Logdatei erzeugen.
Die zusätzliche CI-Beobachtung liest ausschließlich die Docker-exec-Maske des
bereits vorhandenen synthetischen Datenbankdienstes. Sie ist kein nachträglich
gemessener Dateimodus eines früheren Originaldatenlaufs.

Die bestehenden festen Phasen `backup-collect`, `backup-seal` und
`backup-postcheck` werden vor den jeweiligen Tätigkeiten beobachtet. Bei einem
Fehler vor dem bestehenden Rücklesungs-/Rücksicherungshook bleibt dessen erste
geschlossene Phase über den vorhandenen Controllerabschluss und Worker-IPC
erhalten. Frühere Nativefehler und die genauere erste Hookfehlerphase behalten
Vorrang. Freie Fehlermeldungen, Pfade und private Inhalte werden nicht exportiert.

RAM-, Zeit-, Kosten-, Integritäts- und Freigabeverträge ändern sich nicht.
Ein vollständiger echter Lauf benötigt weiterhin ein neues, exakt gebundenes GO;
eine bestandene synthetische Collection ist keine End500- oder Mock500-Abnahme.
