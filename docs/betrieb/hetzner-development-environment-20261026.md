# Gespeicherter Contextfehler und begrenzte Arbeits-/Testumgebung

## Zuerst ausschließlich den erhaltenen V2-Fehler lesen

Der tatsächliche V2-Contextaufruf40403071760 auf Main4a82 endet mit
`FAIL_KEEP_STATE_NO_RETRY/WORKER_FAILED`; Image wurde nicht ausgeführt.
Vor jeder weiteren Einrichtung wird deshalb der neue rein lesende Vertrag
`context-failure-observation-20261026-v1` verwendet. Er liest ausschließlich
die fest gebundenen gespeicherten Antwort-, Supervisor-, Job- und Componentrollen
einschließlich höchstens8 anonymer temporärer Fehlerpublikationen. Fehlende
Blätter oder übergeordnete Verzeichnisse erhalten einen positiven gehaltenen
Abwesenheitsbeleg. Unbekannte Inhalte bleiben ausdrücklich unbekannt.

Der bestehende Workflow verwendet dafür `controlMode=runtime-metadata-v1`,
`operation=status` und eine frische kanonische Base64-Kapsel mit genau
`schema=helmut-context-failure-capsule-v1`,
`contract_id=context-failure-observation-20261026-v1`, `action=inspect`,
dem aktuellen qualifizierten `source_sha256`,
`contract_sha256=224b49c0bb482392b201510fb83993590b3ba54a32f0426ec1a5c17d89234aa2`,
einem neuen64-stelligen Hexnonce sowie ganzzahligen `issued_at_utc` und
`expires_at_utc` mit höchstens300s Abstand. `planSHA` bleibt unverändert,
`payloadSHA` bindet genau die aktuelle Serverquelle.

`CONTEXT_FAILURE_OBSERVED_NOT_READY` ist eine Diagnose und keine Einsatzbereitschaft.
Der alte Context wird nicht wiederholt; Originale, Erstfehler, Keys, Once- und
Accepted-Dateien bleiben erhalten. Nach dem Lesebeleg wird nur die konkret
belegte Ursache getrennt bewertet. Die unten vorbereitete allgemeine
Dev-Einrichtung kann nach der RO-Diagnose unabhängig vom gesperrten nativen
Context fertiggestellt werden. Kein neuer Context- oder Nativeversuch folgt daraus.

## Getrennte Entwicklungsumgebung

Diese Einrichtung ergänzt die getrennte native PR942-Basis um eine schreibbare
Arbeitskopie. Native Originale, Socket, Namespace, Quittungen und Laufrechte
werden dabei nicht verwendet. Production bleibt bei Vercel/Supabase.

Der bestehende geschützte Workflow und Root-ForcedCommand bleiben der Zugang.
Nur der Controller/Helper muss auf aktuell geprüftem Main stehen. Die
Arbeitsquellen sind ein gesonderter exakter Commit aus
`https://github.com/ernisch/helmut-pilot.git`; auch ein noch nicht gemergter
Entwicklungscommit desselben Repositorys ist zulässig. Dafür ist kein
Production-Merge je Testbefehl erforderlich.

## Einrichtung und normale Befehle

Vor dem Dispatch die beiden Main-Pflichtjobs einschließlich tatsächlichem
Native-Boundary-Schritt abwarten. `planSHA` bleibt der vorhandene
`e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb`;
`payloadSHA` ist der SHA256 der Serverdatei genau dieses qualifizierten Main.

```sh
gh workflow run hetzner-native-automation.yml --ref main \
  -f controlMode=development-v1 -f operation=admit \
  -f planSHA="$PLAN_SHA" -f payloadSHA="$SERVER_SHA" \
  -f developmentAction=prepare
```

`prepare` führt nacheinander `tools`, `source`, `image`, `syntax` und
`lage-rest` aus. Erst alle fünf tatsächlichen erfolgreichen Antworten belegen
die vollständige Einrichtung. Ein leerer `developmentSourceCommit` verwendet
den exakten Main-Commit des Workflows. Später denselben Aufruf mit folgenden
beiden Feldern verwenden:

| Zweck | developmentAction | developmentSourceCommit |
| --- | --- | --- |
| Andere Arbeitsquelle holen | `source-sync` | expliziter 40-stelliger Repository-Commit |
| Syntax und lokaler Netzschutz | `syntax` | aktuell eingerichteter Arbeitscommit |
| Echter kleiner PostgreSQL-/PostgREST-Test | `lage-rest` | aktuell eingerichteter Arbeitscommit |

Die Git-Metadaten liegen rootgeschützt außerhalb des schreibbaren Arbeitsbaums.
Hooks, Attribute-Filter, globale Konfiguration, Credentialhelper und Submodule
sind geschlossen. Ein veränderter Arbeitsbaum wird vor `source-sync` erhalten
und blockiert den Wechsel. Ein neues Lockfile verlangt eine separat geprüfte
Toolchain; es wird nicht still mit alten Abhängigkeiten getestet.

## Installierter Umfang und Grenze

Alles liegt unter `/opt/helmut-development-20261026`, mit eigenem Dockerdienst,
Socket, DataRoot und festem Container-Cgroup. Kein Hostkonto wird angelegt;
UID/GID1000 bleiben unberührt. Nur im Devimage existiert der Benutzer2000, den
`initdb` zusätzlich zur numerischen Prozesskennung benötigt.

Node22.23.4/npm10.9.9 und PostgREST12.2.3 ergänzen direkt das gepinnte
`postgres:17.6-bookworm`-Image. PostgreSQL-Server, Client, ICU und Erweiterungen
bleiben dadurch in derselben Distribution. `npm ci --ignore-scripts` arbeitet
ohne Audit/Fund und ohne Zugangsdaten; sämtliche Lockfile-URLs müssen HTTPS
auf registry.npmjs.org mit SHA512-Integrität sein. Das Image wird anschließend
ohne Netz gebaut und über seine unveränderliche Image-ID verwendet.

Tests laufen als2000:2000, ohne Netz, ohne Linux-Capabilities, mit schreibgeschütztem
Root-Dateisystem und ausschließlich dem neuen Arbeitsbaum als Bindmount.
Der bestehende `scripts/lokal.js` bleibt zusätzlich aktiv. PostgreSQL erhält
für `lage-rest` einen frischen kurzlebigen Cluster innerhalb desselben
netzlosen Containers; PostgREST und die15 bestehenden synthetischen Testgruppen
benutzen nur127.0.0.1. Es werden keine Profile aktiviert und keine nativen
Performance-, Vier-TX-, Modell- oder500er-Fälle gestartet. Browser ist nicht
Bestandteil dieser für den nächsten Vorbereitungsschritt begrenzten Einrichtung.

Vor dem Aufbau sind10GiB native Reserve plus8GiB konservativer Aufbaupuffer
und1GiB Stoppabstand erforderlich. Die entpackte Docker-Layergröße ist vor dem
Pull ausdrücklich unbekannt. Alle Prozesse werden auf freien Platz überwacht;
bei Abbruch werden ausschließlich der eigene Container-Cgroup und Devdienst
beendet und deren Ende geprüft. Es gibt kein Löschen, Prune oder Zurücksetzen.
Jeder Dockerbefehl erhält eine frisch gestartete, unabhängig auf290s begrenzte
Devruntime. Der bestehende native Dienst wird weder angehalten noch mitbenutzt.
Vor jedem Unitstart werden die typisierten tatsächlichen Manager-Unitpfade
und sämtliche wirksamen globalen, Präfix- und exakten Dropinorte geprüft.
Zusätzliche `.conf`-Overrides und Unitabhängigkeiten sind gesperrt; die
Devdaemon-Datei muss exakt dem festen eigenen Quelltext entsprechen. Unbekannte
Suchpfade oder Metadaten stoppen bereits vor einem neuen Hostbefehl. Fehlende
Exec-Felder werden dabei nicht als leere Arrays ausgegeben.

Alle ausgeführten Phasen erhalten getrennte validierte SAFE-Antwortpaare im
GitHub-Artefakt `helmut-development-public-<run>-<attempt>`. Die letzte Antwort
oder der erste Fehler bleibt zusätzlich im bisherigen Zweierartefakt.
Begrenzte vollständige stdout/stderr, Hashes und Erstfehler bleiben privat in
der neuen Devwurzel erhalten; nur geschlossene Diagnosedaten werden veröffentlicht.

## Quellen und lokale Prüfung

Am26.10.2026 direkt gegen offizielle Quellen geprüft:

| Bestandteil | Quelle | SHA256 |
| --- | --- | --- |
| Node22.23.4 linux-x64 | [offizielle Prüfsummen](https://nodejs.org/dist/v22.23.4/SHASUMS256.txt) | `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce` |
| Docker28.4.0 statisch | [offizielles Archiv](https://download.docker.com/linux/static/stable/x86_64/docker-28.4.0.tgz),82093093Bytes | `21516934188f06d0e5f232cbde8112701f6d82899016240bc7a5d619f6b0059c` |
| PostgREST12.2.3 linux-static-x64 | [offizielles Release](https://github.com/PostgREST/postgrest/releases/tag/v12.2.3) | `9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c` |
| PostgreSQL17.6-bookworm | bereits gepinnter bestehender CI-Vertrag | `f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3` |

In der Cloud tatsächlich gebautes Devimage mit denselben Dockerfile-/Entrypoint-
Bytes: Syntax plus92/92 Netzschutzprüfungen Exit0; PostgreSQL17.6 und
PostgREST12.2.3 mit15/15 REST-Gruppen und bestätigter Bereinigung Exit0.
REST-stdout-SHA256:
`3996c9a8eec6c8dc933c0360ec2bee3865fe9461d46c6a7ebd7ea1b6dc26e448`.
Das ist ein lokaler Integrationsbeleg, noch keine zielseitige Einrichtung oder
native Freigabe. Vor Main-Integration bleiben Pflicht-CI und unabhängige
Quellenprüfung erforderlich; danach wird der feste `prepare`-Weg tatsächlich
auf dem Ziel ausgeführt.
