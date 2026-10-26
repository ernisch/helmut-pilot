# HELMUT: verbindliche Thread-Uebergabe vom26.10.2026

Sprintzustand: **Uebergabe gesichert; Hetzner-Einrichtung blockiert**.
GPT-6.1 SOL fuehrt mit Sehr hoch. Kurz und einfach auf Deutsch antworten.
Keine erneute Gesamtanalyse, kein neuer Originalumzug und kein weiterer
Einrichtungs-/Testaufruf aus dieser Uebergabe.

## Sofort hier fortsetzen

Nur den belegten `UNIT_PROPERTIES`-Fehler im Sicherheitswaechter untersuchen.
Betreiber hat die vorbereitete rein lesende Mac-Abfrage bereits ausgefuehrt.
**Nicht nochmals anfordern.** Auf beiden untersuchten systemd-Units fehlen mit
und ohne `--all` dieselben sechs Propertynamen:

`ExecCondition`, `ExecReload`, `ExecStartPost`, `ExecStartPre`, `ExecStop`, `ExecStopPost`.

Beide Abfragen pro Unit: Exit0, keine zusaetzlichen Felder. Fehlende Werte
duerfen niemals als leere Befehlslisten gelten. `--all` allein ist keine
belegte Korrektur. Die systemctl-/D-Bus-Darstellung gezielt untersuchen;
typisierte Abfrage der sechs Exec-Listen ist ein Kandidat, noch kein Nachweis.
Alle Schutzpruefungen bleiben erhalten. Eine spaetere Korrektur braucht gezielte
synthetische Tests, unabhaengige Abnahme und gruene Pflichtchecks.

Betreiberbeobachtung, hier nicht erneut live abgefragt:

- Fehlgeschlagene Setup-Unit: loaded/failed, Result=exit-code.
- `helmut-native-docker28.service`: loaded/active/running, Result=success.
- `ARM.PRIVATE.json`, `RESULT.PENDING.PRIVATE.json`, `RESULT.PRIVATE.json`: fehlen.
- `FIRST_ERROR.PRIVATE.json`: regulaer, root:root,0600,211Bytes.
- Leseskript meldet keine Dienstveraenderung, keinen nativen Start, keine
  gelesenen Projektinhalte und keinen Schluesseltransfer.

Das ist keine Originalhash-Abnahme, keine vollstaendige Prozessabschlusspruefung
und kein Nachweis null historischer Schreibzugriffe. Restorezustand und alle
vier Setup-Abnahmen bleiben unbestaetigt. Keine Wiederholung/Erfolgsumdeutung
des gescheiterten Aufrufs; Teilstaende, Fehler und Einmalmarker behalten.

## Code und veroeffentlichte Belege

Repository `ernisch/helmut-pilot`. Codebasis PR954, Main-Merge
`f1be0a0c0ac0f5a87fdb135c17b759dfe444b8f0`; Dokumentationsmerge PR955
`f2aa4c751ba568257fee00e53d345deadb0ce199`. Uebergabebranch
`codex/helmut-thread-handoff-20261026`; aktuellen Head und Main frisch lesen.
Nie auf Main schreiben und keine fremden Worktrees/fehlenden Indexpfade reparieren.

473 gezielte synthetische Tests bestanden, sicherheitskritische Komponenten
und Integration unabhaengig abgenommen. PR-CI40299279482 und Main-CI40302732339
vollstaendig SUCCESS; Vercel-GitHub-Checks SUCCESS. PR955-CI40309692532 SUCCESS.
Kein notwendiger eigener Code nur lokal gefunden; verworfene lokale Drafts
sind ueber veroeffentlichte Integrationscommits gesichert. Fremde Arbeitsstaende
wurden nicht veraendert und sind keine zugesicherte neue Cloud-Kopie.

Relevante Laufzeitquellen:

- `scripts/hetzner-native-setup-service.py`: Propertyliste/Servicewaechter,
  SHA256 `a41ddc422f5c49f5f6abae87758ce47bd91d4008494bedf46ebff0bf9192659c`.
- `scripts/hetzner-native-setup-coordinator.py`: Reihenfolge/ACCEPTED/Stopps.
- `scripts/hetzner-native-setup-driver.py`: genau eine Setup-Phase.
- Controller `scripts/hetzner-native-automation-server.py`, SHA256
  `62cb2394de10b8c26f528b5d627dd0cb7720047e7fbd571d6f4dcf99d87d2ad8`.
- Client SHA256 `16647fae58bc89c457113755dcd274f0bbd59558797d133e1e8eca14a779a87f`.

Einmaliger fehlgeschlagener Setupaufruf40306875483, Job121518055099,
Artefakt12643052325: `recover / UNIT_PROPERTIES / FAIL_KEEP_STATE_NO_RETRY`,
ready/accepted/lifecycle SHA jeweils null, native_qualified/native_go_consumed false.
Nonce `33c5a05bbd8e9e1eb43490e67095a3ae1ce4eb570bdcc96b3185ae7653d55c9d`.
Antwort SHA256 `f4b9ff053516e884f5b9eeb227e448fc90a99bd61c82c8b8c272391a329754ae`;
ZIP777Bytes, SHA256 `61ba7db0dad2826155c79a73c15dfafd7d07badfccf913ad9c1d05e567682e6a`.
Alte Stage40270395850 bleibt gescheitert/verbraucht; Status40286803902 belegte
PATH_ESCAPE,0 regulaere Dateien/1866 offene Eintraege, Metadaten UNKNOWN.

## Daten und Zugriff: kein grosser Umzug notwendig

Bestehender Hetzner-Testserver:2.28.77.245, Tailscale100.96.83.66.
Steuerung ausschliesslich ueber vorhandene GitHub Actions/Tailscale und den
begrenzten Root-ForcedCommand. Workflow `hetzner-native-automation.yml`.
Neue Sitzung muss eigenen GitHub-/Actions-/Drive-Zugriff frisch nachweisen.
Kein direkter Cloud-SSH-Zugang und kein privater Mac-Schluessel vorhanden.
Administratorzugang bleibt beim Betreiber; keine Schluessel uebertragen.

Zielbasis `/opt/helmut-native-test/automation-20261026`, Dockerbasis
`/opt/helmut-native-test/docker28-context-20261026`.
Quellpaket unter `stage-f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0`:
`payload.cipher.pgp` und bereits entschluesseltes `payload.tar.gz`.
Historischer Paketnachweis, jetzt nicht nochmals live geprueft:

- Cipher487267152Bytes, SHA256 `468610327368d51360815d18538ad0c3fcdc4d98825bb8bf0499daa96112ab3c`.
- Gzip487052181Bytes, SHA256 `be423c617c14d92ed833c6e8a97c3a094eb70c23dc13b05b2c114c953f73b18a`.
- Scope1767 Dateien/2865680705Bytes +99 Metadaten, SHA256
  `08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd`.
- Authentisches V12-Raw darin:2147483648Bytes,
  SHA256 `54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693`.
-1175 originale Python-Runtime-Dateien; PG17-Quellarchiv vorhanden,
  fuenf erforderliche ELF-Ableitungen noch nicht auf dem Ziel qualifiziert.

Das Paket ist in30 verschluesselten Teilen im bestehenden privaten Drive-Ordner
vollstaendig rueckgeprueft. Index:
https://drive.google.com/file/d/17DDhInbRwN20nqRPuNp3KTLq6AqMEhWc/view
SHA256 `87508b035c31fea52f4910cedf80b63baabf055e54cfe714dfe143383c15ec0c`.
Privater Empfaengerschluessel bleibt nur auf Hetzner, Fingerprint
`DCFD605ED28EEACA9B826105E769DE07A68BA8E4`.

Neue SAFE-Metadatensicherung mit Operatorbeobachtung, beiden Fehler-/Status-
Quittungen, Transfer-/Ruecknachweisen und Runtime-/Quellhashmanifesten:
https://drive.google.com/file/d/1ENhDwHmj7jTnmTOe6LTV30BKUK1UUT4p/view?usp=drivesdk
143904Bytes/14 ZIP-Eintraege, SHA256
`e04ce3c460337b3735ccea170808f8f3085d26fe5bfa6e1f0a73a4d187120a1d`.
Vollstaendig zurueckgeladen; alle Dateihashes gegen enthaltenes Manifest geprueft.
Nur SAFE-Metadaten, keine Originalpayloads, Schluessel oder Authwerte.
Operatorbeobachtung SHA256
`b3a172c62978e4e1311a939243f0357c14991abc29cbf9357c7eb68ac7aa2d53`;
sie ersetzt weder echte Originale noch eine neue native Abnahme.

Die gesamte Quellcloud ist NICHT auf Hetzner kopiert. Laufende Cloudprozesse,
Datenbanken, weitere historische/fremde Dateien und sitzungsgebundene
Credentials migrieren nicht automatisch. Quelle unveraendert erhalten:
`ccarenv_b64_Y2NhcmVudl8yOTU4NWEyOWM5NjA4MTkxYjhjNTkwOTY0ZGZkYjllOQ`.
Kein generischer Upload im bestehenden ForcedCommand; keine Wiederverwendung
der verbrauchten Stage-Once. Fuer die unmittelbare Codekorrektur/Diagnose ist
keine erneute grosse Originaluebertragung erforderlich. Noch keine erfolgreiche
Wiederherstellung behaupten und Quelle/alte Arbeitskopien nicht loeschen.

## Weiteres Ziel und geltende Grenzen

Nach enger Korrektur erst einen konkret neu zugelassenen Setupweg vorbereiten;
fehlgeschlagenen Versuch unveraendert erhalten. Keine Wiederholungsfreigabe
aus dieser Uebergabe ableiten. Danach erst frische native Quellen-, Original-,
Runtime-, OID-, Kernel-, Mount-, Prozess-, Kapazitaets- und Einmalbindungen.

Motorbasis fuer die geplante Vier-TX-Messung bleibt PR942,
`29b05ac0281347f8cde82b903b12f57e8cd5d8c9`:
CLAIM_STATE,RESERVE_D,SEND_D,SAME_ROOT_USAGE, exakt4 CoreCAS +2 lesende Statistik-
abfragen. Native Freigabe pausiert/unbenutzt; nicht automatisch starten.
Vor jeder erneuten echten nativen Ausfuehrung ist ein frisches konkretes
Betreiber-GO fuer Zielumgebung, Code, Fall, Zeit und Einmalbindung erforderlich.
Alte Cloud-GOs/Claims nicht als neue Hetzner-Autoritaet verwenden.
Die drei verworfenen U/Parts-Vergleichsfaelle nicht wiederholen.

Ziel danach: vollstaendige Unit<60s, Auth<30s, beide19,9s-Wartezeiten,
16 Kontrollen,3 Ergebnisse,FinalACK,Ruecklesungen/19er Abschluss unveraendert.
Letzte Unit65,15s/9von16/kein Abschluss; ihr Peak1373904896Bytes ist kein
500er- oder500MB-Reservenachweis. Der Auth-Kernkandidat ist noch nicht gemessen.
Keine neue allgemeine Optimierungsanalyse. PR941/421558bb und verschluesselten
CI-Fehler12576757083 getrennt offen lassen; keine Schluesselsuche/CI-Wiederholung.

Endziel exakt500 gleichzeitig aktive synthetische Profile/1500 gepruefte
Ergebnispositionen, gemeinsamer Peak inklusive gemessenem Aufbau/Abschluss,
vorgeschriebener Prozesse und Dateicache maximal1548000000Bytes bei2048000000Bytes
harter Grenze und500000000Bytes Reserve. Alle32 Startbedingungen/frische
Fall-/Zeitbindung und neues konkretes500er-GO bleiben Pflicht.
Keine Originalveraenderung, Loeschung, Production-Datenaktion, Profilaktivierung,
Budgetaenderung oder bezahlten Anbieteraufrufe. Lokale Entwicklung, gezielte
synthetische Tests, Commit/Push/PR und Merge/Deployment nur nach saemtlichen
gruenen Pflichtchecks bleiben im bestehenden Umfang erlaubt.

Pflichtlektuere: aktuelle AGENTS.md/CLAUDE.md/START_HERE/CURRENT_STATE.
Das detaillierte [Dossier](hetzner-native-automation-20261026.md) bleibt Belegquelle;
dortige alte Mac-Abfrage ist erledigt und darf nicht grundlos wiederholt werden.
