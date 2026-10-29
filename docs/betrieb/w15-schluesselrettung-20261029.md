# W15: Offline-Recovery belegt, geschützter Übergabekanal offen

Stand29.10.2026. Hetzner ist laut Betreiber endgültig gelöscht und ausgeschlossen.
Es wurde keine Verbindung dorthin aufgebaut. Kein neuer Empfänger, Originaltransfer,
End500-/Mock500-Gesamtlauf oder Production-Eingriff.

## Belegter kürzester Rettungsweg

Die bestehende private Drive-Ablage enthält `HELMUT_GPG_KEY.pgp`,569Bytes,
Datei-ID `1vr542BL3avsxWj_U3KjIUGaY8IY3PmBy`. Derselbe Cipher ist vollständig
im vorhandenen Offline-Prüfprogramm `HELMUT_OFFLINE_SCHLUESSELPRUEFUNG_20261027.html`
enthalten. Cipher-SHA256:
`1d7c25d1041fdc91da2151f28cb15ca6d7944fc66107e7c236787c2fd62b77f5`.

Die statisch geprüfte Konfiguration bindet diesen Cipher an einen privaten
Recovery-Schlüsselexport, dessen Hash, Fingerprint
`DCFD605ED28EEACA9B826105E769DE07A68BA8E4` und eine Kontrollnachricht mit eigenem
Klartexthash. Eine unabhängige erfolgreiche Recovery-Kontrollprüfung ist vom
27.10. historisch belegt. Der neu hochgeladene1338Byte-Prüfbeleg bestätigt
zusätzlich die erfolgreiche Offline-Wiederherstellung beim Betreiber am29.10.:
alle fünf Checks wahr, Sicherungs-/Exporthash/Fingerprint/Challenge-ID passen.
Die kanonische Kontrollantwort einschließlich Zeilenende stimmt mit dem zuvor
gebundenen Klartexthash überein. In dieser Cloud wurde kein Schlüssel entschlüsselt.
[Neue Belegprüfung](belege/w15-end500-transfer-20261029/OFFLINE_PROOF_VERIFIED.SAFE.json).

Das äußere Backup ist passphrasebasiert: OpenPGP-SKESK v4, AES256, iterierter
gesalzener SHA512-S2K und integritätsgeschütztes Datenpaket. Es benötigt zum
Öffnen keinen weiteren privaten GPG-Schlüssel. Damit gibt es eine konkrete
Sicherung, die mit der vorhandenen Bitwarden-Archivpassphrase offline erfolgreich
entschlüsselt wurde. Der Beleg enthält keine Passphrase und keinen privaten Schlüssel.
Ein Passwort ersetzt keinen fehlenden privaten Schlüssel; hier könnte es aber
den bereits gesicherten Schlüssel entsperren.

Nach erfolgreicher Probe: DCFD605… wiederherstellen → vorhandenen3.298Byte-
Empfängerwrapper öffnen → bisherigen7E3998…-Empfänger vollständig prüfen →
vorhandene15 W15-Cipherteile weiterverwenden. Der alte Recovery-Schlüssel muss
dafür weder neu erzeugt noch nach GitHub kopiert werden. Ein neuer Empfänger
oder erneute Verschlüsselung der zwölf Originale ist dafür unnötig.
Scheitert die Zuordnung und fehlt ein weiterer rettbarer Bestand, wäre erst
dann ein neuer unabhängig rückgesicherter Empfänger und ein konkret erneut
freizugebender Quellverschlüsselungs-/Transferauftrag vorzubereiten.

## Zuerst den geschützten Übergabekanal nachweisen

Die frühere pauschale Empfehlung, sofort ein Archivpassphrasen-Secret zu
hinterlegen, war nicht durch einen tatsächlich nachgewiesenen lokalen Kanal
gedeckt. Aktuell gibt es neun domaingebundene API-Secret-Anbindungen, aber keine
belegte lokale Secretdatei oder direkte GPG-Bereitstellung. Der Betreiber hat
eine frühere Secret-Hinterlegung nicht abgelehnt; er meldete deren Fehlen.
Verbindlich bleibt: keine Passphrase im Chat und den Übergabeweg zuerst klären.

Vor echten Daten zunächst ausschließlich den öffentlichen Prüfwert aus dem
[konkreten Übergabeplan](w15-empfaenger-uebergabekanal-20261029.md) verwenden.
Konfigurationstyp und aktuelle Schutz-/Bereitschaftsmetadaten müssen zu dem
in diesem selben Lauf beobachteten Klartext-Prüfwert passen. Ein API-Platzhalter
oder eine normale ungeschützte Laufzeitvariable genügt nicht. Der Test selbst
erteilt keine Schutz- oder Übermittlungsfreigabe. Keine echten Geheimnisse
hinterlegen, solange diese Bindungen fehlen.

Die Variante mit geringstem Zugriff hält Archivpassphrase und DCF offline,
öffnet dort nur den vorhandenen7E-Wrapper und übergibt ausschließlich dessen
geschützten Empfängerexport samt separater Passphrase. Das bisherige Offline-
Prüfprogramm öffnet den7E-Wrapper noch nicht; es liefert ausschließlich den
DCF-Prüfbeleg. Der konkrete Wiederherstellungsschritt folgt nach Kanalnachweis.

Vorhandener alternativer lokaler Prüfhelfer, ausschließlich nach belegtem Kanal
und passend geklärter echter Secretbereitstellung; derzeit nicht ausführen:

```sh
python3 -B scripts/w15-github/verify_archive_key.py --verify-archive-key-only \
  --evidence-root /workspace/shared/helmut-w15-recipient-recovery-20261029/evidence
```

Der Helfer bindet zuerst beide Ciphergrößen/-hashes. Die Passphrase erreicht
GPG ausschließlich über einen Dateideskriptor; Child-Umgebung und Argumente
enthalten sie nicht. Neues exklusives privates GPG-Home, Exporthash, Fingerprint
und echte Kontrollentschlüsselung müssen alle passen. Systemprogramme werden
fest unter `/usr/bin:/bin` ausgewählt. Nur feste SAFE-Ergebnisse gelangen auf
stdout; private Teilprodukte und Diagnosen bleiben0600 erhalten. Kein Retry,
keine Löschung, kein Zugriff auf ein bestehendes GPG-Home.

`PASS_RECOVERY_KEY_AND_PINNED_CONTROL_ONLY` bestätigt ausschließlich DCFD605…
und die Kontrollnachricht. Der7E3998…-Wrapper muss danach separat geöffnet
und überprüft werden; keine vorweggenommene Empfänger-/Archiv-/DB-/500er-Abnahme.

## Tatsächlich erledigt und aktuelle Grenze

Die verschlüsselten569/467Byte-Eingänge sind lokal ausschließlich als private
Prüfkopien vorhanden. Die echte Ausführung von `--check-inputs-only` bestätigt
beide Pins ohne Secretzugriff. Die HTML-/JS-Datei wurde nicht ausgeführt.
Lokale gezielte Dateinamensuche fand keinen privaten Schlüsselbestand; andere
Codex-Dateisysteme konnten über die nicht antwortenden App-Lesezeuge nicht
bestätigt werden. Daraus wird kein globaler Schlüsselverlust abgeleitet.

Fünf neue synthetische Recovery-Prüfungen mit echtem GPG bestanden: tatsächliche
Schlüssel-/Kontrollwiederherstellung, falsche Passphrase, Hashabweichungen,
fehlender Secretzugriff und manipuliertes PATH-Präfix. Unabhängiger lesender
Sicherheitsreview bestanden. Kein Test mit der echten Bitwarden-Passphrase.

Unabhängig ergänzt: vorhandene Kontextvalidierung als begrenztes stdin-CLI
`controller_context.py --validate-context-only`, vier neue gezielte Fälle
bestanden. Es startet oder bindet keinen Controller; Bereitschaft bleibt BLOCKED.
RAM-Vertrag unverändert: gemeinsamer Parent/Container2.560.000.000Bytes,
Gesamtpeak höchstens2.048.000.000Bytes, Reserve512.000.000Bytes, Swap0.
Historische Ergebnisse unverändert. Private Datenbereitstellung an GitHub,
frischer Runneranschluss, vollständiger Restore und Gesamttest bleiben separat.

[Geschlossener öffentlicher Befund](belege/w15-end500-transfer-20261029/RECOVERY_CANDIDATE.SAFE.json).
