# W15-End500: vorbereiteter einmaliger Cloudtransfer

**Freigabestand: vorbereitet, noch nicht übertragen.** Nur die ausgewählten
zwölf Dateien dürfen nach konkretem GO den bestehenden Quellchat verlassen.
Kein Mac im Datenweg, kein neuer Dienst, keine Production-Änderung und kein
End500-/Mock500-Start. RAM-v3 bleibt 2.560.000.000 Bytes Containerlimit und
höchstens 2.048.000.000 Bytes tatsächlicher gemeinsamer Verbrauch.

## Quelle und Umfang sind jetzt frisch belegt

Im bisherigen Chat **„Hauptthread“** wurde die vollständige Inventur tatsächlich
erfolgreich ausgeführt: Pfade, Dateityp, Eigentümer, Rechte, Größen und alle
zwölf SHA256 stimmen. **242.570.240 Bytes insgesamt**, davon 242.548.460
Nutzbytes und 21.780 Kontrollbytes. Der Empfangsbericht hat jetzt ausdrücklich
gemessene 12.357 Bytes. Keine Ableitung aus einer bloßen Summenannahme mehr.
GPG ist vorhanden; am Quellabruf waren 2.084.634.624 Bytes frei.
[Frischer Primärbeleg](belege/w15-end500-transfer-20261029/SOURCE_INVENTORY.SAFE.json).

Die Veröffentlichung `66efb89a` in Draft-PR975 hat inzwischen erfolgreiche
[Pflicht-CI40772174428](https://github.com/ernisch/helmut-pilot/actions/runs/40772174428).
Der RAM-v3-Stand `0ed6b8d1` und diese Vorbereitung sind neuere Weiterarbeit;
die grüne CI wird nicht auf diese Änderungen umetikettiert. Der öffentliche
Code wird auf dem bestehenden Draft-PR-Branch gesichert; dessen neue Kopf-CI
ist gesondert zu prüfen. Private Daten und Schlüsselbackup bleiben lokal.

## Eindeutig festgelegter Empfänger

Neuer Empfänger dieses Codex-Cloudchats, RSA3072, 90 Tage Verschlüsselungsgültigkeit:

`7E3998A6C2CB948C69A2EE51F4267ABF26796EDC`

[Öffentlicher Schlüssel](belege/w15-end500-transfer-20261029/receiver-public.asc):
1.367 Bytes, SHA256
`3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443`.
Fingerprint und Bytes wurden unabhängig am öffentlichen Schlüssel geprüft.

Privater Schlüssel und zufällige Passphrase liegen ausschließlich außerhalb
des Repositorys unter
`/workspace/shared/helmut-w15-end500-receiver-20261029/`, Verzeichnisse0700,
Dateien0600, Eigentümer1000:1000, ohne Links. Der Schlüssel ist passphrasengeschützt;
die Passphrase wird GPG ausschließlich über einen offenen Dateideskriptor
übergeben. Keine Schlüssel- oder Passphrasenwerte in Git, Chat, Argumentlisten
oder Umgebungsvariablen. Lokale Entschlüsselung sowie Export/Import des
geschützten Schlüssels wurden mit einer Kontrollnachricht geprüft.

Für Verlust dieser Cloud ist eine **verschlüsselte Recovery-Kopie des neuen
Empfängerschlüssels samt dessen Passphrase** lokal vorbereitet. Sie ist nur an
den bereits vorhandenen Recovery-Empfänger verschlüsselt:

`DCFD605ED28EEACA9B826105E769DE07A68BA8E4`

Der öffentliche Recovery-Schlüssel wurde frisch anhand seines vollständigen
Fingerprints und SHA256 geprüft. Seine unabhängige Schlüsselwiederherstellung
und Kontrollnachrichtenentschlüsselung sind
[historisch positiv belegt](https://drive.google.com/file/d/1MKZY2BMltoqlo-YeD__05UypywupjkSY/view).
Das beweist keinen Restore eines W15-Archivs. Der neue Recovery-Wrapper wurde
noch nicht unabhängig außerhalb dieser Cloud entschlüsselt und noch nicht
hochgeladen. Sein geschützter innerer Schlüssel wurde lokal erfolgreich
wiederhergestellt. Keine alten privaten Schlüssel oder Passphrasen werden
hierher kopiert.

Die Recovery-Cipherdatei umfasst 3.298 Bytes, SHA256
`753b8bdaad77d992ee21d0099dd43614ab367403c97ba1213d6206aa7b959714`.
Der alte Recovery-Public-Key läuft am02.11.2026,03:48:56Istanbul ab. Der bereits
vorher erzeugte Wrapper bleibt mit dem erhaltenen privaten Schlüssel
entschlüsselbar. Keine automatische Schlüsselverlängerung oder Umstellung.

## Gewählter Weg nach dem einmaligen GO

**Quell-Codex-Cloud → bestehender privater HELMUT-Drive-Ordner → dieser
Codex-Cloudchat.** Eine direkte Verbindung zwischen den beiden Dateisystemen
ist nicht belegt; Drive bietet bereits Dateiablage und Rücklesezeuge.
Ordner: [HELMUT](https://drive.google.com/drive/folders/1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd).
Freigaben und Ordnerstruktur bleiben erhalten.

1. Zielseitig zuerst nur den öffentlichen Empfänger und die verschlüsselte
   Recovery-Kopie dort speichern. Beide Dateien vollständig cloudseitig
   zurücklesen und Größe/SHA bestätigen. Erst danach W15-Cipher hochladen.
2. Quellseitig die zwölf Dateipins erneut prüfen. Eine einzige private,
   bytegleiche Stagingkopie genau dieser Auswahl mit kurzen Dateinamen anlegen.
   Die vorhandene geprüfte Versiegelung benötigt eine gemeinsame private
   Eingabewurzel. Dadurch bleiben Originale, Rechte und die darin gespeicherten
   historischen Pfade unverändert; keine Sonderbehandlung der alten Verzeichnisse.
   Keine Hardlinks, Symlinks, Gesamtarchive oder übrigen Originalnutzdateien.
3. Das geschlossene Manifest an Transferkennung, Quelle, Planhash und obigen
   Empfänger binden. Mit bestehendem `seal.py` direkt Tar→GPG streamen; kein
   unverschlüsseltes Tar. Cipherausgabe liegt außerhalb der Eingabewurzel.
   Vor und nach dem Verpacken die Originalpins erhalten bestätigen.
4. Binären Cipher in **16-MiB-Teile** zerlegen, erwartet und maximal15Teile.
   Ganze Ciphergröße höchstens242.701.312Bytes. Für jeden Teil Index, Bytes,
   SHA256 und nach Upload die konkrete Drive-Datei-ID quittieren. Die Upload-
   API nutzt den absoluten lokalen Dateipfad, ausschließlich den festen
   privaten Ordner und Cipherdateien. Keine Klartextlogs oder öffentlichen
   Artefakte/Caches. Unbekannter Uploadausgang stoppt; kein blindes Neuhochladen.
5. Zielseitig jeden Teil über Drive-Metadaten und
   `fetch(download_raw_file=true,include_base64=false)` als authentifizierte
   Sedimentreferenz empfangen. `download_file` ist auf32MiB je Datei begrenzt;
   16MiB passt und ist im bisherigen Transport belegt. Keine Bearer-URL im
   Chat/Git. Teile vollständig hashprüfen, in Reihenfolge zusammenfügen und
   den Gesamthash gegen die Quellquittung prüfen.
6. Erst dann lokal mit dem neuen privaten Empfänger entschlüsseln. Der
   vorbereitete Empfänger akzeptiert genau zwölf normale Tar-Dateien mit
   vorab gebundenen Hashes, Kontext und Gesamtsumme. Links, PAX-/GNU-Sonderformen,
   Zusatzdateien, falsche EOFs oder GPG-Integritätsfehler werden abgewiesen.
   Alle zwölf privaten Ergebnisdateien werden nochmals vollständig von Platte
   hashgeprüft. Bound, Review und Empfangsmanifest werden gegeneinander geprüft.

Das Zielergebnis lautet höchstens
`PASS_SELECTED_INPUT_BYTES_DECRYPTED_START_BLOCKED`. Es ist weder eine
Datenbankrestore-Abnahme noch ein End500-PASS oder ein Test-GO.

## Dauerhafte Sicherung, Risiken und Rückweg

Die vollständig rückgelesenen Drive-Cipherteile **und** die verschlüsselte
Schlüssel-Recovery-Kopie bleiben dauerhaft in der bestehenden privaten Ablage.
Der bereits unabhängig geprüfte Recovery-Schlüssel ist der von dieser Cloud
unabhängige Wiederherstellungsanker. Eine lokale fsync-Quittung allein beweist
keine externe Sicherung. Neu erzeugter Wrapper und W15-Cipher sind heute noch
nicht hochgeladen; deren Remote-Rücksicherung bleibt ausdrücklich ausstehend.

Aktuelle Drive-Schreibfähigkeit und Upload-Größenobergrenze sind ohne erlaubten
Upload nicht frisch nachgewiesen. Es wird kein Probeupload vor GO ausgeführt.
Bei Berechtigungs-, Quoten- oder Größenfehlern stoppen; keine öffentliche
Ausweichablage, kein anderer Dienst und kein kostenpflichtiges Upgrade.
Die bestehende Ablage wird verwendet; zusätzliche Speicherbelegung liegt bei
rund243MB Cipher plus kleinen Metadaten und Schlüssel-Recovery, keine neue
kostenpflichtige Ressource wird bestellt.

Vor Beginn auf Quelle und Ziel jeweils mindestens1.400.000.000Bytes tatsächlich
frei bestätigen. Das budgetiert ausgewählte Stagingkopie, gesamten Cipher,
Cipherteile, Metadaten und mindestens512MiB zusätzliche Plattenreserve.
Die bekannte Quelle und das Ziel mit zuletzt rund31,95GB frei passen rechnerisch;
die unmittelbare frische Prüfung bleibt Pflicht. Keine Speicherbereinigung.

Alle zwölf Originale und bestehende Belege bleiben erhalten. Bei Fehlern bleiben
neue private Teilstände als unbestätigt liegen; keine Überschreibung, kein
Resume und keine automatische Löschung. Eine neue Quittung darf erst nach
vollständiger Prüfung entstehen. Bei Schlüsselverlust ist zuerst der neue
Empfänger aus dem verschlüsselten Wrapper mit dem vorhandenen Recovery-Schlüssel
wiederherzustellen. Ein ungeklärter Erstversuch erteilt keine zweite Transfer-
oder Exportfreigabe. An Production ist nichts zurückzurollen.

## Konkrete Freigabebindung

Transferkennung:
`w15-end500-20261029-26d5a4135ca7415ca41262fc45b561c8`.

[Plan](belege/w15-end500-transfer-20261029/TRANSFER_PLAN.SAFE.json), SHA256:
`84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5`.

[Manifestvorlage](belege/w15-end500-transfer-20261029/SEALED_MANIFEST_TEMPLATE.json),
2.150Bytes, SHA256
`af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f`.
Die technische Transfer-Run-ID ist keine GitHub-Actions-Run-ID und keine
End500-Ausführungsautorität. Plan und Fingerprint sind getrennt zu prüfen.

Eine Freigabe umfasst ausschließlich diesen einmaligen ausgewählten
Cloud→Drive→Cloud-Transfer einschließlich öffentlichem Empfänger und
verschlüsselter Empfängerschlüssel-Rücksicherung. Kein End500-/Mock500-Start,
Merge, Deployment, Profil- oder Production-Eingriff, kein GitHub-Secretwechsel
und kein Export alter privater Schlüssel.

## Parallel vorbereiteter Controller und gezielte Prüfung

`controller_context.py` bindet frische Laufpfade, Nonce, Run-ID/Versuch1,
19 geschlossene Quelldatei-Einstiegspins und RAM-v3. Es ruft keinen Controller
auf und ändert keine Originalmanifeste oder bestehenden Schutzfunktionen.
Eingangspfad-Portierung, Runtime-Beobachtung, vollständige Quellenabnahme,
Vorbereitung, unabhängiger Review, vollständige Sicherung und neues Test-GO
bleiben gesperrt. Kein fertiger GitHub-End500-Start wird behauptet.

13 Empfangsschutz- und7Kontextfälle bestanden. Eine kleine echte GPG-Probe mit
dem neuen Receiver und zwölf **erfundenen** Dateien/1.711Klartextbytes bestand;
0W15-Dateien,0Uploads. Ein dabei gefundener Agent-Anschlussfehler wurde behoben.
Agentabschlussfehler können keine PASS-Quittung schreiben. Unabhängiger Code-
und öffentlicher Schlüsselreview positiv. Noch keine Originaldaten empfangen.

[Gebundener Abschlussreview der Vorbereitung](belege/w15-end500-transfer-20261029/TRANSFER_PREPARATION_REVIEW.SAFE.json).
