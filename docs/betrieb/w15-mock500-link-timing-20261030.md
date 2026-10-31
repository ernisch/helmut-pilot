# Einmaliger Mock-Originalempfang: Vorbereitung vor frischem Link

Der bisherige echte anonyme Cipherabruf ist übernommen: HTTP200,
17780398Bytes/SHA256f8447b6fdde4c2c4fa76a8322999bd844f0c4445ee6077b29e3d29f93359f414.
Keine Wiederbeschaffung oder erneute Originalprobe in diesem Sprint.
Der spätere Start stoppte mit68,707s Restzeit unter der unveränderten90s-Grenze.
Die Linkerzeugung war vor der Fertigstellung externer Vorbereitung erfolgt.
Ein sekundärer Fehler im damaligen externen Fehlerabschluss bleibt dokumentiert;
er wird durch einen festen, getesteten Fehlerabschluss ersetzt.

## Ausführbare Reihenfolge, keine heutige Ausführungsfreigabe

Der Empfänger bleibt exakt13b858b1a1e83a695e1fa64446573b5b550921ea aus PR982.
Seine CI41025045991 und unabhängige Abnahme werden übernommen, nicht erneut
ausgeführt. Die neue externe Ablaufsteuerung hat ihren eigenen geprüften Kopf,
eigenen Review und Pflicht-CI im Nachfolge-Draft-PR. Empfängercode unverändert.

Nach erst späterem konkretem GO:

1. Öffentliche Freigabedatei und frischen privaten Zustandsordner vorbereiten.
   Der GO-Vertrag bindet beide Köpfe, Review-/CI-Belege, einmaligen Versuch,
   Branch/Environment, Nonce und Gültigkeitsfenster. Keine Zugangsdaten darin.
2. `mock500_receive_dispatch.exec.js` prüft zuerst ausschließlich die Metadaten
   des vorhandenen Drive-Objekts. Es startet den externen Python-Orchestrator
   `mock500_receive_dispatch.py` und wartet auf dessen exakte READY-Meldung.
3. Dieser prüft vor READY den tatsächlichen lokalen Launcher-Kopf, Receiver-Kopf,
   aktuelle GitHub-CI, unabhängige Reviews, Environment und erlaubten Branch,
   sichere Abstammung und alle übrigen Vorbedingungen. Nur mit expliziter
   zukünftiger Erlaubnis den Ausführungsbranch per force:false auf Receiver13
   vorsetzen und diesen Stand lesend bestätigen. Keine Änderung nach main.
4. **Erst nach READY_FOR_FRESH_PRIVATE_LINK** ruft der Tool-Wrapper genau einmal
   den vorhandenen authentifizierten Drive-Connector auf. Dessen tatsächliches
   `file_uri.download_url` geht sofort über nicht echoendes stdin an den bereits
   wartenden Orchestrator. Keine URL in CLI-Argumenten, Logs oder öffentlichen
   Workflowinputs. Kein erneuter Cipherdownload als Vorprüfung: dessen
   Transportfähigkeit und erwartete Pins sind bereits belegt.
5. Ausschließlich lokale Arbeit nach dem Link: echte SAS-se-Ablaufzeit und
   read-only/single-blob/keine IP-Bindung prüfen, vorhandenen GPG-Indexencoder
   verwenden, vollständige vier Parameter und serialisierten Dispatch≤65535
   binden. **Unmittelbar vor POST erneut tatsächliche Restgültigkeit>90s**;
   genau90s reichen nicht. Kein GitHub-GET/Branchupdate/Review nach Linkerzeugung.
6. Exklusiven Dispatch-Versuchsmarker vor dem einzigen POST schreiben. Bei
   Zeitmangel, FAIL/UNKNOWN, HTTP-Fehler oder unklarer Antwort stoppen; weder
   automatischer Linkrefresh noch Retry. Ein unklar beantworteter POST ist kein
   Beweis dafür, dass kein Job gestartet wurde; dann nur lesend nachkontrollieren.

Der JS-Wrapper wird im vorhandenen Toolruntime mit explizitem `tools` aufgerufen;
Import selbst führt nichts aus. `executeAfterGo:true` ist erst nach Betreiber-GO
zulässig. Argumente sind ausschließlich der geprüfte Launcher-Commit sowie
private Zustands-/Freigabepfade. Standard-Pythonmodus ist ein gesperrter Plan.
Weder Tool-Wrapper noch Orchestrator enthalten Drive-Anmeldedaten oder neue
Schlüssel. Gezielte Tests injizieren fiktive Tools/Uhren/HTTP/GPG-Grenzen; sie
führen keine echte Übertragung, Branchänderung oder GitHub-Ausführung durch.

## Annahme und unveränderte Grenzen

READY bedeutet nur, dass die externe Vorbereitung vollständig abgeschlossen ist.
Ein Dispatch-PASS ist keine Empfangsabnahme. Erst der tatsächliche Job muss alle
elf Originaldateien217563454Bytes, Manifest und GPG-Integrität vollständig
bestätigen. Danach unabhängige Quittungsabnahme. Vorher Datenblocker weiter offen.

Empfang600s, äußerer Job15Minuten, bestehender Ubuntu-Standardrunner und
mindestens1GiB freie Plattenreserve. Keine zusätzliche Artefaktspeicherung,
0Modellaufrufe, keine Schlüssel-/Secretkopien oder öffentliche Freigabe.
RAM-Verträge unverändert; keine RAM-v2-Abnahme durch diesen Empfang.
Kein Restore, End500, Mock500, Merge, Deployment oder Productioneingriff.
Bei Abbruch ausschließlich eigene Prozesse stoppen und Status wahrheitsgemäß
melden. Bestehende Secrets, Drive-Dateien, Cipher und Originale erhalten;
keine automatische Löschung. Ein späterer Mockjob braucht weiterhin seinen
eigenen gemeinsamen Empfang und eine separate Freigabe.

Die konkrete einmalige GO-Vorlage mit den tatsächlichen Launcher-/Empfängerköpfen,
Pflicht-CI und unabhängigem Review steht im Nachfolge-Draft-PR. Kein heutiger
Lauf und keine Fristverlängerung durch Umschreiben der Linkablaufzeit.
