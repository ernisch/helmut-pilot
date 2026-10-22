# V12: native Einzelunit-Anbindung, 22.10.2026

Stand21:37UTC: teilweise abgeschlossen. Kein erfolgreicher Motorlauf, Unit60-
oder500er-Reservenachweis. Basis `c46d07ebddaf8914c747fbc84f8059888376d9c1`;
Branch `codex/v12-unit60-native-integration-20261022`,
[Entwurfs-PR936](https://github.com/ernisch/helmut-pilot/pull/936).
Alte GOs und Claims bleiben verbraucht. Keine Production-Aktion, kein Merge und
kein vollständiger500er-Lauf sind aus dieser Arbeit freigegeben.

## Native Belege

Die echte Source-/Readonly-/Bridge-Vorbereitung mit `4f65115a` bestand im Fall
`/workspace/helmut-unit-diagnostic-native/8b21ca3f3ac6464c3dd706795403dd62`:
35,700s,115Messproben, gemeinsamer Peak1.024.176.128B, alle Speicherereignisse0.
Die authentische V12-POSTRUN-Kopie enthält1714Dateien/372.011.391B; OriginalRAW
und ursprünglicher Auth-Rowhash blieben unverändert. Fünf originale Leserlibs
wurden gegen14Image-Layer und Endhashes,974JIT-Dateien gegen die Originalclosure
geprüft. PostgreSQL17 wurde ausschließlich auf der neuen Kopie betrieben.
Alle Prozesse endeten tatsächlich, PostgreSQL mit0 und natürlichen Pipe-Enden;
die gemeinsame Gruppe war nach den letzten Zählerlesungen leer.

Nativ bestanden: zwei frische Originaltrigger-Kataloge mit10Triggern,
49Readonly-Closure-Proben einschließlich34Verweigerungen sowie20negative
Bridge-Proben. Der frische Vertrag umfasst27Store- und9Bridge-Funktionen.
Diese Vorbereitung hat weder Seed, positiven Original-CAS, Ergebnisinsert noch
Motor ausgeführt. [Bereinigter Beleg](belege/v12-native-unit-integration-20261022/NATIVE_SOURCE_BINDINGS.SAFE.json).

Die eigenständige Host-/Aliasqualifikation mit `30754fed` bestand im Fall
`/workspace/helmut-unit-diagnostic-native/f4141ede77933fac0076c2b5d70672fa`.
Peak26.570.752B, Ereignisse0; tatsächlicher Installer und unabhängiger Node-Leser
jeweils Exit0 mit beiden natürlichen Pipe-Enden. Neue öffentliche Aliase wurden
innerhalb derselben Messgruppe materialisiert. Keine Datenbank, kein Motor und
kein Anbieter wurden dabei gestartet.
[Bereinigter Beleg](belege/v12-native-unit-integration-20261022/NATIVE_HOST_BINDINGS.SAFE.json).

Die Cloud erlaubt dem äußeren UID1000-Prozess keine fremden exe-/Namespace-
Symlinks. Ein unabhängiger, fester Node-Leser im exakt gebundenen eigenen
Container erhebt diese Fakten. Host-PID, Startticks, Befehl, echte Parent-/Leaf-
Inodes und PID-Mitgliedschaft werden außen unabhängig gebunden. Die tatsächliche
Cgroup-Darstellung `0::/../<parent>/<CID>` bleibt erhalten; weitere Traversierung
wird abgelehnt. Dieser Kernel besitzt keine Zeitnamespaces: das explizite
ClockDomain-Objekt bindet deshalb den echten gemeinsamen Kernel und Boot-ID,
keinen erfundenen Namespace. Docker nutzt eine eigene leere CLI-Konfiguration;
Proxywerte und automatisches HOSTNAME gelangen nicht in den Client.

## Implementierter Pfad und verbleibende Abnahme

Der explizite Einstieg `local-unit-native-supervisor.py --run-native-single-unit`
verdrahtet Source, Owner, PostgREST, unabhängige Beobachtung, echten Seed,
Originalwriter, HTTP-Motor, laufenden Beobachtungs-Updater und unabhängigen
Abschlusssnapshot. Defaultstart und vollständiger500er sind ausgeschlossen.
Original-CAS und eigener CAS liegen in einer Transaktion; atomare Quittungen,
Historyprefix, Rechte, Revisionen und verlorene ACKs bleiben gebunden. Unbekannte
Schreibausgänge werden nicht automatisch wiederholt. Die vollständige positive
Kette ist noch NICHT nativ akzeptiert.

Echte direkte Node-Clients warten auf einen frischen, PID-/Starttick-gebundenen
Beobachtungsrahmen. Nach dauerhaftem Terminal folgt Exit-Quieszenz; erst nach
tatsächlichem Exit0 und beiden natürlichen Pipe-Enden akzeptiert der Controller
den Terminal. Die Sicherheitsfristen bleiben unverändert.

Der erste Start dieser Kette mit `1ebe946f`, Fall
`/workspace/helmut-unit-diagnostic-native/973174a31113c4e276bd619a8b0ad87a`,
blieb FAIL vor PostgreSQL, Seed und Motor: die äußere Docker-Inventur ließ die
feste Prozessleser-Handshake-Pipe zu lange unbedient. Kein Motorentry wurde
angefordert,0Motoreinheiten; gemeinsamer Peak61.931.520B/Ereignisse0. Die Gruppe
ist leer, der Hostabschluss bleibt ausdrücklich nicht sauber qualifiziert.
Die enge Ablaufkorrektur pumpt ausschließlich den festen Beobachter innerhalb
der unveränderten3s-Frist. Der native Transportfall
`0781da7c039e4d708fd6fe975c718ff9` bestand mit `076fbe91`: tatsächlicher
Beobachterabschluss vor der nächsten realen Docker-Inventur, beide Prozesse0
und natürliche Pipe-Enden; keine Datenbank, kein Motor.
[Bereinigter Beleg](belege/v12-native-unit-integration-20261022/NATIVE_OBSERVER_PUMP.SAFE.json).
Ein neuer Einzelunit-Fall muss den aktuellen Code
und einen eigenen einmaligen Vertrag binden; alte Rechte bleiben verbraucht.

Zwei spätere frische Fälle blieben ebenfalls vor Seed und Motor FAIL:
`1315a81d4a9b683cf950c6aaa29b351e` wegen einer falschen physischen
Client-Dateiabbildung (Peak1.049.825.280B) und
`c364b433dc0239e5dbd17b32ba11c4e4` wegen nicht les-/ausführbarer originaler
ELF-Laufzeitdateien für den Root-Prozess ohne Capabilities (Peak1.040.523.264B).
Beide Gruppen sind leer, PostgreSQL endete mit0; die fehlgeschlagenen
Gesamtabschlüsse bleiben FAIL. Keine alten Rechte werden wiederverwendet.

Die korrigierte Startumgebung bestand anschließend im isolierten Fall
`6fea23fd932769d0b2f3de807aa1361d` auf `07707f0f`: sechs bytegleiche öffentliche
ABI-Kopien mit zusammen5.583.888B wurden innerhalb der Messgruppe erstellt.
Originale samt Dateirechten blieben unverändert. Tatsächlicher Original-Python
und Original-Node24.19 mit384/16MiB starteten als UID0 ohne Capabilities und mit
NoNewPrivileges. Beide endeten mit0 und natürlichen Pipe-Enden; Owner/Broker
wurden nur inert importiert. Der normale UID1000-Prozess erhielt beim Zugriff
auf die Root-Datei nachweislich EACCES. Peak51.445.760B, Ereignisse0, Gruppe leer;
keine Datenbank, kein Seed, kein Motor und kein Anbieter.
[Bereinigter Beleg](belege/v12-native-unit-integration-20261022/NATIVE_OWNER_RUNTIME_RX.SAFE.json).

Der folgende frische Fall `0cc5cf133071f851e9bc0fd47f8f1d3c` auf `314b7eb5`
erreichte die echte Owner-/PostgREST-Anbindung, blieb aber vor Seed/Motor FAIL:
Docker gab die exakt gleichen geschlossenen Environment-Einträge in anderer
Reihenfolge zurück. Die Liveprüfung verglich vorher die Arrayreihenfolge.
Der korrigierte Vergleich akzeptiert ausschließlich dieselben eindeutigen Namen
und exakten Werte samt HOSTNAME-Löschmarker; zusätzliche, doppelte oder geänderte
Einträge bleiben gesperrt.90reine Hostprüfungen bestehen. Readonly-Inspect des
fehlgeschlagenen echten Containers bestätigt die reine Reihenfolgeabweichung.
Peak1.055.625.216B/Ereignisse0, Gruppe leer, PostgreSQL0;0Motoreinheiten.
Der fehlgeschlagene Fall bleibt FAIL und wird nicht wiederverwendet.
[Bereinigter Befund](belege/v12-native-unit-integration-20261022/NATIVE_CLIENT_ENV_ORDER_DIAGNOSIS.SAFE.json).

Der nächste frische Fall `b09fb4ec0d2fcfe7eb3d173bdd9a84dd` auf `03a28be5`
bestand die echte HTTP-Vorprüfung einschließlich Exit0 und beider natürlicher
Pipe-Enden. Der Owner-Seed scheiterte anschließend: PostgreSQL meldete eine
mehrdeutige Spaltenreferenz auf den versionierten Ausdruck `p.pronamespace`.
Der Root-DO-Block des Transaktionscompilers verwendete `p` sowohl als lokale
Recordvariable als auch als Katalogalias. Der folgende Triggeralias `t` hatte
dieselbe Kollision. Die enge, unabhängig geprüfte Korrektur benennt nur die
beiden SQL-Aliase um; Quell-, Trigger-, Rechte-, Fristen- und Atomaritätsprüfungen
bleiben bytegleich nach Rückbenennung.29reine Compilerprüfgruppen bestehen,
einschließlich aller vier Schreibarten und Rückmutationen der alten Kollisionen.
Der echte Reader vor dem Seed war erfolgreich; dessen Typprüfung wurde nicht
verändert. Der spätere Hostfehler beim Lesen der inzwischen beendeten Source-PID
war eine Folge des Seedabbruchs. Kein Hostschutz wird deshalb abgeschwächt.
Der Fall bleibt FAIL:0Motoreinheiten, Peak1.124.519.936B/Ereignisse0, Gruppe leer.
Die Seedquittung bleibt unbekannt und wird nicht durch Schlussfolgerungen geheilt;
keine Wiederholung alter Schreibrechte. PGDATA und sämtliche Belege bleiben erhalten.
[Bereinigter Befund](belege/v12-native-unit-integration-20261022/NATIVE_OWNER_SEED_ALIAS_FAILURE.SAFE.json).

Die unabhängige Quellprüfung fand sechs Diagnose-Delegationen hinter nicht
passenden Production-Readinessguards und einen weiteren V3-Eingangsriegel in
`lage.js`. Diese konkreten Anbindungsfehler sind korrigiert und unabhängig
geprüft; Storage16 und Lage13gezielte VM-Prüfgruppen bestehen. Globale Production-Guards,
Tenant-/Subject-/Inputbindungen und das Verbot unbekannter Schreibwiederholungen
bleiben bestehen.

Die anschließende Kostenprüfung fand einen weiteren konkreten Fehler: das
Usage-/Tenant-Vorabgate verwendete im Diagnose-Scope einen Legacy-Reader ohne
die dort absichtlich fehlenden Zugangsschlüssel. Der alte globale Fehlerfallback
würde dabei `allowed:true` liefern. Die unabhängig geprüfte Korrektur liest echte
verifizierte Originalhistory über den nativen Reader und lehnt scoped Fehler
geschlossen ab.32neue VM-Gruppen,67bestehende Budgetassertions sowie16Storage-
und15Originalstore-Gruppen bestehen. Bei Budget-Deny wird kein ticketloser
Usage-Record erzeugt; Lease-Freigabe und Adapter-Fehlerpfad bleiben erreichbar.
[Neuer Quellreview](belege/local-unit-storage-source-20261022/CURRENT_SOURCE_REVIEW_REPORT.SAFE.json).

Die zwei privaten Fixture-Tickets und ihre eigene Mikro-USD-Reserve sind ein
frischer, begrenzter Diagnosevertrag. Sie sind kein Nachweis der alten atomaren
Global-/Tenant-Callreservierung über `llm_budget_counters`. Die16frischen
Diagnose-Kontrollgruppen prüfen Laufzeit/Quellen/Profil/Kalender, die unveränderte
Originalkontrollsicht sowie das eigene Journal und eigene Finanzen. Eine
Gleichsetzung mit sämtlichen Finanz-/Globalzählerprüfungen des vollständigen
500er-Pfads ist damit nicht belegt und bleibt für dessen Admission offen.

## Eingaben, Tests und Messgrenzen

Die echten Originale und548Runtimebindungen sind vorhanden und geprüft. Der
reine Producer bestätigte D bytegleich und ursprüngliches R mit3000/low
bytegleich. Das neue R mit6000/medium ist ein ausdrücklich ausgewiesener
Diagnose-Override. Die UTC-Source-Zeit bewahrt das ursprüngliche Nachrichtendatum;
die echte Laufuhr wird nicht verändert. Ursprüngliche Quellenrichtlinie und
Kostenbindungen bleiben erhalten. Auth30, Unit60 und16frische Kontrollgruppen
bleiben verpflichtend.

Gezielte Offlineprüfungen sichern unter anderem Host73, Controller16 und
Gate-/Entry-/Qualifier133Fälle. Der neue CI-Budgetfehler war eine veraltete
Snapshot-Testerwartung: nur diese wurde an die bereits verbindliche finale
Leerheits-/Inode-Prüfung angepasst. Genau der CI-Schritt besteht lokal mit74
Prüfungen. Die neue Integrationsstufe und der geschützte84Originale-Kanal auf
`82823df1` bestanden in [CI39849065060](https://github.com/ernisch/helmut-pilot/actions/runs/39849065060).
Der Ressourcenstart-Schritt lehnt den veränderten Storage-Code am historischen
Quellreview-Pin korrekt ab. Ein ergänzender neuer unabhängiger Quellreview ist
erforderlich; alte Belege und deren Ablehnung bleiben unverändert erhalten.
Der neue explizite Vier-Quellreview besteht; die gezielte Vertragsprüfung bleibt
zunächst13/14, weil zusätzlich der bereits vorhandene Own2-Hook in
`testkosten-budget.js` einen separaten unabhängigen Quellreview benötigte.
Der vollständige Vergleich aller9Kontrollquellen fand nach den bestehenden
Overrides genau diese eine Restabweichung. Dieser enge Quellreview ist jetzt
abgeschlossen und ausdrücklich gebunden; historischer Tarif-/Budgetkörper
bleibt bytegleich. Die positive Vertragsprüfung samt Fälschungs-/Driftfällen
besteht14/14; Startinput6/6 und Artefakt10/10 bestehen unverändert.
CI39856940435 auf `03a28be5` besteht inzwischen auch den zuvor abgelehnten
Ressourcenstart samt geschütztem84Originale-Kanal und Browserprüfung; der übrige
Lauf ist noch nicht vollständig abgeschlossen. Diese CI ist keine Motorabnahme.
[Kosten-Hook-Review](belege/local-unit-cost-caller-source-20261022/SOURCE_REVIEW.SAFE.json),
[gezielte Vertragsprüfung](belege/v12-native-unit-integration-20261022/CURRENT_SOURCE_CALLER_FINAL_CHECKS.SAFE.json).
Der frühere Standardlauf
blieb177/180; drei gezielte Korrekturen sind separat bestanden, kein behaupteter
durchgehend grüner Wiederholungslauf. Der geschützte84Originale-Kanal bleibt
unverändert obligatorisch. Keine privaten Logs, PGDATA oder Secrets im Git.

Vorab-Hashprüfungen außerhalb der Arbeitsgruppe können gemeinsamen Dateicache
anwärmen. Keine Cachebereinigung, kein erzwungener GC, kein Peakreset. Einzelne
Komponentenpeaks werden nicht addiert. Auch eine erfolgreiche späte Einzelunit
beweist weder500gleichzeitige Profile noch ein Speicherplateau oder500MB Reserve
für den vollständigen Ablauf. Ziel bleibt höchstens1.548.000.000B gemeinsam.

Die gebundene Volladmission verlangt15.179.779.720B persistenten freien Platz.
Nach kontrollierter lokaler Archivierung eigener geschlossener Diagnosekopien
sind nach drei weiteren abgeschlossenen eigenen Codecheckouts rund10,77GB
verfügbar; rund4,41GB fehlen weiterhin. Deren8537Dateien wurden vollständig gegen
Git-Blobs und unabhängige Objektinhalte geprüft; Branches und Commitobjekte
bleiben für den Rückweg erhalten. Tatsächlicher Nettogewinn320.372.736B,
Startmarge für die Einzelunit30.302.208B vor weiteren Dateien. Originale, erforderliche
Belege, aktive/fremde Ressourcen und geheime lokale Archive bleiben erhalten.
Die bekannten weiteren sicheren Kandidaten schließen diese Lücke nicht.
[Bereinigter Cleanupbeleg](belege/v12-native-unit-integration-20261022/OWN_CLOSED_WORKTREE_CLEANUP.SAFE.json).
`/tmp` ist RAM und darf diese Plattenanforderung nicht ersetzen.

Nächster Schritt: frischen einzelnen
nativen Fall bis echter Ergebnis-/Zeit-/Speicher- und Abschlussabnahme führen.
Danach verbleibende CI-/Kapazitäts- und sämtliche32Startbedingungen nachweisen.
Ein vollständiger500er benötigt weiterhin ein neues ausdrückliches konkretes GO.
