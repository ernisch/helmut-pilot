# W15: konkreter sicherer Übergabeschritt ohne neue Schlüssel

Stand29.10.2026. Die angehängte Offline-Quittung wurde geprüft. Die Wiederherstellung
des bestehenden DCF-Recovery-Schlüssels und die echte Kontrollantwort sind beim
Betreiber belegt. Das ist keine Wiederherstellung des7E-Empfängers in dieser Cloud.

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
