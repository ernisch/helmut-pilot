# Lokale Kontrollsicht im Ressourcenablauf, 19.10.2026

**Statisch vorbereiteter Code, nicht getestet oder unabhängig abgenommen.**
Fortsetzung des vorhandenen W50-Vorschlags; kein neuer Ressourcenlauf und keine
neue Optimierungsanalyse. Standard bleibt AUS. Die Quellenannahme zu c6620c83
nimmt diesen späteren Glue-Code nicht ab.

Der Betreiber hat bestätigt, dass der alte Thread weiterhin Originalzugriff hat.
Hier nur statisch fortsetzen; die Änderungen müssen dort übernommen und geprüft
werden. Der Originalzugriff wird in dieser Instanz dadurch nicht hergestellt.

Der Descriptor akzeptiert `controlRead: "verified-control-view-v1"` nur mit
`stateStorage: "merkle-auth-v1"` und
`historyReadReuse: "verified-history-reuse-v1"`. Graph-Reuse und
Single-Write-Capture bleiben gesperrt. Die neun akzeptierten Leser-, Transport-,
Aufrufer- und SQL-Quellen sind an die tatsächlichen W50-SHA256 gebunden; auch ein
frisch erstellter Descriptor darf geänderte Leserbytes nicht still übernehmen.
Review- und Transportabschluss sind mit Hash und Umfang als Metadaten eingebettet,
keine neu geöffneten privaten Belegdateien und keine Laufgenehmigung.

Der bestehende Renderer prüft vor der Ausgabe den vollständigen Descriptor mit
demselben JS-Prüfer wie die spätere Laufzeit. Er reicht das Flag an Brücke,
Materialvorbereitung, Autoritätsprozess und initiale Assembly weiter; die
Konfigurationsassembly übernimmt wie bisher Descriptor und Bootstrapquittung.
Widersprüchliche Umgebungswerte werden vor dem Überschreiben zurückgewiesen.
Das gilt auch für die initiale Assembly, bevor sie die Modusvariablen setzt.
Explizit leere, null-, false- oder0-Werte für den Merkle-Modus sind keine
fehlende Einstellung; nur Abwesenheit oder der exakt gebundene Modus ist erlaubt.
Der unveränderte `actualSourceBinding`-Pfad erfasst den Kontrollmodus bereits und
stellt sämtliche sieben betroffenen Aufrufervariablen auch bei Fehlern wieder her.

Alle neu zusätzlich gelesenen Quellen stehen in `descriptor.sourcePins`.
`isolation.runtime_read_manifest` übernimmt genau diese Pins für die vorhandene
gemeinsame Zuordnung und deren echte schreibgeschützte Containersichtprüfung.
Eine neue Prüfung der Dateiliste ist vorbereitet; sie ersetzt den tatsächlichen
Containercheck nicht. Writer, vollständiger Originaldecoder, SQL, Kosten- und
Notstopplogik, Autorisierungsslots und32 Startbedingungen sind nicht geändert.

## Fehlender Originalzugriff

Gesicherte Originalinstanz:
`ccarenv_b64_Y2NhcmVudl8yMzI3YWRjOGE3ZjA4MTkxOTdlMjczNjc2NjliOTIzNw`.
Aktuell angebunden:
`ccarenv_b64_Y2NhcmVudl8yOTU4NWEyOWM5NjA4MTkxYjhjNTkwOTY0ZGZkYjllOQ`.
Beide Originalpfade fehlen, ebenso alle acht katalogisierten Dateien und der
PostgreSQL-Container `59812947e2e062ddcaaae11f958758b6f28fdd30743aaaedf30347f28ca88a38`.
Die aktuelle Dockerliste enthält keine Container oder Volumes. Es läuft kein
beobachteter HELMUT-Prozess. Die Ressourcen dieser anderen Instanz schließen die
offene Plattenreserve der Originalumgebung nicht.

Das hashgeprüfte Git-Delta wurde nach CODE_RECOVERY auf dem vorhandenen
Basiscommit1eb3cbff separat nach039b115b wiederhergestellt. Keine Originalpfade
angelegt, kein Original nachgebaut und keine Datenbank rekonstruiert. GitHub ist
bei dieser Wiederaufnahme lesbar; main wurde auf1eb3cbff abgelesen. Das ist kein
Push- oder aktueller CI-Beleg des neuen Codes.

## Noch erforderliche Prüfung

Keine Anwendungstests ausgeführt. Vorbereitet sind gezielte Negativfälle für
Modus/Voraussetzungen, unveränderte Quellenannahme trotz Neu-Pinning, gefälschte
Descriptorfelder, alle sieben Aufrufervariablen bei Erfolg und Fehler,
26 echte Vorlagen samt vollständigem Delta-Replay und die gemeinsame Dateiliste.
Die bestehende Kalenderanbindungsprüfung deckt nun auch die Kombination mit
Kontrollsicht ab.
Die statische Nachprüfung hat außerdem alle26 hashgebundenen Quellenvorlagen in
den vorhandenen sicheren Archiven zugeordnet (25 im Minimalarchiv, die exakte
CONFIG.TEMPLATE.json im Ressourcen-Ergänzungsarchiv). Die neuen Eingriffspunkte
wurden an den archivierten Aufruferquellen gelesen. Kein Renderer wurde dafür
aufgerufen und keine Originaldatei in den fehlenden Workspace zurückgeschrieben.
Diese Quellensicht ersetzt weder26 ausgeführte Anbindungstests noch die echte
Containersichtbarkeit oder eine unabhängige Abnahme.
Der veraltete native Funktionszähler im vorhandenen Test wurde auf die bereits
vorhandenen15 Funktionsformen korrigiert; keine SQL-Änderung.

Erst bei wieder erreichbarer Originalumgebung deren Zugriff rein lesend prüfen,
dann die notwendigen kleinen Integrationsprüfungen und eine unabhängige Abnahme
des neuen Glue-Codes durchführen. Kein bezahlter Aufruf aus dem verbrauchten
Einzel-GO und kein erfundener Prüferwechsel. Danach ursprüngliche Plattenreserve,
neue Fall-/Code-/Quellen-/Tages-/Zeitbindung und32 Bedingungen schließen. Erst
dann separates konkretes500er-GO einholen; alte Freigaben bleiben verbraucht.

Offline90, Unit60≤60s, Auth30≤30s, gemeinsamer Gesamtpeak≤2.048.000.000B und der
gewünschte500.000.000B-Puffer (Peak≤1.548.000.000B) bleiben offen. Die bestehenden
Betreiberkosten vom15.10. werden übernommen. Keine Löschung, Productionaktion,
Migration, Aktivierung, Merge, Deployment oder bezahlter Test ist erfolgt.
