# W15: nur den bestehenden7E-Empfänger prüfen

**Tatsächlich belegt:** Betreiber bestätigt beide Environment-Secrets. Genau
ein gebundener echter Prüflauf40855525798 auf`837b993a`, Versuch1, ist erfolgreich:
bestehender7E-Schlüssel importiert und öffentlicher Kontrolltext entschlüsselt.
Keine Werte oder privaten Dateien an den Agenten übertragen. Die Kontrolle
wird nicht wiederholt; der nächste Originalempfang importiert denselben
Schlüssel nur für seine eigentliche Datenentschlüsselung neu.
[SAFE-Laufbeleg](belege/w15-end500-transfer-20261029/RECEIVER_GITHUB_CONTROL.SAFE.json).

Dieser vorbereitete Prüfschritt importiert ausschließlich den bestehenden
geschützten7E-Export aus dem vorhandenen Wrapper und seine separate Passphrase.
Er öffnet weder DCF-Recovery noch Archivpassphrase oder Originale und erzeugt
keinen Schlüssel. Entwicklungstests verwenden nur erfundene Bytes und Mock-GPG.

Erst ein tatsächlich geschützter, unabhängig freigegebener GitHub-Environmentjob
darf die beiden dedizierten Environment-Secrets binden:
`HELMUT_W15_RECEIVER_PROTECTED_KEY_B64` und
`HELMUT_W15_RECEIVER_PASSPHRASE`. Werte gehören nicht in Chat, Workflowinputs,
Git, Logs oder Artefakte. Dieses Dokument fordert keine echten Werte an und
erteilt weder deren Bereitstellungs- noch Datenübertragungsfreigabe.

```sh
python3 -B scripts/w15-github/verify_receiver_key.py \
  --verify-existing-recipient-only --runner-temp "$RUNNER_TEMP" \
  --expected-commit "$EXPECTED_COMMIT"
```

Vor dem ersten privaten Input prüft die CLI Actions, den kanonischen Branch,
Run-ID, Versuch1, `GITHUB_SHA`, HEAD und die unveränderten Git-Blobs ihres Codes,
von `verify_archive_key.py` und `prepare.py`. Andere Parameter für Schlüssel,
Passphrase, Fingerprint oder Aktionen werden nicht akzeptiert. Beide dedizierten
Werte werden vor GPG aus der Laufzeitumgebung entfernt. Kinder erhalten nur eine
feste kleine Umgebung; die Passphrase gelangt ausschließlich über einen FD an GPG.
Das gilt für Import und Kontrollentschlüsselung; GnuPG2.4 kann die Passphrase
bereits bei der Umwandlung des geschützten Secretkeys ins Agentformat benötigen.

Im unveränderten Runner-Temp wird ein neuer exklusiver0700-Privatbaum mit
frischem0700-GNUPGHOME angelegt. Import, Secret-/Publiclisting, Verschlüsselung
und Entschlüsselung verwenden vorhandene GPG-Helfer, private0600-Logs und
abgeschalteten Dirmngr/automatischen Schlüsselabruf. Genau ein Primary muss
`7E3998A6C2CB948C69A2EE51F4267ABF26796EDC` entsprechen. Ein fester öffentlicher
Kontrolltext wird für dessen importierte öffentliche Komponente verschlüsselt
und mit der separaten Passphrase wieder entschlüsselt und exakt verglichen.
Es wird nichts überschrieben, exportiert, hochgeladen oder entfernt. Nur der
frische eigene GPG-Agent wird danach beendet; unbestätigter Abschluss sperrt PASS.

Die Ausgabe enthält ausschließlich feste SAFE-Skalarwerte, den bereits
öffentlichen Fingerprint und die öffentliche Laufbindung. Keine Keybytes,
Passphrases, Geheimnishashes, privaten Pfade oder GPG-Rohfehler werden ausgegeben.
Private GNUPGHOME-/Logdateien bleiben privat und dürfen weder als Artefakt noch
Cache veröffentlicht werden.

`PASS_EXISTING_RECIPIENT_CONTROL_ONLY_START_BLOCKED` beweist ausschließlich die
Entschlüsselungsfähigkeit des bestehenden Empfängers für diesen öffentlichen
Kontrolltext in diesem isolierten Lauf. Datenzugang, Originalentschlüsselung,
Restore, RAM-/Backupabnahme und End500-/Mock500-Start bleiben unbestätigt und
gesperrt. Der erfolgreiche Parentnachweis40847487765 wird dafür nicht wiederholt.

## Offline den bestehenden Wrapper öffnen

Der Betreiber verwendet einen Mac und besitzt bislang nur die bestandene
Browserprüfung und deren SAFE-Beleg. Die alte HTML speichert ausdrücklich
keinen DCF-Export. Deshalb wird keine vorhandene Schlüsseldatei oder lokale
GPG-Installation vorausgesetzt.

`build_receiver_browser.py` erzeugt aus der unveränderten alten Offline-HTML,
deren vorhandener OpenPGP.js6.3.2-Bibliothek und dem gepinnten3298Byte-Wrapper
eine neue private einzelne HTML. Originalprogramm, CSP-Hashes, DCF-Cipher-/
Exporthash/Fingerprint sowie Wrapperhash werden vor dem Bau geprüft. Vendor,
LGPL-Lizenz und Styles bleiben bytegleich; neue Anwendung ist
`receiver-browser.js`. Vendor und verschlüsselte Sicherungen werden nicht
zusätzlich in Git eingecheckt.

```sh
python3 -B scripts/w15-github/build_receiver_browser.py \
  --original-html /privat/bisherige-offline-pruefung.html \
  --wrapper-file /privat/receiver-wrapper.pgp \
  --output-html /privat/NEUE-empfaenger-offline.html
```

Eingänge und Ausgabe sind beim Builder privat600/Eltern700, ohne Links; die
Ausgabe wird nur neu angelegt. Das geprüfte Artefakt umfasst419157Bytes.
Es ist ausschließlich als lokale`file:`-Datei benutzbar. CSP verbietet Netzwerk,
Formularabgabe, fremde Skripte, Frames und Worker. Es gibt keine Storage- oder
Clipboard-API und keine Anzeige privater Werte.

Die Archivpassphrase wird nur auf dem Mac in diese lokale HTML eingegeben.
DCF wird aus derselben vorhandenen Sicherung wieder in den Arbeitsspeicher
geladen, weil die alte Browserprüfung ihn nicht gespeichert hat. Die alte
Kontrollnachricht wird nicht erneut geprüft. Anschließend öffnet die Anwendung
den gepinnten Wrapper, prüft Schema/Version, beide Base64-Felder, die7E-Identität
und einen festen öffentlichen Kontrolltext. Binärer und ASCII-armierter
geschützter Export sind unterstützt. Es werden keine Schlüssel erzeugt und
keine Originale entschlüsselt.

Erst danach werden lokale Downloads für genau zwei private Textdateien ohne
zusätzliches Zeilenende angeboten:

- `HELMUT_W15_RECEIVER_PROTECTED_KEY_B64.PRIVATE.txt`
- `HELMUT_W15_RECEIVER_PASSPHRASE.PRIVATE.txt`

Ihre Inhalte gehören ausschließlich in die gleichnamigen Environment-Secrets
des bereits geprüften`helmut-ci-originals`, nicht in Chat, Git oder Artefakte.
Archivpassphrase und DCF werden nicht exportiert. Private Bytepuffer und
Schlüsselparameter werden im Abschluss geleert; neuer Start oder Fensterschluss
widerruft die Download-URLs. Eine garantierte RAM-Löschung von JavaScriptstrings
wird nicht behauptet. Ein zusätzlicher SAFE-Beleg enthält nur öffentliche
Kontroll-/Scopefelder. Der GitHub-Modus`end500-receiver-check` prüft danach
ausschließlich diesen bestehenden Empfänger; der vollständige Lauf bleibt gesperrt.
