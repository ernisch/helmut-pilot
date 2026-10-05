# Supabase-Plattformgrenze und begrenzte Audit-Diagnose

Stand: 05.10.2026. Die datierten Befunde sind keine aktuelle 500er Startfreigabe.

## Verbindliche Plattformgrundlage

Laut der vom Betreiber übermittelten Support-Antwort vergibt Supabase weder
dauerhaft noch temporär privilegierte Rollen wie `pg_maintain` an Kunden und
führt keine privilegierte Einrichtung auf Kundenwunsch aus. Das Supportticket
wurde nicht unabhängig eingesehen. Ein weiterer Sonderzugang ist kein
Lösungsweg. Kunden können eigene Objekte mit ihren normalen Rechten sperren
und warten; daraus folgt keine Sperrbarkeit aller Rollen oder Systemkataloge.

## Tatsächlich ausgeführter, abgeschlossener Umfang

Nach ausdrücklichem GO wurde pgAudit 17.1 vorübergehend eingerichtet und
`postgres` auf `ddl,role,misc_set` mit ausgeschaltetem Audit-Statementtext
konfiguriert. Die Einstellungen waren in einer frischen Sitzung wirksam.

Der einmalige begrenzte Erfassungslauf brach bei `SET ROLE` einer eigenen
NOLOGIN-Testrolle mit `42501` ab. Die Transaktion wurde vollständig
zurückgerollt; Rollen, Tabelle und Funktion blieben nicht bestehen. Zuvor
erreichte DDL-, Rollen- und GRANT/REVOKE-Schritte sind durch begrenzte
Audit-Metadaten und Phasenmarkierungen derselben Sitzung belegt. Die sieben
geplanten Fälle sind dadurch nicht insgesamt bestanden.

Der noch offene Abschaltfall wurde ausschließlich als sitzungsbezogener
Maskentest ohne weitere Testobjekte oder Grants untersucht. Auch
`SET LOCAL pgaudit.log` wurde mit `42501` abgewiesen. Es gab keinen erneuten
Erfassungslauf und keine zusätzliche Rechtevergabe.

Einrichtung und Rückbau waren erfolgreich. Der rein lesende Endbeleg vom
05.10., **19:09:42 UTC**, zeigt: pgAudit und alle Testobjekte entfernt,
ursprüngliche `postgres`-Einstellungen und vorhandene Event-Callbacks exakt
wiederhergestellt; **501 Identitäten / 500 Mandate / 0 aktive Mandate**.
Die Vollzeilen-Hashes einschließlich `xmin` für Profile, Mandate, geschützten
Speicher und die bisherigen 47 Journalzeilen sind gleich. Das Journal enthält
jetzt 49 Einträge durch genau zwei erhaltene Einrichtungs-/Rückbauquittungen.
Jobs, Locks, Outbox und laufende Helmut-Prozesse waren jeweils null.

Die kritische unabhängige Endprüfung durch DeepSeek V4 Pro High akzeptiert
den abgeschlossenen Diagnoseauftrag. Eine gesonderte Flash-High-Prüfung
bestätigt ausschließlich die Quellenbindung der vier `xmin`-Hashausdrücke.
Die privaten SQL-, SDK-, Native-TEXT- und Logoriginale bleiben außerhalb
des Repositorys. Einzelzeilen wurden nicht exportiert. Keine neuen bezahlten
Production-Modellaufrufe, keine Aktivierung und kein 500er Test.

## Beleggrenze und nächster Blocker

Die begrenzte Audit-Erfassung ist belegt, ihre vollständige Abdeckung aller
Kunden- oder Plattformadministrationswege ist es nicht. Endpunkthashes
verhindern keine zwischenzeitliche Änderung mit anschließender Rücksetzung.
Eine technisch erzwungene globale Katalogsperre oder Unveränderlichkeit
gegenüber Supabase-Administratoren wird ausdrücklich nicht behauptet.

Der Ersatzschutz und die vollständige aktuelle Native-D-/Caller-/Root-Zulassung
bleiben offen. Inerte Installationsquellen und ungebundene Stopbedingungen
werden nicht auf erfolgreich gesetzt. Nötig ist ein konkret geprüfter,
versionsgebundener Schutz- und Nutzungsnachweis mit den tatsächlich
unterstützten Rechten und ausdrücklich dokumentierter Plattformgrenze.

Der [Synthetikauftrag](synthetischer-500er-auftrag-20261001.md) bleibt erhalten:
exakt 500 gleichzeitig aktive Zielprofile, 330 Bundestag / 120 Berlin /
50 Brandenburg, 1500 vollständig bilanzierte Ergebnispositionen samt
Qualität, Kosten, Zeit, Endwächter, Rückweg und unabhängiger Endabnahme.

