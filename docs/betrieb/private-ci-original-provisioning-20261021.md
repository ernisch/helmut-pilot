# Private Originalbindungen für CI vorbereiten

**Stand 22.10.2026 Europe/Istanbul. GitHub-Pflicht-CI bleibt blockiert; kein
geschützter Original-CI-Lauf. Kein Production/Merge/Voll500, keine
Profilaktivierung; alle alten GOs sind verbraucht.**

## Originalrestore: geprüft, aber nicht vollständig

15 Cipherteile und der Gesamtcipherhash wurden unabhängig geprüft; entschlüsselt
wurde ausschließlich im Ziel. Danach wurden 13.527 ausgewählte Dateien einzeln
geprüft. Alle 83 bisherigen CI-Originale und 24 exakte Git-Patches sind
vorhanden. 7.370 Dateien wurden explizit ausgeschlossen. Physische
Datenbankkopien und das volle Git-Bundle wurden nicht übertragen; die Quelle bleibt
erhalten. Es wurde kein Patch angewendet. Eine vollständige Umgebung ist damit
nicht belegt.

## Manifest: 84 echte Dateien, nur Metadaten in Git

Bisheriges Manifest: 83 Dateien, 83.490.369B, SHA256
`49c2d5f6f66baf5a693377b82a73e3849319fd484797be71a46faf1cec892655`. Eine
echte Quellenfreigabe für den korrigierten Controlread-Test verlangt einen weiteren
Originalpfad:

`/workspace/helmut-ram-fix-20261020/next-full500-20261021/v12-local-lock-lease-integration/INDEPENDENT_COMBINED_SOURCE_REVIEW_ORIGINAL.SAFE.json`
– 6.151B, SHA256
`e7efec6b916aa3f01fe755f3e89566e6c2801e928d5e3484fe9cb053e749c6a8`,
tatsächlich restauriert. Die Quelle ist im verifizierten Manifest als
`NO_FINDINGS_WITHIN_RECORDED_SCOPE` markiert; ein zusätzlicher begrenzter
Credentialscan fand 0 Befunde und 0 unklare Kandidaten. Die Bytes bleiben
privat.

Neues Manifest: 84 Dateien, 83.496.520B, SHA256
`b2e3584818b16fed2f4bfd845f9379732d9f9eb045c83f59ad94034d9e6c46ef`. Die
bisherigen 83 Einträge sind byteidentisch unverändert, keine Mocks. Nur
Metadaten liegen in Git. Die 26 Harnessvorlagen mit 127.973B sind unverändert;
die übrigen 58 Dateien umfassen 83.368.547B.

## Öffentliche Begleitdateien unverändert

Die bestehenden öffentlichen `ROOT_LOCAL_SOURCE_DELTA.SAFE.json` und
`INDEPENDENT_SOURCE_DELTA_REVIEW.SAFE.json` werden unverändert verwendet. Die CI
stellt den öffentlichen Review als reguläre byteidentische Datei am
eingebetteten historischen CPU-Repopfad bereit. Der Test `localSourceDeltaPin`
bindet die echten Vier-Quellpins; keine historischen Hashkonstanten wurden
geändert, kein `pipelineLockLease` aktiviert und keine neuen nativen Abnahmen
behauptet.

## Lokaler Provisionernachweis

84 echte Dateien wurden privat kopiert, auf eine neue leere private Zielwurzel
mit `--write` bereitgestellt und danach 84/84 verifiziert. Die echten
Hostoriginale blieben unverändert. 9 Negativgruppen sind PASS. Unverändert
gelten: 8GiB Boden, 16MiB Provisionierungsspielraum, 90MiB Gesamtmaximum, 20MiB
je Datei, `O_NOFOLLOW`, `O_EXCL`, private Rechte, keine überschriebenen Ziele und
verbleibende Teildateien ohne Cleanup.

Der Provisioner lädt nichts herunter, entschlüsselt nichts und führt keine
Originale aus. Er erwartet ein bereits entschlüsseltes privates Bundle mit
kanonischen Pfaden relativ zu `/workspace`, etwa
`<bundle>/helmut-parallel-20261015/wave15/`. Bundlewurzel und Dateien müssen dem
ausführenden Benutzer gehören und ohne Gruppen-/Fremdrechte vorliegen. Erst
nach Prüfung des exakten Verbrauchercodes in einer vertrauenswürdigen Umgebung:

```sh
node scripts/lokal.js -- python3 -B scripts/helmut-resource-meter/provision-private-ci-originals.py \
  --bundle /private/already-decrypted-originals --destination-workspace /workspace
```

Ohne `--write` wird ausschließlich geprüft. Das zusätzliche `--write` erstellt
nur zuvor freie Ziele; vorhandene Dateien werden auch bei gleichen Bytes
abgewiesen. Eine andere Zielwurzel bildet nur den `/workspace`-Präfix ab und
belegt noch keinen Verbraucher unter seinen festen absoluten Pfaden.

## Echter Startpreflight 19/19 PASS

Der echte Startpreflight besteht 19/19 nach dem Fix des inerten VM-Helperpfads,
inklusive 26 Originalhashes und Replacement-Replay; preparation bindings sind
PASS, startinputs 6/6 PASS. Die VM hat nur zwei fest erlaubte Helperpfade auf
denselben inerten Stub; der Guard für unbekannte Dependencies bleibt. Der
Runtime-read-contract besteht nach Ergänzung des echten Sourceadoptionspins
13/13. Die historische Storagebindung und alle Fehlerprüfungen bleiben erhalten.
Workflow-YAML und Shellsyntax des ergänzten Bereitstellungsschritts sind geprüft.

## next-resource-authority: 25 PASS, 5 FAIL, 1 ERROR

Im vollen Restore liefen 31 Tests: 25 PASS, 5 FAIL, 1 ERROR. 5 Assertions
verlangen den fehlenden aktuellen V12-CLAIM, 1 korrekter Guard lehnt den
vorhandenen V12-Owner-GO ab. Alle Marker bleiben echt unverändert; kein Reset,
kein neues GO, kein Umgehen von Tests. Das CI-Minimalmanifest mit 84 Dateien
enthält V12-CLAIM/RESERVATION/OWNER nicht. Ein frischer isolierter
CI-Verbrauchernachweis ist offen; `bwrap` scheitert hier vor Teststart mit
uid-map-EROFS. Das ist nicht als CI-grün zu deuten.

## Schutzfix und Authdiagnose

Der lokale Credential-Schutzfix besteht 111/111 inklusive 19 neuer Assertions;
Kindzugänge sind entfernt, es werden keine Werte geloggt.

`HELMUT_GITHUB_CI_ADMIN_TOKEN` ist konfiguriert und ready; der Betreiber
bestätigt einen neuen fine-grained PAT mit owner/repo, Administration-RW,
Environments-RW und Actions-RW. Die normale Proxy-/TLS-Route ist unverändert.
Direkte Python- und `gh`-Abfragen auf Administration/Environments liefern
weiterhin 403. Zwei unabhängige Negativkontrollen (Python und curl) mit
absichtlich ungültigem NICHT-SECRET-Bearer erhielten dagegen 200 und einen
authentifizierten Kontext. GitHub-App-User-Endpunkte weisen auf
`chatgpt-codex-connector`; die App-Installation hat Actions-RW, aber kein
Administration/Environments. Das belegt eine nachgelagerte Ersetzung bzw.
Übersteuerung der gesendeten Authentifizierung. Das genaue Proxy- oder
Cloud-Modul ist nicht belegt, der PAT selbst nicht als falsch bewiesen. Es
werden keine weiteren Tokens angefordert und keine Safety umgangen. Die
verfügbaren Cloudtools sind nur drei Status-/Diagnoseleser und führen keine
Credential-Präzedenzmutation aus. Nötig ist eine unterstützte Korrektur der
ausgehenden Credential-Zuordnung für `api.github.com` mit dem bestehenden PAT;
ein unbelegter UI-Schalter wird nicht genannt.

## GitHub-CI bleibt blockiert

Der letzte Run `39689399857` auf `4a43e76c` scheitert an den fehlenden privaten
Originalen für Renderer 18/19; Syntax ist PASS, der Browserjob ist PASS, aber
der Smoke wurde laut Plan übersprungen. Es wurde kein privater CI-Kanal
geschaffen, nichts an Environment/Secrets/Reviewer/Branchschutz geändert und
keine privaten Originale an GitHub hochgeladen.

## Geschützter Kanal weiter erforderlich

Weiter nötig ist ein geprüfter exakter Workflow-/PR-Head-/Checkout-Merge-SHA
plus Manifesthash plus Bindung an Reviewer und PR-Ref. Ein Code-Merge ist für
den bestehenden `pull_request`-Trigger nicht erforderlich. Es entsteht kein
öffentliches Klartextartefakt, es gehen keine privaten Bytes an ungeprüften
PR-Code, und es wird kein manuelles grünes Statuslabel gesetzt. Kein
Production/Merge/Voll500 oder Profilaktivierung.

Historische Runs (Provisionierung vom 21.10., CI 39674469071 auf `ccd3cb1d`,
39682280922) bleiben als Historie vermerkt und begründen keine neue Abnahme.
