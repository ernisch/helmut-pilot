# W15: End500 an denselben später abgenommenen Receiver binden

Der Original-Diagnoselauf41049571965 aufa2 bleibt unabhängig PASS für zwölf
Eingänge, fünf Restoreaktionen500/0 und vier Exporte. Vollrestore, End500 und
Mock500 sind dadurch nicht angenommen. Der neue End-Sender bereitet nur den
bereits vorhandenen End500-Modus vor, damit nach der künftigen Vollrestore-
Abnahme kein Receiverwechsel mit erneuter Originalwiederherstellung nötig wird.

## Zuerst den kleinen Startfehler schließen

Die gemeinsame Prüfung fand im bestehenden End500-spezifischen PostgreSQL-Poll
noch eine Unix-Socket-Bereitschaftslücke. Der gepinnte PostgreSQL17-Einstieg kann
während der Initialisierung einen vorübergehenden Unix-only-Server bereitstellen;
ein Poll ohne Host kann deshalb vor dem endgültigen Server erfolgreich sein.
Der separate Restore-/Recoveryweg hatte bereits die korrekte TCP-Bindung.
Die positive Originaldiagnose ist hiervon nicht betroffen.

Der unveränderte native End500-Poll erhält ausschließlich `-h 127.0.0.1`.
Eine isolierte Ausführung seines tatsächlichen AST-Polls mit fiktiven Prozessen
belegt vorher drei erwartete Fehler und danach fünf bestandene Gruppen:
temporärer Socket ist unzureichend, TCP-Server wird abgewartet, echte Bereitschaft,
100-Poll-Grenze und Timeout-/Signalweitergabe bleiben erhalten. Kein tatsächlicher
Main-, PostgreSQL-, Container-, Original- oder500er-Lauf hierfür. Diese Korrektur
erklärt den alten Restorefehler40958135662 ausdrücklich nicht rückwirkend.
SQL, native Wiederherstellungsbefehle, Reihenfolge und RAM-Verträge ändern sich nicht.

## Getrennt gesperrter äußerer End500-Anschluss

`end500_dispatch.py` und der eigenständig im V8-Toolruntime ladbare
`end500_dispatch.exec.js` verwenden die bestehenden GitHub-/GPG-/Privatdatei-
und Gitblobprüfer. Exakte Receiver-/Launcherköpfe können identisch oder getrennt
sein; beide benötigen ihre richtige Pflicht-CI und unabhängigen Reviews.
Receiverqualifikation, Scope`ISOLATED_GITHUB_END500_ONLY`, Mode
`end500-full-gated`, Versuch1, frische UUID4-Nonce und begrenztes GO-Fenster
werden vollständig vor READY geprüft. Der Standardaufruf bleibt gesperrt.

Ein tatsächlich positiver unabhängiger Vollrestorebeleg im Receiver-PR ist
zwingend. Schema`helmut-w15-independent-limited-restore-acceptance/1`, Status
`PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE`, exakter Receiver, kanonischer
Originalquittungshash, zwölf Eingänge,500/0, vollständige Sicherung, Fernrücklesung,
zweite Rücksicherung, Ressourcen und Bereinigung werden an einen eigenen
GO-Digest gebunden. Der bestehende GitHub-Lauf muss tatsächlich SUCCESS,
workflow_dispatch/Attempt1 auf genau diesem Receiver sein. Ein Diagnose-PASS
oder bloßes GO ersetzt diesen Beleg nicht. Vor der tatsächlichen Abnahme wird
kein solches Originalrecord erzeugt; positive Testrecords sind nur fiktive Fixtures.
Die Ungleichheit von altem Restore- und neuem End500-Run prüft der Receiver
an seiner tatsächlichen neuen GitHub-Lauf-ID.

Der erlaubte Ausführungsbranch muss bereits exakt am Receiver stehen; kein
PATCH durch den Sender. Sämtliche Metadaten, Reviews, CI und diese Vorabnahme
liegen vor READY. Erst dann15frische private Links, höchstens3gleichzeitig.
Der vorhandene GPG-Indexencoder bleibt unverändert. Echte Restgültigkeit>90s
nach Verschlüsselung und direkt nach fsync-Versuchsmarker vor genau einem POST;
alle vier tatsächlichen Inputs und kompletter Dispatch≤65535Zeichen.
Kein Refresh/Retry; UNKNOWN verbraucht den Versuch. Keine privaten Klartextlinks,
Originale oder Zugangsdaten in öffentlichen Parametern, Logs, Artefakten oder Caches.

## Unveränderter späterer End500-Umfang

Im gesondert freizugebenden gemeinsamen Lauf: vorhandene Eingänge und isolierter
Restore,500AuthCAS,6000Usage,3501nativePostimages, vollständige Ergebnisprüfung,
Rückführung auf0aktiveProfile und der bestehende vollständige verschlüsselte
Sicherungs-/Fernrücklese-/zweite-Rücksicherungsweg. Maximal3600s gemeinsam,
RAMv3 hart2560000000Bytes/Peak≤2048000000/Reserve≥512000000/Swap0,
bestehender vollständiger Plattenplan/Runner, höchstens0,05USD zusätzliche
Speicherung und0Modell-/Provideraufrufe. Kein Mock500 durch diesen Modus.

Bei FAIL/UNKNOWN sofort stoppen, erste vorhandene konkrete Phase und echte
Ressourcen-/Bereinigungsbelege sichern, keine automatische Wiederholung.
Nur eigene Prozesse beenden und Stillstand prüfen. Quellen, Drive-Dateien
und Secrets bleiben erhalten, keine automatische Löschung oder Branchrücksetzung.
Kein Merge, Deployment oder Productioneingriff. Die nächste echte Freigabe
bleibt zuerst der vollständige Restore; End500-GO erst nach dessen Abnahme.
