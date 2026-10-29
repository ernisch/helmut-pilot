# W15: vorhandene Originaleingänge einmalig empfangen

`receive_existing_inputs.py` verbindet ausschließlich die bestehenden15
Cipherteile mit den vorhandenen `receive.receive`- und
`input_port.verify_received`-Prüfern. Kein Controller, keine Datenbank und kein
End500-/Mock500-Lauf werden gestartet. Die erfolgreiche Empfängerkontrolle wird
nicht wiederholt; derselbe bestehende Schlüssel wird für die notwendige
Datenentschlüsselung in einem frischen privaten GPG-Home importiert.

```sh
python3 -B scripts/w15-github/receive_existing_inputs.py \
  --receive-existing-inputs-only --expected-commit "$EXPECTED_COMMIT" \
  --runner-temp "$RUNNER_TEMP"
```

Vor privaten Inputs werden Actions/Branch/Run/Versuch1, HEAD und die vollständige
öffentliche Quellenliste gegen rohe Git-Blobs geprüft. Die zwei bestehenden
Empfängersecrets bleiben unverändert; hinzu kommt ausschließlich
`HELMUT_W15_CIPHER_URL_INDEX` im bereits geschützten Environment. Alle drei
Environmentwerte werden vor GPG/HTTP aus der Prozessumgebung entfernt. Kinder
erhalten nur eine feste secretfreie Umgebung. Keine URLs, Werte, privaten Pfade
oder Geheimnishashes erscheinen in Argumenten, öffentlichen Berichten oder Logs.

Der kurzlebige Index enthält exakt `schema`, `expectedCommit`, `createdAtUTC`,
`expiresAtUTC`, `parts`; Schema ist`helmut-w15-private-cipher-url-index/1`.
Die15 Einträge enthalten nur `index` und `url`, strikt geordnet1–15.
UTC-Erstellung darf höchstens60s vorausliegen und30min alt sein; Ablauf liegt
nach Erstellung, spätestens30min danach und weiterhin in der Zukunft. Index
unter49152UTF8-Bytes, einzelne URL höchstens4096ASCII-Zeichen. Nur HTTPS zu
`[a-z0-9-]+.oaiusercontent.com`, Standardport/443, keine Authkomponente,
Fragmente, Steuer-/Leerzeichen oder doppelte URL werden akzeptiert.

Vor Netzwerkzugriff verlangt der neue0700-Privatbaum mindestens1GiB freien
Speicher; das ist keine vollständige Restore-/WAL-/Backupkapazitätsabnahme.
HTTP verwendet ausschließlich GET, bestehende Standardproxy-/TLS-Prüfung und
keine Redirects. Kein Retry oder Resume. Während der HTTP-Streamverarbeitung
gelten60s-Teil-/300s-Gesamtprüfdeadlines. Diese werden vor und nach jedem
Bodyread geprüft; beim blockierenden Connect-/Headerlesen gilt zunächst der
Socket-Inaktivitätstimeout. Ein solches Hängen kann den Fehlerabschluss verzögern,
ergibt aber keine Annahme eines verspäteten HTTP-Streams. Abschließendes
Dateirücklesen und GPG liegen danach separat. Harte Ausführungsgrenze ist der
10-Minuten-Job, kein zusätzlich behaupteter300s-Wallclock-Kill der gesamten CLI.
1MiB-Streams prüfen alle unveränderten Teilpins und den
Gesamtpin242693044Bytes/SHA256`eeec60f6f97f35b143f9fca22fae653ea9c8695a23d712c9fc74c1979e410231`.
Teildateien und zusammengesetzter Cipher werden exklusiv0600 angelegt und
vollständig zurückgelesen. Index, GPG-Home, Passphrasendatei und sämtliche
Teilprodukte bleiben privat; kein Artefakt-/Cacheupload oder Löschen.

Der authentifizierte innere Transferkontext bleibt unverändert:
Sourcecommit`66efb89a42e3d1bee739844ac32a258d79b38ebb`, Run`20261029010443`,
Inputmanifest`84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5`,
7E-Empfänger und versiegeltes Manifest
`af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f`.
Der neue Consumercheckout und neue Actionsrun werden davon getrennt gebunden.
Nur tatsächliche authentifizierte Entschlüsselung und vollständige Relokation
ergeben12 geprüfte Dateien/242570240Bytes. Der eigene GPG-Agent muss schließen.

Erfolg heißt ausschließlich
`PASS_EXISTING12_RECEIVED_AND_RELOCATED_ONLY_START_BLOCKED`. Restore, DB,
vollständiger Parent-/RAM-Nachweis, Backup und End500 bleiben offen und gesperrt.
Fehler nennen nur eine feste Phase, erhalten private Teilprodukte und erlauben
keinen automatischen Wiederanlauf. Entwicklungsprüfungen verwenden ausschließlich
Fakebytes, Mock-HTTP und Mock-GPG; kein neuer Originalempfang wird daraus behauptet.

## Tatsächliche Abrufgrenze und kleinster Berechtigungsschritt

Neue gezielte Gegenprobe vom29.10.2026: Betreiber bestätigt den erneuerten
feingranularen Token mit `Environments: Read and write`, Actions und
Administration für dieses Repository. Der geerbte `GH_TOKEN` ist vorhanden
und ungleich der HELMUT-Bindung. Für genau einen GET des festen
Environment-Public-Key-Endpunkts wurde `GH_TOKEN` ausdrücklich mit
`HELMUT_GITHUB_CI_ADMIN_TOKEN` ersetzt und `GITHUB_TOKEN` entfernt;
CLI-Host`github.com`, keine gespeicherte Anmeldung kann diesen Wert verdrängen.
Ergebnis403/`Resource not accessible by integration`, benötigte Berechtigung
laut GitHub-Antwort`environments=read`. `/user` mit derselben Bindung ergibt
200/Konto`ernisch`. Bereits die frühere Python-Anfrage setzte ihren Bearer direkt
aus der HELMUT-Bindung; die CLI-Priorität erklärt somit keinen der beiden403.
Die Kontokennung unterscheidet keine einzelnen Tokens. Eine konkrete falsche
Tokenkopie, ein Laufzeitbindungsfehler oder eine abweichende effektive GitHub-
Berechtigung lässt sich mit diesen Antworten nicht sicher unterscheiden.
Kein weiterer gleicher Versuch und kein Secretwrite.
[Geschlossener Befund ohne Geheimwerte](belege/w15-end500-transfer-20261029/GITHUB_TOKEN_BOUND_PROBE.SAFE.json).

Einzige manuelle Handlung: Die Secretbindung
`HELMUT_GITHUB_CI_ADMIN_TOKEN` in `Helmut main` auf genau den bereits
berechtigten feingranularen Token aktualisieren und als frische Laufzeitbindung
übernehmen. Keine zusätzliche Rechteausweitung oder neue Infrastruktur.
Der folgende frühere Berechtigungsbefund bleibt historisch erhalten.

Die vorhandenen15Drive-Cipherdateien wurden frisch als ausschließlich
eigentümerberechtigt mit unveränderten Größen/MIME-Typen beobachtet. Der
Connector stellt lesende objektgebundene Dateifähigkeiten bereit (`sp=r`,
`sr=b`), deren beobachtete Gültigkeit aber nur ungefähr fünf Minuten beträgt.
Ein manueller Copy-/Queue-/Downloadweg wäre damit unzuverlässig. Es wurde
deshalb noch kein privater Index an den Betreiber ausgegeben und kein
Originalempfang gestartet. Die Source-/Empfängerprüfung bleibt erhalten.

Der bestehende CI-Admin-Zugang antwortet auf eine einzige Kontometadatenabfrage
mit Benutzer`ernisch`; seine Tokenart wird daraus nicht sicher abgeleitet.
Die offizielle GitHub-REST-Dokumentation verlangt für das Schreiben eines
Environment-Secrets bei feingranularen Zugängen die Repositoryberechtigung
`Environments: write`. Der bekannte403 wird ohne tatsächliche Änderung der
Berechtigung nicht erneut geprüft.

Nach einem passenden Berechtigungsschritt wird ein frischer privater Index
0700/0600 erstellt, validiert und ausschließlich mit dem vorhandenen GitHub-CLI
in das fest benannte neue Secret geschrieben. Sein Wert geht über stdin und
wird vom CLI mit dem Environment-Public-Key verschlüsselt; keine URL wird
in Kommandoargumente, Chat, Git oder öffentliche Artefakte kopiert:

```sh
GH_TOKEN="$HELMUT_GITHUB_CI_ADMIN_TOKEN" gh secret set HELMUT_W15_CIPHER_URL_INDEX \
  --repo ernisch/helmut-pilot --env helmut-ci-originals < /privat/CIPHER_INDEX.PRIVATE.json
```

Danach folgt sofort der unverändert gebundene Empfangsmodus am überprüften
Kopf. Die beiden bestehenden Empfängersecrets und alle anderen Secrets bleiben
unverändert. Keine Drive-Freigabe, neue Tokenwerte, Anbieteranmeldung oder
öffentliche Ablage wird für diesen Weg verlangt. Falls die vorhandene Tokenart
diesen Berechtigungsschritt nicht unterstützt, ist diese konkrete manuelle
Grenze zu klären; keine weitere technische Umgehung.

[GitHub: Create or update an environment secret](https://docs.github.com/en/rest/actions/secrets#create-or-update-an-environment-secret).
