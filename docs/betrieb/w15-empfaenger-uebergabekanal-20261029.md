# W15: konkreter sicherer Übergabeschritt ohne neue Schlüssel

Stand29.10.2026. Die angehängte Offline-Quittung wurde geprüft. Die Wiederherstellung
des bestehenden DCF-Recovery-Schlüssels und die echte Kontrollantwort sind beim
Betreiber belegt. Das ist keine Wiederherstellung des7E-Empfängers in dieser Cloud.

## Fortsetzung im bestehenden neuen Chat: Schutz noch nicht nachgewiesen

Die aktuelle, tatsächlich an diesen Chat gebundene Cloud-Umgebung ist bereit;
Konfigurations- und beobachtete Revision sind jeweils `1`,
`observations_current=true`. Der bereits bestandene Prozessvergleich wurde
übernommen und nicht wiederholt. Die Metadaten führen den Canary jedoch unter
`runtime_variables` auf. Alle ausgewiesenen Secret-Ziele sind API-Variablen mit
Domainbindung; keine geschützte lokale Secret-Dateibindung ist ausgewiesen.
Das beweist keine geschützte lokale Schlüsselübergabe. Der öffentliche
[reduzierte Metadatenbeleg](belege/w15-end500-transfer-20261029/CLOUD_HANDOFF_CHANNEL.SAFE.json)
enthält keine Secret-Werte und erteilt keine Transfer- oder Startfreigabe.

Die verfügbaren Cloud-Werkzeuge lesen Status und Diagnosen; eine Änderung der
Bereitstellung können sie nicht vornehmen. Die tatsächlich nötige manuelle
Handlung ist daher zunächst ausschließlich die Prüfung des vorhandenen
Konfigurationsdialogs: Wird für **diese bestehende Umgebung** eine ausdrücklich
geschützte lokale Secret-Datei angeboten? Nur Bereitstellungstyp und die
nicht geheimen Bindungsmetadaten melden. Noch keine echte Passphrase und keinen
privaten Schlüssel eintragen oder in den Chat senden. Eine gewöhnliche Variable
oder eine umgedeutete API-Domainbindung erfüllt diese Anforderung nicht.

Der Betreiber meldet im laufenden Chat: Bereitstellungstyp nicht erkennbar.
Damit ist auch auf diesem Weg kein Schutznachweis hinzugekommen; keine echten
Geheimnisse anfordern. Die unabhängige GitHub-Integration kann weitergehen.

Falls ein passender Dateityp vorhanden ist, zuerst den bereits öffentlichen
Canary über genau diesen geschützten Dateityp bereitstellen. Danach aktuelle
Schutz-/Bereitschaftsmetadaten, Umgebungsbindung sowie Besitzer, Modus und
Bytegleichheit der Probe prüfen. Ein möglicher Neustart oder Wechsel der
Umgebung wird dadurch nicht freigegeben. Bei fehlender nachweisbarer
Bereitstellung bleibt die echte Schlüsselübergabe blockiert; keine Alternative
durch Chat, Git, Workflow-Inputs oder öffentliche Ablage improvisieren.

Die nachfolgenden Beobachtungen vor dem neuen Chat bleiben historisch erhalten.

## Aktueller Solo-Weg: zuerst öffentlicher Canary im vorhandenen GitHub-Environment

**Neuer tatsächlicher Befund:** Betreiber bestätigt den Canary als
Environment-Secret. Lauf40848206475 auf`6a2a439c`, Versuch1, ist erfolgreich;
aktueller Metadatenprüfer bestätigt Environment-ID, exakten Branch, deaktivierten
Adminbypass und passenden Kopf. Job-/Environment-/Commitbindung unabhängig
statisch geprüft. Diese Kombination belegt den öffentlichen Testkanal;
echte Empfängerdaten und Originale bleiben separat zu prüfen.
[Zusammengesetzter Kanalbeleg](belege/w15-end500-transfer-20261029/GITHUB_ENVIRONMENT_CANARY.SAFE.json).

Die folgende Beschreibung hält den inzwischen ausgeführten Canary-Schritt fest.

Der Betreiber stellt menschliche Required reviewers/Selbstfreigabesperre
ausdrücklich zurück. Das erzeugt keine neue personelle Startbedingung.
Branchbindung und ausgeschalteter Adminbypass sind inzwischen live bestätigt;
die unabhängige technische Codeprüfung erfolgt durch einen getrennten Helfer.
Der lokale Cloud-Dateikanal bleibt unbekannt. Für den vorhandenen GitHub-Weg
wird deshalb nur ein eng gebundener öffentlicher Kanalcheck vorbereitet.

Der manuelle CI-Modus`end500-handoff-canary` bindet das vorhandene
Environment`helmut-ci-originals`, den aktuellen PR975-Branch, exakten Commit
und Versuch1. Ausschließlich der Ausdruck
`secrets.HELMUT_W15_HANDOFF_CANARY` wird dem bekannten Canary-Prüfer übergeben.
Er verwendet keine Archiv-/Empfängerpassphrase und keinen privaten Schlüssel.
Der Prüfwert ist unverändert öffentlich:
`HELMUT-W15-LOCAL-CANARY-20261029`.

Falls dieser Eintrag im Environment noch fehlt, ist der konkrete manuelle
Schritt: GitHub → Repository → Settings → Environments →`helmut-ci-originals`
→ Environment secrets → Add environment secret →
Name`HELMUT_W15_HANDOFF_CANARY`, Wert obiger **öffentlicher** Testwert →
Add secret. Keine bestehenden Secrets ersetzen; keine gleichnamige
Repositoryvariable als Beleg umdeuten. Nur Namen und Environment-Scope melden.
Diese Scopebestätigung bleibt erforderlich: Fehlt das Environment-Secret,
kann GitHub für`secrets.NAME` auf ein gleichnamiges Repository-/Org-Secret
zurückfallen. Job-Environment und passende Bytes allein beweisen die Herkunft
des Eintrags deshalb nicht.

Danach genau diesen manuellen Kanalcheck am geprüften Kopf ausführen und die
tatsächliche Job-/Environment-/Commit-/Versuchbindung prüfen. Auch ein passender
Testwert allein beweist weder den Zugriff auf echte Empfängerdaten noch eine
Restore- oder End500-Freigabe. Vor einem echten Transfer müssen konkreter
Secretumfang und private Verarbeitung im tatsächlichen Job unabhängig geprüft
sein. Archivpassphrase und DCF bleiben bevorzugt offline; bestehender7E-Export
und separate Empfängerpassphrase sind weiterhin der engste spätere Umfang.

Der konkrete nächste Empfängerschritt ist jetzt als
[`end500-receiver-check`](w15-github-empfaengerpruefung-20261029.md) vorbereitet:
zwei dedizierte Environment-Secrets, ausschließlich bestehender7E-Empfänger
und öffentlicher Kontrolltext, kein Originalarchiv/DB/Controller. Der private
lokale Browserhelfer öffnet den bereits gepinnten Wrapper auf dem Mac; er
benötigt keine zuvor gespeicherte DCF-Datei und keine neue Software. Archivpassphrase
und DCF bleiben offline. Die eigentliche Bereitstellung/Empfängerprüfung ist
noch nicht erfolgt; keine Startfreigabe daraus ableiten.

## Bestehende Sicherungen und Zielbindung

Der private Drive-Wrapper `1QqKoON859fDE-iwvk3nErSZnN68Tkz8C` ist erneut als
3.298Byte-Datei mit alleiniger Eigentümerberechtigung im vorhandenen Ordner
beobachtet. Bereits vollständig bytegeprüfter Cipher-SHA256:
`753b8bdaad77d992ee21d0099dd43614ab367403c97ba1213d6206aa7b959714`.
Heute nur Metadaten geprüft, keine erneute Wrapper-/Originalübertragung.

Die ursprüngliche, gezielt erneut gelesene Erstellung bindet den Wrapper an
`helmut-w15-receiver-key-recovery/1` mit dem geschützten vorhandenen Secretkey-
Export und dessen separater Passphrase. Die JSON-Felder heißen
`protectedSecretKeyBase64` und `secretKeyPassphraseBase64`. Ziel ist unverändert
Empfänger `7E3998A6C2CB948C69A2EE51F4267ABF26796EDC` mit Public-Key-SHA256
`3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443`.
Keine neuen Schlüssel und kein erneuter Export der zwölf Originale sind nötig.

## Nächster Schritt: ausschließlich einen öffentlichen Testwert verwenden

Hier ist kein Bitwarden-Zugriff eingerichtet. Die aktuellen geschützten
Cloud-Anbindungen sind API-/Domainbindungen; ein tatsächlich lokaler Secret-
oder Dateikanal und dessen Anwendung auf diesen Thread sind noch nicht bewiesen.
Die verfügbaren Cloud-Werkzeuge können diese Konfiguration lesen, nicht anlegen.

Im vorhandenen Konfigurationsdialog zuerst feststellen, ob ein geschütztes
lokales Secret beziehungsweise eine private Secretdatei für diese Umgebung
angeboten wird. Wenn vorhanden, ausschließlich Folgendes als Probe verwenden:

| Feld | Öffentlicher Inhalt |
|---|---|
| Name | `HELMUT_W15_HANDOFF_CANARY` |
| Wert | `HELMUT-W15-LOCAL-CANARY-20261029` |

**Diese Zeichenfolge ist kein Geheimnis.** Noch keine Archivpassphrase,
Schlüssel oder Empfängerpassphrase eintragen. Keine API-Domain/Schutzart umdeuten,
um die Probe verfügbar zu machen. Wenn nur domaingebundene API-Zugänge angeboten
werden, zunächst nur diesen Konfigurationstyp melden. Es wird kein neuer Thread
automatisch angelegt; ob eine Änderung ohne Runtime-Neustart greift, bleibt offen.

Nach der Konfiguration hier ausschließlich Name und Bereitstellungsart melden.
Der Agent prüft frische Runtime-/Schutzmetadaten und im tatsächlich gebundenen
Lauf die lokale Gleichheit mit dem öffentlichen Wert:

```sh
python3 -B scripts/w15-github/handoff_canary.py --check-public-canary-only
```

Der optionale Dateikanal akzeptiert ausschließlich eine gleichnamige Probe-
Datei (optional `.txt`), privaten0700-Elternordner, Datei0600, eigenen Eigentümer,
keine Links und höchstens256Bytes. Er vergleicht direkt, veröffentlicht weder
Wert noch Hash und erkennt Dateiänderungen. Aktuelle echte Beobachtung ohne
Konfigurationsänderung: `BLOCKED_PUBLIC_CANARY_NOT_LOCAL`, wie erwartet.

Auch `PASS_PUBLIC_CANARY_LOCAL_BYTES_ONLY` erteilt keine private Übergabe-
oder Startfreigabe. Zusätzlich müssen der geschützte Konfigurationstyp, aktuelle
Bereitschaft und passende Bindung an diese Umgebung bestätigt sein. Eine normale
Laufzeitvariable mit dem richtigen Wert reicht dafür nicht.

## Erst danach die echte Übergabe konkret festlegen

Empfohlen wird der kleinste Eingriff: Archivpassphrase und DCF bleiben offline;
dort ausschließlich den gepinnten7E-Wrapper öffnen, bestehenden geschützten
7E-Export/Passphrase prüfen und nur diese Empfängerdaten über den nachgewiesenen
geschützten Kanal bereitstellen. Das bestehende Offline-Prüfprogramm erzeugt
noch keinen solchen Export. Vor dessen Übergabe Umfang, Empfänger, Prüfpins und
vorhandene beziehungsweise neu erforderliche konkrete Freigabe festhalten.
Keine echten Zugangsdaten in Chat, Git, Logs, Workflow-Eingaben oder öffentliche
Artefakte. Ein direkter Archivpassphrasenkanal wäre eine breitere Alternative,
deren tatsächliche lokale Unterstützung und konkreter Umfang vorher zu klären sind.

Das bestehende GitHub-Environment ist kein fertiger Ausweichkanal:
letzter Secrets-Zugriff403, fehlende Schutzregeln. Frühere Actions-Datenfreigabe
ersetzt diese technischen Bindungen nicht. Kein neuer Schlüssel, Thread, Dienst
oder öffentlicher Speicher wird als Umgehung verwendet.

## Unabhängige GitHub-Vorbereitung

Lesende Runnerprobe im vorhandenen `end500-plan`-Job ergänzt: Kernel-cgroup-
Schnittstellen, systemd, temporäre UID/GID1000 samt erhaltener Docker-
Ergänzungsgruppe, lokale Docker-Abfrage und tatsächlich freier Speicher.
Keine Benutzer-/Gruppenänderung, cgroup-/Containeranlage, Datenbank, privaten
Eingänge oder Secretwerte. Ergebnisse bleiben `readiness=BLOCKED`, selbst wenn
alle Fähigkeiten beobachtet wurden. Ein einzelner Planlauf ist kein End500
und kein gemeinsamer Lebenszeit-RAM-/Restore-Nachweis.

Fünf neue Canary- und sechs neue Preflight-Grenzfälle bestanden; statischer
unabhängiger Sicherheitsreview im jeweiligen Umfang bestätigt. Keine früheren
500er-Nachweise wiederholt. RAM-Vertrag, Swap0 und fachliche Grenzen unverändert.
