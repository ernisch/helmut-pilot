# Hetzner: Vorbereitung des einmaligen PR942-Auth-Profils

Stand: 25.10.2026, Europe/Istanbul. Nur Vorbereitung; kein Transfer, kein
Hostumbau und keine native Ausführung aus diesem Dokument ableiten.

## Verbindliche Ausgangspunkte

* Motor und vorhandener Vier-TX-Profiler: PR942,
  `29b05ac0281347f8cde82b903b12f57e8cd5d8c9`.
* Unveränderter Profilplan: `GO_PLAN.SAFE.json`, SHA256
  `4f336065fbdd2a210bee2a3dc8fee92a5a07a456f36d1950ff1f4ec1aecec8b8`.
* Vorhandener Verbindungsbeleg: GitHub40189037230, **Versuch2**, SUCCESS,
  Infrastrukturcode `134dafb5c0c7da013e66fba2ee4eecc70af31602`.
  Er wird übernommen, nicht erneut ausgeführt.
* Die bereinigte gespeicherte Antwort meldet Ubuntu24.04/x86_64,
  16.368.984.064B RAM, 152.379.424.768B freien Platz und cgroup_v2=true.
  Das sind datierte Bestandsbelege, keine frische native Admission.
* `rootless_docker_version=null`, `native_execution_enabled=false`.
  Docker29.1.3 ist Betreiberangabe; der Probe hat diesen Server nicht
  qualifiziert. Die Brücke verweigert Rootful-Fallback, privilegierte Gruppen,
  Upload, Checkout und Testbefehle. Ihr installierter Quellhash ist
  `85111232a240a41d43622a2ad188f74232ca04b6dd5458da0871c254977d69d9`.
  Clientquelle bei134dafb5: SHA256
  `db9ca86ce62638e5775134d1d95153171a7d744a0e0ba2d834b745e6dcd44e30`.
  Client und installierter Gate sind getrennt gebunden, nicht bytegleich
  behauptet. Der historische SSH-Hostfingerabdruck aus dem erfolgreichen Job
  ist `SHA256:u48IkPIpHilVGYw2MwJuE1pv4XMjlJ88cQjUzN4Lh1c`.

Der aktuelle main-Zustand enthält den Transport, aber nicht den ungemergten
PR942-Motorstand. main/Infrastructure und Motor sind getrennte Quellenbindungen;
kein Motorstart auf main und kein automatischer Merge.

## Kleinster vorgesehener Zielaufbau

Die bestehende Hetzner-Maschine verwenden. Keine neue VM oder kostenpflichtige
Ressource anlegen. Der native Testkontext muss vom Transportkonto `helmut-ci`,
seinen Credentials, vorhandenen Diensten und Docker29-Daten getrennt bleiben.
Insbesondere `helmut-ci` nicht in docker/sudo/root/adm aufnehmen; die bestehende
Probe und deren geschlossene Befehlsliste bleiben unverändert.

Bevorzugt **Docker28.4.0 im ausschließlich eigenen nativen Testkontext**
wiederherstellen. `local-unit-native-execution-host.py` verlangt tatsächlich
die geschlossene Serverbindung Version28.4.0/API1.51/MinAPI1.24/GitCommit249d679,
`/usr/local/bin/docker` und `unix:///var/run/docker.sock`. Eine Versionsliste,
pauschale Docker29-Freigabe oder ein DOCKER_HOST-Override wären keine Abnahme.
Der bestehende Messpfad verlangt außerdem VFS, cgroupv2/cgroupfs, seine tatsächliche
Eltern-/Containerhierarchie, UID/GID1000, keine Workload-Capabilities,
no-new-privileges und netzlose, schreibgeschützte Workload-Container.

Administrativ muss daher ein kompatibler eigener Docker-/cgroup-Kontext mit
separatem Daten- und Laufzeitverzeichnis bereitgestellt werden. Bestehenden
Docker29-Dienst, dessen Socket, Storage und laufende/fremde Arbeit weder
ersetzen noch herabstufen. Die fest benötigten Pfade dürfen nur innerhalb
des eigenen kollisionsfreien Testkontexts gelten; keine Socket-Symlinks und
kein ungebundener privilegierter Remote-Shellzugang. Ist das auf dem
vorhandenen Host nicht ohne Eingriff in fremde Ressourcen möglich: STOP,
keine weitere Architektur oder automatische Alternative aus diesem Auftrag.

Rootless-Docker29 plus freie Platte beweist die nötigen Loop-, Mount-,
cgroup-, Prozess- und Ressourcenrechte nicht. Auch allein Docker28.4 stellt
diese Bedingungen nicht her. Tatsächliche Rechte, Controller, Treiber,
PID-/Zeit-/Mountnamespaces, Prozesszuordnung und alle Abschlusswege sind
vor den vier Schreibvorgängen durch die vorhandenen Qualifier frisch zu prüfen.

Die acht Originalprogramme der vorhandenen Docker28-Distribution sind mit
frischen Datei-Hashes im privaten Eingangsplan gebunden. Ein reiner lokaler
`dockerd --version`-Aufruf bestätigt28.4.0/build249d679 und startete keinen
Daemon-Dienst. Damit ist die exakte Binärquelle bekannt; ein ungefähr passendes
Paket oder eine Docker29-Ausnahme ist nicht vorgesehen. Zielinstallation offen.

Kürzester vorgesehener Bedienweg ist der bereits berechtigte Administrator
im getrennten Testkontext, danach der unveränderte native Supervisor unter
UID/GID1000. Es wird kein neuer Remoteexecutor entwickelt. Der bisherige
Probe-Schlüssel ist dafür technisch kein Administrations-/Testzugang.
Fehlt der berechtigte Kontext, bleibt dieser Schritt offen; ein GO allein
verändert die tatsächlichen Zugangsmöglichkeiten nicht.

## Originale und Laufzeit: ausschließlich begrenzte Bereitstellung

Kein pauschales `/workspace`-, PGDATA-, Home-, Docker- oder Secret-Archiv.
Die private `INPUT_CLOSURE_V3.PRIVATE.json` ist eine Metadatenplanung aus
vorhandenen Source-/Runtimepins, keine neue Laufberechtigung. Historische
WORKER_CONFIGs, Nonces, Container-IDs, Kernellaufzeiten, OIDs und Claims dürfen
nicht auf dem Ziel wiederverwendet werden.

Benötigte Klassen sind:

1. Echter V12-POSTRUN: das2GiB-Originalimage mit SHA256
   `54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693`
   sowie das unveränderte1744-Einträge-Extraktionsmanifest. Ein Quellinputdump
   oder die Endquittung ersetzt den POSTRUN nicht.
2. Die fest gebundenen originalen Paket-, Request-, Fixture- und
   Installationsreferenzen einschließlich ihrer vollständigen benötigten
   Kontextbindung; keine neu erzeugten Ersatzoriginale.
3. Die548 Grund-Runtimebindungen plus Shell und Python-Kompatibilität;
   Node24.19.0, Python3.12.14, PostgreSQL/PostgREST samt vollständiger ELF-
   Schließung, die qualifizierten Reader-/JIT-/Abschlussquellen und deren
   Provenienz. Öffentlicher Code stammt exakt aus dem gebundenen Gitcommit.
4. Das unveränderte native Hilfsimage
   `sha256:34e72f77a5fa0728d44b75766cdfdb1851aea196b3ba6c4fb9242f5d339a678b`.
   OCI-Export/Import sind noch nicht durchgeführt; Exporthash und tatsächliche
   Ziel-Imageidentität müssen separat entstehen, kein Ersatzbuild mit ähnlichem Namen.

Die595 Metadaten-/Dateieingänge umfassen2.801.506.128B gegenwärtig vorhandene
logische Quelldaten, ohne neuen Archiv-/Cipherumfang zu behaupten. Fünf bisher
unter `/tmp/helmut-meter-filesystem-tools/lib` referenzierte Reader-ELFs sind
nicht mehr dort vorhanden. Ihre exakten Größen/Hashes stimmen mit den fünf
regulären Mitgliedern im vorhandenen PG17-Rootmanifest überein; dessen vollständiger
Dateihash wurde geprüft. Das gebundene161.574.108B-Originalarchiv ist vorhanden,
SHA256 `8b1da16e05827e2aa8069c8cc0080f04c4b2b51abb7e0d242a707c90d6ef2d49`.
Die geplante Mitgliedswiederherstellung und deren echte Byteprüfung sind noch
nicht durchgeführt. Aktuelle Hostbibliotheken wurden geprüft und sind keine
byteidentischen Ersatzquellen. Quelle und Ziel müssen alle benötigten absoluten
Originalpfade wiederherstellen; allein ein Gitcheckout reicht nicht.

Die tatsächliche Abdeckung jedes nötigen Eingangs durch vorhandene Sicherungen
und seine Secretklasse bleiben Eingangstore. Ein Cipher-Rückdownload allein
beweist keine vollständige Klartextwiederherstellung. Fehlt ein Original in
einer vorhandenen Sicherung, muss die konkret gebundene verschlüsselte Sicherung
dieses vorhandenen Originals Bestandteil der neuen Freigabe sein; nicht
stillschweigend Vollständigkeit behaupten.

Konkreter vorhandener Sicherungsabgleich: Im577er-Erstentwurf sind268 Pins
pfad-/größen-/hashgleich enthalten, ein weiterer als identischer Inhaltsalias,
300 ausgeschlossen und acht ohne enthaltenen Nachweis. Das ist **keine**
Abdeckungszahl für den erweiterten595er-Plan. Insbesondere V12-RAW, Mapping,
Requests und Runtimebindungsmanifest fehlen im alten verschlüsselten Paket.
Dessen Cipher-Rückprüfung belegt15 Teile/356.225.107B, aber ausdrücklich keinen
erfolgreichen Ziel-Klartextrestore. Die alte443-Dateien-Wiederherstellung ist
echt belegt, betrifft jedoch den19.10.-Inputstand und ersetzt V12 nicht.
Die Originale sind lokal vorhanden; nötig ist deshalb ein zielspezifisches,
exakt begrenztes Ergänzungs-/Wiederverschlüsselungspaket, kein neuer Originalnachbau.

Für die spätere Freigabe ist ausschließlich der bereits bestätigte private
verschlüsselte Drive-Weg vorgesehen. Der Empfängerschlüssel muss **auf dem
identitätsgeprüften Hetzner-Ziel** erzeugt werden; privater Schlüssel ausschließlich
dort/0600. Nur öffentlichen Schlüssel/Fingerabdruck an die Quelle geben.
Vor Datenabfluss Zielidentität und Empfänger unabhängig abgleichen. Keine alten
privaten Cloud-Empfängerschlüssel, SSH-Schlüssel, Production-/Cloudtokens oder
Host-Credentials exportieren. Ausschließlich explizit freigegebene lokale
synthetische Testsecrets dürfen im verschlüsselten Nutzdatenumfang enthalten sein.
Ungeklärte Secretklasse stoppt den Transfer.

Neue Nutzdaten möglichst streamend verschlüsseln. Vorhandene vollständige,
qualifizierte Cipherkopien nicht grundlos erneut hochladen. Jede nötige neue
Übertragung vollständig rückladen/hashprüfen; Ziel entschlüsseln, alle
Dateihashes/Struktur prüfen und unabhängig abnehmen. Originale bleiben
unverändert lokal erhalten. Keine Bereinigung aus der Transferfreigabe ableiten.

## Einmaliger Messlauf nach neuer konkreter Hetzner-Freigabe

Die Codex-Cloud-Freigabe ist unbenutzt, aber kein Hetzner-Claim. Der neue
Zielkontext benötigt eine eigene einmalige Fall-, Zeit-, Quellen-, Runtime-,
Kernel-, Mount- und Ressourcenbindung. Die neue native Datenbank muss ihre
echten OIDs/Kataloge durch die vorhandenen Qualifier während des gemessenen
Aufbaus und **vor** den vier Schreibvorgängen belegen.

Der einzige vorgesehene Motorcode liegt auf dem Ziel als sauberer Checkout
`/workspace/helmut-auth-critical-path-20261025` bei exakt29b05ac0…; die neuen
Vorbereitungsunterlagen und Freigaben liegen außerhalb dieses Checkouts.

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 -I -S -B \
  /workspace/helmut-auth-critical-path-20261025/scripts/helmut-resource-meter/local-unit-native-supervisor.py \
  --diagnose-native-transaction-guard --transaction-guard-case same-root-usage --profile-functions
```

Ein gemessener Aufbau, anschließend genau CLAIM_STATE, RESERVE_D, SEND_D,
SAME_ROOT_USAGE: echte CoreCAS-Delta4 und genau zwei Statistik-Snapshots.
Mindestens10.737.418.240B vor Aufbau/Start, mindestens8GiB währenddessen;
der größere Datenträger ersetzt keinen frischen Nachweis. Gemeinsamer
Messumfang, native Speichergrenzen, Setup-/Installations-/Abschlussphasen,
CPU-/Nodebudgets, Originalschutz, CAS, ACK, History und sämtliche Exit-/EOF-
Prüfungen bleiben unverändert. Keine ausgelagerte ungemessene Fallvorbereitung.

Funktions-Self/Totalzeiten getrennt, verschachtelte Zeiten nicht summieren.
Fehlende/inlinierte Statistik bleibt OPEN; keine künstlichen Nullen, Resets,
Cachebereinigung oder erzwungener GC als Erfolg. Schlussprüfung unabhängig:
Originalschutz, Katalog/OIDs, Daten/Bestätigungen, vier CAS, Statistikabfragen,
alle Prozesse/Gruppen/EOFs und freier Platz.

FAIL/UNKNOWN/unvollständig: sofort stoppen, Erstfehler und Arbeitskopie erhalten,
kein Retry und kein automatisches Löschen. Ein Komponenten-PASS ist weder
Unit60-/Auth30-/500MB- noch500er-Abnahme. Erst echte innere Zeiten erlauben die
Entscheidung über einen ausreichend wirksamen sicheren Kernumbau; keine
anschließende Experimentserie.

## Eine gebündelte Freigabe, keine Aktivierung durch diesen Plan

Die beigefügte `PREPARATION_PLAN.SAFE.json` trennt lokale Vorbereitung,
administrative Zielbereitstellung, begrenzten verschlüsselten Originaltransfer
und einmalige native Komponentenmessung. Aktuell sind die letzten drei
**nicht aktiviert**. Eine spätere konkrete Freigabe kann sie bedingt zusammen
abdecken: jede Stufe muss vollständig angenommen sein, bevor die nächste beginnt.
Fehlender administrativer Zugang wird nicht durch den Probe-Schlüssel umgangen.

Die aktuelle Vorbereitung umfasst keinen neuen Verbindungscheck, Remoteaufruf,
Originaltransfer, Dockerumbau oder echten Test. Production, Merge, Deployment,
neue kostenpflichtige Ressourcen, vollständige Einzelunit und500er bleiben gesperrt.

Die [konkrete deutsche GO-Vorlage](belege/hetzner-native-preparation-20261025/GO_TEMPLATE.DE.md)
bindet Planhash, Zielhost,595er-Eingangsplan und die bedingte Stufenfolge.
Sie ist keine Freigabe und keine Behauptung bereits verfügbarer Ausführungsrechte.
