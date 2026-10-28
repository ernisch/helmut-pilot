# W15 nach Transfer-GO: Empfänger gesichert, Quellstart erforderlich

**Stand 29.10.2026, Europe/Istanbul.** Der Betreiber hat in diesem Thread den
einmaligen verschlüsselten Transfer einschließlich Empfängerrücksicherung
ausdrücklich freigegeben. Das GO gilt für den unveränderten
[gebundenen Plan](belege/w15-end500-transfer-20261029/TRANSFER_PLAN.SAFE.json),
SHA256 `84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5`.
Keine erneute Transferfreigabe erforderlich. End500 und Mock500 brauchen weiterhin
ihr eigenes GO; Merge, Deployment, Production und Datenlöschung bleiben gesperrt.

## Tatsächlich abgeschlossen

Empfänger: `7E3998A6C2CB948C69A2EE51F4267ABF26796EDC`.
Privater Schlüssel und Passphrase bleiben geschützt außerhalb des Repositorys.
Die beiden folgenden Dateien wurden nach GO in den bestehenden privaten
[HELMUT-Ordner](https://drive.google.com/drive/folders/1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd)
hochgeladen und vollständig durch den authentifizierten Drive-Abruf zurückgelesen.
Beide tatsächlichen Bytezahlen und SHA256 stimmen:

| Datei | Drive-ID | Bytes | SHA256 |
| --- | --- | ---: | --- |
| Öffentlicher Empfänger | `1D-Mycf7lZ42kCQdfSC9GAKMOA9HLR_PV` | 1.367 | `3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443` |
| Verschlüsseltes Backup des neuen Empfängerschlüssels samt Passphrase | `1QqKoON859fDE-iwvk3nErSZnN68Tkz8C` | 3.298 | `753b8bdaad77d992ee21d0099dd43614ab367403c97ba1213d6206aa7b959714` |

Ordner und Recovery-Cipher sind nicht geteilt; die Recovery-Datei hat allein die
Owner-Berechtigung. Keine Freigaben geändert. Das Backup ist ausschließlich an
den bestehenden unabhängigen Recovery-Empfänger
`DCFD605ED28EEACA9B826105E769DE07A68BA8E4` verschlüsselt.
Dies bestätigt entfernte Cipherbytes, nicht die bisher ausstehende externe
Entschlüsselung des neuen Wrappers. Die historische Recovery-Kontrollprüfung
und die lokale Wiederherstellung des geschützten inneren Schlüssels bleiben
getrennte Belege.

[Rücklesequittung](belege/w15-end500-transfer-20261029/RECIPIENT_CLOUD_READBACK.SAFE.json):
1.360 Bytes, SHA256
`5987ef39b60f4d3c0b407a456352260a61a5d5fc6fef03520e4132e884c0aa4a`.
Keine W15-Nutzdatei wurde bisher hierher übertragen. Kein alter privater Schlüssel
oder dessen Passphrase wurde kopiert.

## Konkrete technische Grenze und ausführbarer Quellschritt

Die zwölf Originale liegen ausschließlich in der Cloud des Chats **„Hauptthread“**
(`01a17c84-6676-71ca-ab08-d63e6e5cf05c`, Host `durable`). Dessen letzte Inventur
bestätigt alle zwölf Dateien und 242.570.240 Bytes. Der hier ausgeführte
Inventurhelfer endet dagegen ausdrücklich `SOURCE_UNAVAILABLE`.

Die tatsächlich verfügbaren Codex-App-Werkzeuge können diesen alten Chat lesen
und seinen Status abfragen. Sie bieten hier keinen Nachrichten-, Fortsetzungs-
oder Befehlsstart. Auch kein Browser-Steuerwerkzeug ist verfügbar. Es wurde
kein privater Ersatzkanal eingerichtet. Deshalb kann dieser Chat den bereits
freigegebenen Export nicht selbst in der anderen Cloud starten.

Der folgende Auftrag ist für **„Hauptthread“** vorbereitet. Nur dieser
Auftragstext muss dort ausgelöst werden; keine Nutzdatei läuft über den Mac:

> Der Betreiber hat im nachfolgenden W15-GitHub-Thread den einmaligen Transfer
> gemäß Plan-SHA256
> `84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5`
> einschließlich Empfängerschlüssel-Rücksicherung ausdrücklich mit „Ja!!!“
> freigegeben. Führe ausschließlich den quellseitigen Teil dieses Plans aus.
> Lies den aktuellen öffentlichen Kopf von Draft-PR975 und pinne dessen vollen
> Commit, bevor du Code ausführst. Bestehende lokale Änderungen erhalten;
> relevante Prozesse zuerst prüfen. Den öffentlichen Hilfscode bei Bedarf in
> einem getrennten frischen Worktree verwenden. Keine alten Arbeitsdateien
> überschreiben und keine historischen Tests wiederholen.
>
> Prüfe vor dem Start zusätzlich den SHA256 von
> `scripts/w15-github/source_transfer.py`:
> `c1a644ee2d5fa99d407746d07400eaf5c6e5b7a991c56c4bbb0302bb8dfd8832`,
> und der oben verlinkten Cloud-Rücklesequittung:
> `5987ef39b60f4d3c0b407a456352260a61a5d5fc6fef03520e4132e884c0aa4a`.
> Der Helfer prüft außerdem selbst den unveränderten Plan, die Manifestvorlage,
> den Quellauftrag und alle bisherigen Transfer-Codepins. Die historische
> `transferAllowed=false`-Inventur wird nicht verändert; die aktuelle konkrete
> Freigabe ist davon getrennt.
>
> Starte dann genau einmal:
>
> ```sh
> python3 -B scripts/w15-github/source_transfer.py --export-once \
>   --approved-plan-sha256 84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5
> ```
>
> Der Helfer prüft die zwölf Originale frisch, verlangt mindestens
> 1.400.000.000 Bytes freie Platte und erzeugt genau eine private bytegleiche
> Auswahlkopie in der planfesten neuen Wurzel. Er streamt vorhandenes `seal.py`
> ohne Klartext-Tar und teilt den Cipher in höchstens 15 Teile à 16 MiB.
> Er erhält alle Originale und schreibt ganze/Teilhashes in
> `cipher/SOURCE_SEAL_RECEIPT.SAFE.json`. Er lädt selbst nichts hoch.
>
> Nur bei vollständigem PASS jeden Cipherteil genau einmal mit dem bestehenden
> Drive-Uploadwerkzeug in Ordner `1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd` hochladen.
> Anschließend pro Teil Index, Bytes, SHA256 und konkrete Drive-ID quittieren;
> die vollständige Quellquittung bereitstellen. Keine Klartextdateien, weiteren
> Archive, alten privaten Schlüssel oder ungebundenen Dateiauswahlen übertragen.
> Keine signierten Download-URLs, privaten Rohlogs oder Inhalte ausgeben.
> Bei Pin-, Platz-, Rechte-, Größenfehlern oder unklarem Uploadausgang stoppen.
> Kein blinder zweiter Upload, kein Resume, kein Überschreiben und keine Löschung.
> Keine Datenbankaktion, End500-/Mock500-Ausführung, Profiländerung, Merge,
> Deployment, Production- oder kostenpflichtige Aktion.

Der Quellhelfer ist für diese Freigabe vorbereitet und mit zehn kleinen fiktiven
Kopier-/Teilungsfällen geprüft. Seine echte Ausführung auf den zwölf Originalen
ist noch nicht erfolgt. Neue Hilfsdatei und Rücklesequittung sind zusätzlich an
ihre obigen Hashes und den veröffentlichten PR-Kopf gebunden; die fünf Codepins
des ursprünglichen Transferplans bleiben unverändert.

Nach Vorliegen der Quellquittung empfängt dieser Chat die Cipherteile, prüft sie
einzeln und insgesamt und verwendet den vorhandenen geprüften `receive.py`.
Höchstes Ergebnis bleibt `PASS_SELECTED_INPUT_BYTES_DECRYPTED_START_BLOCKED`.
Ein erfolgreicher Transfer erteilt keine GitHub-Datenbereitstellungs- oder
End500-Ausführungsfreigabe.

## Unabhängig vorbereitete Entwicklungsanschlüsse

`input_port.py` prüft den später empfangenen Baum einschließlich Manifest,
Kontext und Quittung. Es erhält sämtliche historischen Originalpfade und
löst ausschließlich ein genau passendes Originalpfad-/Größe-/SHA-Triple auf
die erneut geprüfte private Empfangsdatei. Neun bereits öffentliche historische
Berichte sind nach festen Pins zugeordnet; kein erneuter Transfer dieser
Berichte und keine neue historische Startautorität. Neun fiktive Schutzfälle
bestanden, ebenso die bytegenaue Prüfung dieser neun vorhandenen Git-Berichte.

`backup_contract.py` bindet zwölf Eingänge, 14 konkrete Abschluss-/DB-Kategorien
und eine separat zu erfassende vollständige eingefrorene Inventur an das
bestehende Seal-Format. Sein Befehlsplan verlangt lokalen vollständigen
`pg_dump` und Rollenexport nach tatsächlichem Writer-Abschluss, während die
ursprüngliche gemeinsame cgroup-Messung weiterläuft. Neun fiktive Fälle bestanden.
Eine passende Dateiliste ist keine tatsächliche Sammlung, konsistenter Export,
Restore oder entfernte Rücklesung; vollständige Backup-Akzeptanz bleibt false.
Die drei neuen Helfer wurden unabhängig im begrenzten Umfang geprüft.

**Der vollständige GitHub-End500 ist weiterhin nicht ausführbar vorbereitet.**
Offen sind die zwölf tatsächlichen Empfangsdateien, der formale Anschluss der
absoluten Controller-/Auditor-Lesezugriffe, frische Quellen- und Laufqualifikation,
konkrete Runner-/Image-/Setup-/Plattenmessung und die vollständige
Abschlussintegration. Der vorhandene Controller beendet die RAM-Messung bisher
vor einem noch fehlenden finalen DB-/Rollenexport. Dieser Export und ein echter
Restore-/Remote-Nachweis dürfen nicht durch einen reinen Plan ersetzt werden.

RAM-v3 bleibt unverändert: Container 2.560.000.000 Bytes, Lebenszeitpeak höchstens
2.048.000.000 Bytes, Reserve 512.000.000 Bytes, Swap0. Auth30, Unit60,
Provider20, vollständige Integrität und alle historischen Ergebnisse bleiben
erhalten. Keine Optimierung, neuen Ressourcen oder Gesamtversuche.

[Gezielter Integrationsbeleg nach dem GO](belege/w15-end500-transfer-20261029/POST_GO_INTEGRATION.SAFE.json).
