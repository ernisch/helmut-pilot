# W15: begrenzte gemeinsame Runner-Prozessprobe

Der neue Adapter `scripts/w15-github/runner_parent.py` verbindet einen echten
systemd-Parent mit einem root-Supervisor, einem Python-Kind unter UID/GID1000,
einem lebenden Docker-Client und einem daemonseitig erzeugten Containerkind.
Der Container startet ausschließlich `/bin/sleep`, keine Datenbank, App oder
Controller. Keine Originale, Schlüssel, Secrets oder Gesamt500-Läufe werden
geöffnet oder gestartet. Die bestehende Capabilityprobe wird nicht wiederholt.

Der vorhandene PG17.6-Digest muss vorher lokal vorhanden sein; der Adapter
lädt und baut keine Images. Der Workflow kann ausschließlich folgenden Aufruf
verwenden, gebunden an seinen exakten ausgecheckten Commit und Versuch1:

```sh
python3 -B scripts/w15-github/runner_parent.py --probe-parent-only \
  --run-id "$GITHUB_RUN_ID" --expected-commit "$EXPECTED_COMMIT"
```

`GITHUB_ACTIONS=true`, passende `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT=1`, HEAD
und die beiden ausführbaren Repository-Dateien werden vor Ressourcenanlage
geprüft. Ein Versuch außerhalb dieser Bindung stoppt. Keine freie Shell oder
beliebigen Kindbefehle sind vorgesehen; alle Kinder erhalten eine kleine feste
Umgebung ohne geerbte Runner-Secrets.

Eine exklusiv neu angelegte flüchtige root-eigene `.slice` wird explizit geladen
und gestartet. Ihr Unit-Inhalt setzt bereits vor dem Start
`MemoryMax=2560000000` und `MemorySwapMax=0`; es gibt keine Abhängigkeit davon,
ob `systemctl set-property` eine noch unbekannte Slice implizit laden würde.
Erst nach echten Kernel-Readbacks startet der root-Supervisor in dieser Slice.
Der Supervisor startet den UID1000-Worker mit genau der beobachteten
Docker-Socket-GID als Ergänzungsgruppe. `sudo -P` allein würde im root-Service
nicht die früheren Runner-Ergänzungsgruppen wiederherstellen. Benutzerkonten,
Socketrechte und Gruppenmitgliedschaften werden nicht geändert.

Der Worker verwendet den bestehenden `common_resources.observe` und prüft
seine eigene, die root-Supervisor-, Docker-Client- und Container-Init-PID gegen
denselben Parent. Der zusätzliche Containerdeckel bleibt2560000000Bytes und
Swap0. Kernelpeak höchstens2048000000Bytes, mindestens512000000Bytes Reserve,
keine Limit-/OOM-Ereignisse und kein Peakreset gelten bei jedem Sample.
Der root-Supervisor liest während der gesamten Workerzeit weiter.
Ein Containername allein erteilt kein Stoprecht: frische Run-/Nonce-/Commit-
Labels, erwarteter Imagehash und Parent müssen dieselbe tatsächlich gelesene
Container-ID binden. Nur diese ID wird gestoppt; ein vorhandener fremder Name
oder eine unbekannte Eigentumsbindung stoppt die Probe ohne fremden Stop.

Zuerst stoppt das feste Containerkind, danach endet der Docker-Wait-Client,
danach der UID1000-Worker und zuletzt der root-Supervisor. Der äußere Leser
bestätigt danach dieselbe Parent-Inode, `populated=0` und die finalen
Lebenszeitwerte. Erst anschließend wird ausschließlich die probeeigene Slice
gestoppt und ihre flüchtige Unitdatei entfernt. Der gestoppte synthetische
Container bleibt erhalten. Unbekannter Exit, Timeout, fehlender Readback oder
fehlerhafter Abschluss ergibt keinen PASS und keinen automatischen Retry.
Das erste äußere SIGTERM führt in diesen Abschluss; weitere SIGTERM dürfen ihn
nicht unterbrechen. Auch ein erstes SIGTERM während eines sonst erfolgreichen
Abschlusses wird gespeichert und verhindert jeden PASS. Wird bereits das frühe
Setup vor seiner Bestätigung unterbrochen, kann eine leere Slice/Unit verbleiben;
zu diesem Zeitpunkt startet der Adapter noch keine aktiven Kinder. Das ist kein
Cleanup-PASS. SIGKILL oder Runnerverlust können keinen lokalen Abschluss
garantieren. Der feste Sleep90 und Service75 begrenzen die Probe; ein solcher
unbeobachteter Abbruch ist ausdrücklich kein Cleanup- oder Topologie-PASS.

Ein Erfolg heißt ausschließlich `PASS_PARENT_TOPOLOGY_ONLY_START_BLOCKED`.
Er belegt diese tatsächliche Runner-Topologie und ihre begrenzten Kernelwerte;
`readiness=BLOCKED`, `executionAuthority=false`, `end500Acceptance=false` und
`commonLifetimeMemoryAccepted=false` bleiben erhalten. Er beweist keine echte
PostgreSQL-/PostgREST-/Node-/Controller-, Restore-, Daten- oder Backupausführung.
Der Daemon selbst liegt außerhalb des Parents; insbesondere sind die späteren
`docker cp`-Writer und deren Cachezurechnung noch gesondert zu integrieren.
Auth30/Unit60/Provider20 und der geltende End500-Vertrag bleiben unverändert.

Nur neue synthetische Adapter-Grenzfälle dürfen lokal laufen. Ein echter
Parent-/Containerstart wird hier nicht lokal ausgeführt; historische grüne
CI-/Capability-/500er-Nachweise werden nicht wiederholt oder neu etikettiert.
