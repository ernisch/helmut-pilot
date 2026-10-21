# Private Originalbindungen für CI vorbereiten

## Wiederaufnahme22.10.2026 Europe/Istanbul

**Weiter blockiert; noch kein geschützter Original-CI-Lauf.** Remote-main
`1eb3cbff`, DraftPR927 unverändert `1c505ea1`; CI39682280922 scheitert weiterhin
beim echten Renderer18/19, Browser/MobilePASS. Die neue Zielcloud enthält die83
Originale noch nicht. Übergabepaket, Bericht und Rückdownloadbeleg sind vollständig
SHA256-geprüft, alle18 Metadatendateien stimmen. Ein eigener Ziel-GPG-Empfänger
wurde erzeugt; nur öffentlicher Schlüssel/Zielbericht wurden owner-only im bestehenden
Driveordner gespeichert und bytegleich zurückgeladen. Private Schlüssel/Passphrase
bleiben im Ziel. Originaltransfer und Datenbankwiederherstellung sind nicht bestätigt.
Der Quellchat benötigt den öffentlichen Empfänger; im Ziel ist kein Werkzeug zum
Senden eines Quellchat-Auftrags verfügbar.

`HELMUT_GITHUB_CI_ADMIN_TOKEN` ist cloudseitig aktuell ready. Direkte HTTP-Abfragen
mit diesem Zugang liefern auch nach gemeldeter Betreiberkorrektur403 bei
Actionspermissions, main-Branchschutz und Environmentsecrets. Das belegt fehlende
wirksame Rechte, weder die genaue Ursache noch den Tokentyp. Noch keine neue
GitHub-Environment-/Secret-/Reviewer-Konfiguration und kein Originalupload zur CI.

**Enger Schutzfix:** Vor der Wiederaufnahme erbten lokale Kindprozesse zusätzliche
Cloud-Zugänge. Die zentrale Liste in `scripts/lokaler-netzschutz.js` entfernt nun auch
`HELMUT_GITHUB_CI_ADMIN_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `DEEPSEEK_API_KEY`,
`HELMUT_ADMIN_SECRET`, `HELMUT_RUNTIME_READ_BEARER`,
`VERCEL_AUTOMATION_BYPASS_SECRET` und `CRON_SECRET` über den bestehenden Starter.
Die gezielte netzlose Schutzsuite besteht111/111Checks, darunter19 neue Prüfungen
mit Attrappen: direkter Preload verweigert den Lauf, echte Kindprozesse erhalten
keine dieser Kennungen, Meldungen enthalten keine Werte und die aufrufende
Umgebung bleibt erhalten. Beide JS-SyntaxprüfungenPASS; unabhängiger begrenzter
Diffreview ohne Befund. Das erteilt keine Freigabe für ungeprüften Code oder
Originalbytes und ersetzt keine Originalverbraucher-/Pflicht-CI-Abnahme.

Ein späterer geschützter Job kann den bereits vorhandenen `pull_request`-Trigger
von `ci.yml` nutzen, ohne Workflowcode nach main zu mergen. Vor Freigabe müssen
Revieweridentität, konkreter PR-Ref, tatsächlicher Run-/Workflow-/PR-Head-/Checkout-SHA
und Manifesthash gebunden sein. Standard-PR-Checkout ist der synthetische Mergecommit,
nicht automatisch der PR-Head. Ein bloßer Branchname oder ein isolierter
`workflow_dispatch`-Erfolg ist kein vollständiger Pflichtchecknachweis. Die konkrete
Konfiguration und Ergebnisbindung bleiben offen; die bisherigen Schutzgrenzen gelten.

## Vorbereiteter Stand21.10.2026

Stand21.10.2026: **Bereitstellung vorbereitet, GitHub-CI weiterhin blockiert.**
Keine Workflowänderung, kein Upload, keine Secret-/Environmentänderung und kein
neuer CI-Lauf gehören zu dieser Vorbereitung. Die bestehenden Prüfregeln bleiben
unverändert. Der Provisioner führt keine Originale oder Verbrauchertests aus.

Run39674469071 aufccd3cb1d scheitert beim echten Originalrenderer:18/19Starttests
PASS,1ERROR`regular pinned file required`; Browser/MobilePASS. Der Renderer
prüft bewusst26echte Vorlagen und den vollständigen Replacement-Replay.
Ein Ersatz durch erfundene Originale oder ein Skip würde den Nachweis verlieren.

## Exakte vorbereitete Schließung

`scripts/helmut-resource-meter/private-original-ci-manifest.json` enthält nur
absolute Pfade, Größen und SHA256:26Harnessvorlagen/127.973B und57eindeutige
Datenschließungs-/Verbrauchsmarkerdateien/83.362.396B, insgesamt83Dateien/
83.490.369B. Die Metadaten wurden gegen die vorhandenen echten Dateien geprüft.
Keine Originalbytes, Schlüssel oder Approvaldateien werden neu in Git abgelegt.
Die historischen Marker sind Daten; sie erteilen keine neue Testfreigabe.

`provision-private-ci-originals.py` akzeptiert ausschließlich ein bereits lokal
entschlüsseltes privates Bundle. Dessen Verzeichnisstruktur entspricht den
kanonischen Pfaden relativ zu`/workspace`; etwa beginnt ein Harnesspfad unter
`<bundle>/helmut-parallel-20261015/wave15/`. Das Bundlewurzelverzeichnis gehört
dem ausführenden Benutzer und hat keine Gruppen-/Fremdrechte; die Quelldateien
sind ebenfalls privat. Der Provisioner erstellt dieses Bundle nicht.

Nur in einer bereits vertrauenswürdigen Umgebung nach Prüfung des exakten
Verbrauchercommits verwenden:

```sh
node scripts/lokal.js -- python3 -B scripts/helmut-resource-meter/provision-private-ci-originals.py \
  --bundle /private/already-decrypted-originals --destination-workspace /workspace
```

Der Standardlauf verifiziert ohne Schreiben. Erst das explizite`--write`stellt
die bereits verifizierten Bytes bereit. Eine andere absolute Zielwurzel bildet
ausschließlich den kanonischen`/workspace`-Präfix ab; alle relativen Pfade bleiben
unverändert. Der unveränderte Verbraucher benötigt weiterhin seine kanonischen
absoluten Pfade. Ein Remap allein ist keine Verbraucherabnahme.

Der feste Manifesthash,83Dateien,83.490.369B,20MiBjeDatei und90MiBgesamt sind
hart gebunden. Vor dem ersten Schreiben werden alle Originalbytes, alle freien
Ziele und8GiBfreien Boden plus16MiBProvisionierungsspielraum geprüft. Nach dem
Schreiben wird der tatsächliche8GiB-Boden erneut geprüft. Verzeichnisse
werden ohne Symlinkfolge geöffnet; reguläre Dateien mit genau einem Hardlink,
kanonische absolute Pfade, SHA/Größe und private Rechte sind Pflicht. Vorhandene
Ziele werden auch bei identischem Inhalt abgewiesen. Dateien entstehen exklusiv
mit0600, neue Verzeichnisse mit0700. Danach werden die kanonischen Dateinamen
erneut gelesen und verifiziert. Bei Schreibfehler bleiben mögliche Teildateien
erhalten; es gibt keinen automatischen Retry, Überschreibpfad oder Cleanup.

## Bestehender Kanal und noch notwendige Ownerkonfiguration

Das GitHub-Repository ist öffentlich. Seine60vorhandenen Actionsartefakte
enthalten keine aktuelle83erSchließung; die neueren Cipherartefakte stammen vom
08.10., vor den hier benötigten Originalen. Releases sind leer. Die erfolgreiche
Ausführung von Run39674469071 belegt verfügbare GitHub-hosted Runner, aber keine
private Runnerbereitstellung. Die API meldet Repositoryrechte
admin/maintain/push/pull; Secrets-, Runner-, Actionspermissions- und
Branchprotectionmetadaten antworten trotzdem403. Das belegt eingeschränkte
APIberechtigungen, keine allgemeine technische Unmöglichkeit.

Ein bestehender privater Transport ist im lokalen
`/workspace/helmut-migration-restore-20261019-01a15550/CONTROL.SAFE.json`belegt:
owner-onlyDriveordner,443Originalziele,7Cipherteile/111.247.647B,9Credential-/
Approvaldateien ausgeschlossen. Dieser19.10.Transport enthält die späteren
Day20/21Dateien nicht. Die bestehenden Preview-/Production-Environments haben
laut lesbarer API keine Protectionregeln. Ein für diese Originale geschützter
CI-Kanal ist damit noch nicht eingerichtet.

Konkreter nächster Aufbau: aus den vorhandenen83Originalen ein enges privates
Bundle über den bestehenden owner-onlyServertransport bereitstellen; verschlüsselte
Fassung, Dateimetadaten und vollständigen SHA-Readback getrennt binden. Den
Download/Entschlüsselungsjob ausschließlich auf einem geprüften vertrauenswürdigen
Branch und exaktem geprüftem Commit hinter einem geschützten Environment
ausführen. Den vorliegenden Provisioner dort auf das bereits entschlüsselte Bundle
anwenden. Vor einer Konfigurationsänderung müssen Kanal, Environment, Reviewer,
Commitbindung und die Zuordnung des echten Prüfergebnisses zum PR-Kopf konkret
feststehen. Diese Vorbereitung stellt keinen solchen Job bereit.

Klartext gehört weder in Git noch in Artefakte/Releases des öffentlichen
Repositories oder ungeprüfte PR-Jobs. Ein bloßes Entfernen von Jobcredentials vor
den Tests reicht nicht: ungeprüfter Code hätte weiterhin die privaten Originalbytes
und könnte sie über Logs oder Netz ausgeben. Der bestehende tokenlose PR-CI-Vertrag
wird hier nicht verändert. Es werden keine übersprungenen oder lokalen Tests als
grüne GitHub-CI ausgegeben.

Ein lokaler Klassifikationsscan der83Dateien fand0parsebareJWT,0PEM-Schlüssel,
0Postgres-Passwortverifier und0Credential-Literalfelder im lesbaren Text.
4Postgres-Customdumps und1ELF-Datei wurden nicht dekomprimiert; die Prüfung
erteilt ausdrücklich keine Credential-frei-Freigabe für diese privaten Dateien.

## Gezielte Prüfung

Der kleine Negativtest verwendet ausschließlich erfundene kurze Bytes für
Verifierfehler. Diese Fixtures ersetzen keine der83Originaldateien:

```sh
node scripts/lokal.js -- python3 -B scripts/helmut-resource-meter/provision-private-ci-originals-test.py
```

Geprüft werden unter anderem Manifestdrift, Pfadausbruch, Symlinks, Hardlinks,
FIFO, öffentliche Quellrechte, belegte Ziele, unzureichender Plattenboden und
eine spät fehlende Quelle ohne vorherige Zielmutation.9NegativgruppenPASS;
ein Rennen nach der Vorprüfung überschreibt keine inzwischen angelegte Datei.
Ein vollständiger
Bereitstellungs-/Originalverbraucher-/CI-Nachweis bleibt offen.
