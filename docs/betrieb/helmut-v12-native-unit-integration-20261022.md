# V12: native Einzelunit-Anbindung, 22.10.2026

Stand23.10.2026 00:22UTC: teilweise abgeschlossen. Kein erfolgreicher Motorlauf, Unit60-
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

Der frische Fall `3e75aeb1cd927d52745a43994cd2c782` auf `1e5fdfba` bestätigt
den Aliasfix nativ für den Seed: echter Original-CAS und eigener Seed atomar
quittiert, Owner-PSQL Exit0/beide EOFs, genau ein bestätigter Schreibvorgang,
6000historische Usageeinträge und deren Proof erhalten. Der Seed-Node erreichte
ebenfalls Exit0/beide EOFs. Die übrigen drei Schreibarten sind damit noch nicht
nativ geprüft. Der unabhängige zusätzliche Seedreadback wurde nicht erreicht:
zuvor überschritt HOST_OBSERVE die feste3s-Antwortfrist. Der Host nimmt diese
Anfrage bisher erst nach einer kompletten Beobachtung an und beantwortet sie
nach einer weiteren. Der separat geprüfte Plan zieht ausschließlich deren
Annahme vor die frische Beobachtung desselben Zyklus; keine Fristverlängerung,
kein alter Snapshot als Ersatz. Der Gesamtfall bleibt FAIL, Motor0,
Peak1.127.194.624B/Ereignisse0, Gruppe leer, PostgreSQL0; kein Zeit-/Reservebeleg.
Die ursprünglichen finalen Workerflags meldeten Originalschutz nicht bestätigt.
Der anschließend notwendige unabhängige FD-stabile Lesecheck bestätigte den
OriginalRAW-Hash und alle432Sourcepins erneut. Die konkrete Ursache der falschen
Defaultflags wurde nicht persistiert und wird nicht als bekannt ausgegeben.
Positive Seedkopie und Belege bleiben erhalten, alte Rechte werden nicht erneut
verwendet. [Bereinigter Befund](belege/v12-native-unit-integration-20261022/NATIVE_POSITIVE_SEED_HOST_OBSERVATION_FAILURE.SAFE.json).

Der enge Hostfix ist jetzt integriert und unabhängig geprüft: ausschließlich
HOST_OBSERVE wird ohne ausstehende Anfrage in QUALIFIED/ENTRY/DONE vor der
vollständigen frischen Inventur angenommen und im selben Zyklus beantwortet.
Alle anderen Stufen und die festen3s-Grenzen bleiben erhalten.95reine
Hostprüfgruppen bestehen. Kein alter Snapshot wird umdatiert oder ersetzt.
Später während der Inventur eintreffende Anfragen können weiterhin einen
Folgezyklus benötigen; die native Antwortfrist bleibt erneut nachzuweisen.
[Quellreview](belege/v12-native-unit-integration-20261022/HOST_OBSERVE_SAME_TICK_SOURCE_REVIEW.SAFE.json).

Der folgende Fall `93e1bd82b2594baab389976d4867e124` auf `eb141aef` blieb erneut
vorMotor an derselben3s-HOST_OBSERVE-Antwort FAIL. Seed und Historyschutz waren
erneut nativ bestätigt. Ein echter Beobachterabschluss lag innerhalb der Frist;
die Antwort fehlte dennoch. Der genaue frühe Intakezeitpunkt wurde nicht
persistiert. Der Early-Intakefix genügt damit nicht für die native Zeitabnahme.
Peak1.125.826.560B/Ereignisse0, Kernelgruppe leer, PostgreSQL0; weiterhin kein
Unit60-/Reservenachweis. OriginalRAW und432Sourcepins anschließend frisch
FD-stabil unverändert geprüft. Die geänderte COPY-Authrow ist das erwartete
Seedergebnis; ein geerbtes originalAuthRowUnchanged-Feld belegt keinen Postseedhash.
Nach zwei gleichen Fehlschlägen erfolgt kein weiterer gleicher Einzelunitstart:
zuerst geteilter enger Antwortkern und getrennte echte Host-Transportvorprüfung,
ohne PG/Seed/Motor/Authority. Kein alter Snapshot, keine neue Datierung und keine
Fristlockerung. [Bereinigter Befund](belege/v12-native-unit-integration-20261022/NATIVE_EARLY_INTAKE_INSUFFICIENT.SAFE.json).

Der folgende enge Umbau auf `ab0da987` verwendet einen gemeinsamen Antwortkern:
auch spät im Zyklus angenommene HOST_OBSERVE-Anfragen werden mit der tatsächlich
abgeschlossenen frischen Probe beantwortet. Originalanfrage, unveränderte
Probenzeit und Frist werden unmittelbar vor dem atomaren No-overwrite-Publish
erneut geprüft.101reine Hostgruppen und unabhängiger Quellreview bestehen.
[Quellreview](belege/v12-native-unit-integration-20261022/HOST_OBSERVE_LATE_REPLY_SOURCE_REVIEW.SAFE.json).
Die getrennte echte Transportprüfung im Fall `149b4a9222a8ffd79f64467c4e902a8a`
bestand anschließend: frühe Anfrage2,406s, Anfrage nach Probenstart2,133s und
Replayfall2,335s, jeweils innerhalb der unveränderten3s. Veraltete und abgelaufene
Anfragen bleiben ohne Antwort versiegelt; ein Replay überschreibt die erste
Antwort nicht. Peak37.130.240B, alle Speicherereignisse0, Gruppe bis zum letzten
Exit leer. Source und vier echte Beobachter endeten mit0/beiden natürlichen
Pipe-Enden; alle fünf lokalen Handles sind tatsächlich gereapt, kein Stop nötig.
Der Fall nutzt748einzeln gepinnte öffentliche Pythondateien und553weitere
Laufzeitbindungen. Ein vorangehender reiner Preflightfehler verwarf gültiges
`reuseExisting:false`; der Typcheck akzeptiert jetzt ausschließlich echte
Booleanwerte oder Abwesenheit, Readonly bleibt zwingend. Kein Original geändert.
Diese Prüfung startet keine Datenbank, keinen Seed oder Motor und verbraucht
keinen Unitclaim. Sie qualifiziert weder Production-Stufen noch Owner,
SourceService, Unit60 oder die500er-Reserve. Der Midfall misst Anfrage nach
echtem Probenstartmarker und vor vollständiger Inventur, keine Ankunft während
eines bereits laufenden Docker-Popen. Der unabhängige Readonly-Review bestätigt
Driver/Input/Code-/Framepins, echte Abschlüsse und die frisch leere Gruppe.
[Nativer Transportbeleg](belege/v12-native-unit-integration-20261022/NATIVE_HOST_OBSERVE_TRANSPORT.SAFE.json).

Eine zusätzliche Lücke im Fehlerabschluss ist eng korrigiert: früher verdeckte
ein bereits vorhandener Primärfehler die Exception der abschließenden RAW- oder
Quellenprüfung. Der Worker bewahrt jetzt einen festen privaten600/OEXCL-Beleg
mit Prüfphase, Quellenindex, bestätigter Anzahl und begrenzten Stackmetadaten.
Keine Exceptiontexte, Locals oder Nutzdaten werden ausgegeben. Scheitern Beleg
und Stderr, bleiben Primärfehler und Abschlussberechnung erhalten; keine
Erfolgsheilung. Originalpinprüfungen, Reihenfolge, Cleanup und Annahmebedingungen
bleiben unverändert.7gezielte reine AST-Tests bestehen. Der konkrete frühere
RAW-Finalfehler bleibt unbekannt; diese Änderung ersetzt keinen Originalnachweis.

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

## Erster echter Einstieg und gezielte Korrekturen

Der frische Fall `ab1710f35604f238202f253063e8b957` auf `c7a92798` erreichte
am22.10. ab22:33UTC die native HTTP-Kette, Adapter und eigenen Claim. Die erste
Kontrolle `unit-enter` scheiterte vor Lage und D/R-Erzeugung: gespeicherte
Richtlinienwerte waren identisch, allein die Reihenfolge der drei JSON-Schlüssel
unterschied sich. Keine nachgewiesene Tages-/TTL-Drift. Der Gesamtfall bleibtFAIL;
die Zahl vollständiger Motoraufrufe ist unbekannt. Der bisherige Workerwert0
stammte aus der Vorbereitung und war kein tatsächlicher Ausführungszähler.

`1a24a9f1` vergleicht die exakt erlaubten drei skalaren Felder statt der
JSON-Schlüsselreihenfolge. Sechs Reihenfolgen werden akzeptiert; fehlende,
zusätzliche, geänderte und falsch typisierte Felder bleiben gesperrt.14gezielte
Testgruppen und unabhängige QuellprüfungPASS. Der tatsächliche aktuelle
Verbraucher akzeptiert außerdem beide unveränderten erhaltenen DTOs; acht
inhaltliche Drifts werden abgelehnt. Keine Mutation oder native Motorabnahme
wird daraus abgeleitet. CPU-/Releasepins wurden ausschließlich für diese geprüfte
Quelle und das daraus folgende CPU-Mapping aktualisiert, historische Stände
bytegleich gesichert. Die bestehende Runtimeartefaktprüfung besteht10/10.
[Quellreview](belege/v12-native-unit-integration-20261022/PUBLICATION_RECORDED_ORDER_SOURCE_REVIEW.SAFE.json),
[echte gespeicherte DTOs](belege/v12-native-unit-integration-20261022/PUBLICATION_REAL_STORED_DTO_CHECK.SAFE.json).

Ein zweiter Fehler betraf den Fehlerbeleg: der tatsächliche Artifactcompiler
braucht `xmin` zur Revisionsprüfung, der isolierte NOLOGIN-Writer hatte dieses
Spaltenleserecht nicht. Das private PostgreSQL-Protokoll belegt eine verweigerte
Tabellenlesung; die genaue einzelne SQL-Anweisung ist dort nicht erhalten.
Die Korrektur ergänzt ausschließlich `SELECT(xmin)` auf den beiden benötigten
COPY-Tabellen. Keine pauschale Tabellenlesung, keine Runtime-Rechteänderung und
kein Wegfall der Revisionsprüfung. Eine neue echte Writer-Vorprobe läuft in einer
Readonly-Transaktion mit RLS vor dem Motor; verbotene Zeit-/xmax-Spalten müssen
explizit42501 liefern. Fehlende Spalten oder andere Fehler bleibenFAIL.21reine
Tests und zwei unabhängige QuellreviewsPASS; die native Bestätigung steht aus.
Der historische `executedNegativeChecks`-Zähler umfasst weiterhin die bisherigen
Runtime-/Receiptproben und zählt die neuen Writer-Verweigerungen nicht hinzu.
[Enger Writerreview](belege/v12-native-unit-integration-20261022/WRITER_XMIN_SOURCE_REVIEW.SAFE.json).

Der Worker übernimmt Ausführungszähler jetzt nur aus einer tatsächlich
zurückgekehrten frischen Bindingqualifikation. Bei angefordertem Einstieg und
Abbruch bleibt der Wert unbekannt/null.10gezielte reine Tests und unabhängige
QuellprüfungPASS; kein zusätzlicher Motorstart.
[Zählerreview](belege/v12-native-unit-integration-20261022/WORKER_UNKNOWN_COUNT_SOURCE_REVIEW.SAFE.json).

ab17 misst1.231.241.216B gemeinsamen Peak, alle Speicherereignisse0, PostgreSQL0
und vollständige letzte Exitabdeckung; dies ist wegen FAIL kein Reservebeweis.
Alle48Hosthandles haben beide natürlichen Pipe-Enden, aber Owner1 und Entry137;
Hostabschluss ausdrücklich unsauber. Der äußere CLI-Status ging beim temporären
Cloud-Reconnect verloren und bleibt unbekannt. Die Beobachtungsquittung fehlt,
nachdem der Originalservice im Fehlerpfad endete; daraus ist kein weiterer
Host-/Updaterfehler belegt. Keine Fristverlängerung oder automatische Wiederholung.
Der neue Abschlussbeleg lokalisiert eine signalbedingte Unterbrechung der finalen
RAW-Prüfung; alte Fälle werden dadurch nicht nachträglich erklärt. Anschließende
unabhängige Prüfung vor weiteren Codeänderungen bestätigt RAW und alle432
Quellpins unverändert sowie die weiterhin gestoppte Originaldatenbank. Historische
Codepins ändern sich danach gezielt durch die oben dokumentierten Korrekturen.
[Bereinigter Fallbefund](belege/v12-native-unit-integration-20261022/NATIVE_ENTRY_POLICY_AND_WRITER_FAILURE.SAFE.json).

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
blieb177/180; drei gezielte Korrekturen sind separat bestanden. Kein durchgehend
grüner Wiederholungslauf wird daraus abgeleitet.
Der neue CI-Lauf39859073760 auf `1e5fdfba` scheitert im Standard-Offlinelauf.
Ein lokal sicher reproduzierbarer Fehler ist die überschrittene Statusgröße:
31.076Zeichen am CI-Commit statt maximal30.000. Der vollständige alte Status
ist bytegleich archiviert; die kompakte aktuelle Fassung besteht4/4Größenchecks.
Die vollständige CI-Freigabe bleibt bis zum neuen erfolgreichen Lauf offen.
CI39863022179 auf `ab0da987` ist insgesamtFAIL: Standard-Offlinelauf, native
Offline-Integration, geschützter84Originale-Kanal und BrowserprüfungPASS; die
anschließende BereichsregressionFAIL. Deren private Diagnose liegt ausschließlich
verschlüsselt vor; der genaue fehlgeschlagene Fachtest ist noch nicht belegt.
Der abschließende Z22-Schritt wurde danach nicht ausgeführt.
Der geschützte84Originale-Kanal bleibt
unverändert obligatorisch. Keine privaten Logs, PGDATA oder Secrets im Git.

Vorab-Hashprüfungen außerhalb der Arbeitsgruppe können gemeinsamen Dateicache
anwärmen. Keine Cachebereinigung, kein erzwungener GC, kein Peakreset. Einzelne
Komponentenpeaks werden nicht addiert. Auch eine erfolgreiche späte Einzelunit
beweist weder500gleichzeitige Profile noch ein Speicherplateau oder500MB Reserve
für den vollständigen Ablauf. Ziel bleibt höchstens1.548.000.000B gemeinsam.

Die gebundene Volladmission verlangt15.179.779.720B persistenten freien Platz.
Eine erste Serie von drei abgeschlossenen eigenen Codecheckouts brachte nach
vollständiger Prüfung von8537Dateien netto320.372.736B zusätzlichen Platz.
Der folgende geschützte positive Seedfall belegt erneut etwa0,41GB.
Vier weitere eindeutig eigene abgeschlossene Checkouts sind inzwischen
kontrolliert entfernt:11.405Dateien gegen erhaltene Git-Blobs geprüft,45Refs
erhalten, zwei regenerierbare PYC-Dateien aus Quellen bytegleich rekonstruiert.
Diese zweite Serie brachte netto396.722.176B. Nach dem folgenden Diagnosefall
wurden ausschließlich die beiden abgeschlossenen eigenen COPY-Verzeichnisse
von b09/3e75 entfernt: beide zuvor privat lokal archiviert, vollständig
zurückgelesen und in frische Verzeichnisse byte-/metadatengleich wiederhergestellt.
Root prüfte14Sicherungs-/Restorepins unabhängig.288Case-Dateien bleiben
unverändert, beide Archive und sämtliche Originale/93 erhalten; kein alter
Claim wird geöffnet. Erwartete Metadatenänderungen der Case-Eltern sind erfasst.
Netto bringt diese Löschserie744.091.648B, einschließlich Archivkosten492.445.696B.
Danach tatsächlich frei10.831.294.464B:93.876.224B über der10GiB-Einzelunitgrenze,
zur Volladmission fehlen4.348.485.256B. Weitere Diagnosebelege reduzieren den
aktuellen freien Platz geringfügig. Die geheimen Archive bleiben ausschließlich
lokal; der Rückweg erstellt ein neues Verzeichnis und gewährt keine Laufrechte.
[Sicherungs-/Cleanupbeleg](belege/v12-native-unit-integration-20261022/VERIFIED_PRIVATE_COPY_CLEANUP.SAFE.json).
Die untersuchten alten Docker-Volumes sind tmpfs und bieten keinen belegten
Plattengewinn. [Cleanupbeleg](belege/v12-native-unit-integration-20261022/FOUR_CLOSED_WORKTREE_CLEANUP.SAFE.json).
Originale, erforderliche Belege, aktive/fremde Ressourcen und geheime lokale
Archive bleiben erhalten; Branches und Gitobjekte sichern die Code-Rückwege.
Die bekannten weiteren sicheren Kandidaten schließen diese Lücke nicht.
[Bereinigter Cleanupbeleg](belege/v12-native-unit-integration-20261022/OWN_CLOSED_WORKTREE_CLEANUP.SAFE.json).
`/tmp` ist RAM und darf diese Plattenanforderung nicht ersetzen.

Der achte abgeschlossene eigene Checkout ist nach vollständigem frischem
Git-Blob-/Hashvergleich aller2905Dateien kontrolliert entfernt. Der Branch und
Commit394e75a7 sowie alle Gitobjekte bleiben erhalten; Rootzustand und sämtliche
Branchrefs sind unverändert. Gemessene statvfs-Fensterfreigabe109.383.680B,
einschließlich möglicher Verwaltungs-/gleichzeitiger Belegallokation. Es gibt
keine beobachtete aktive Bindung; eingeschränkte fremde Proc-FD-Sicht wird
weiterhin ausdrücklich nicht als vollständige Abwesenheit ausgegeben.
[Checkoutbeleg](belege/v12-native-unit-integration-20261022/EIGHTH_CLOSED_WORKTREE_CLEANUP.SAFE.json).

Auch der abgeschlossene93-Zustand ist nun vollständig privat lokal gesichert:
1748Dateien/30Verzeichnisse/372.922.203B, Archiv123.369.815B. Alle1778Member
wurden zurückgelesen und eine frische vollständige Wiederherstellung byte- und
metadatengleich geprüft. Root verifizierte8Pins einschließlich des Archivs
FD-stabil sowie sämtliche Manifest-/Restore-Berichtszeilen unabhängig. Der erste
Schutzvergleich scheiterte an wechselnder Docker-Mountreihenfolge; dieser FAIL
bleibt erhalten. Die separate Nachqualifikation vergleicht vollständige Einträge
mit eindeutigen Destinationen und unverändertem Datenbankzustand, nicht nur Pfade.
Erst danach wurden beide entpackten Formen in zwei getrennten Aufrufen mit
frischen Schutz-/Rückwegbelegen und exakten Dirfd-/Inodeprüfungen entfernt.
144Casebelege, Archiv, Wiederherstellungsnachweise, Originaldatenbank/RAW und der
jüngsteab17-Zustand bleiben erhalten; leere0700Eltern bleiben. Das Archiv enthält
lokale Testsecrets und darf nicht exportiert werden. Keine DB gestartet,
keine alten Claims wiederverwendet. Tatsächlich frei10.758.008.832B:
20.590.592B über der unveränderten10GiB-Einzelunitgrenze; zur Volladmission
fehlen4.421.770.888B. Belegallokationen reduzieren diese knappe Margin geringfügig.
[Archiv-/Entfernungsbeleg](belege/v12-native-unit-integration-20261022/THIRD_COPY_CLEANUP_FINAL.SAFE.json).

Die bislang nicht sichtbaren Namen fehlgeschlagener CI-Fachtests werden künftig
nur im Bereichsschritt als streng begrenzte öffentliche Metadaten ausgegeben:
versionierter Testbasename und Exitcode. Rohzeilen, freie Fehlermeldungen,
private Inhalte und Secrets bleiben verborgen; Testauswahl, Child-Exit und
Verschlüsselung bleiben unverändert.14gezielte Checks und unabhängiger
QuellreviewPASS, kein erneuter335er-Lokallauf. Der genaue Fachtest des alten
CI-FAIL bleibt unbekannt. CI39868819326 aufa18 endet ebenfalls mit Bereichs-FAIL bei bestandenem
Standardlauf; eine neue vollständige CI mit dem Metadatenpatch ist noch nicht belegt.
[CI-Metadatenreview](belege/v12-native-unit-integration-20261022/PRIVATE_CI_SUITE_METADATA_SOURCE_REVIEW.SAFE.json).

## Frischer Einzelunit-Fall48: Writerrechte bestanden, Quellenlesen fehlgeschlagen

Fall `48b9e0f35075611fb46ea1d7bf703d08` auf `739a22dc` hat die enge Writer-
Vorprüfung nativ bestanden: zwei gleiche Katalogläufe mit tatsächlichem PSQL-
Exit0/beiden EOFs, vier positive Writer-Spalten-/xmin-Leseproben und acht neue
42501-Verweigerungen. Die bisherigen20Negativproben bleiben gesondert gezählt.
Writer bleibt NOLOGIN/NOINHERIT ohne Mitgliedschaft, Table-SELECT oder BYPASSRLS;
RLS bleibt aktiv. Dies belegt Lesevoraussetzungen, keine vollständige positive
Artifact-Schreibtransaktion. Der frühere falsche Richtlinienalarm tritt nicht auf.

Der echte HTTP-/Adapterpfad scheitert23:25:29.166UTC mit
`publication-eligibility-source-read-unavailable`;11,307s Adapterdauer eines
Fehlversuchs sind kein Unit60-Nachweis. Später fällt der Owner vor sauberem
Abschluss aus. Alle47echten Observer beenden sich mit0/beiden natürlichen EOFs,
Owner und Entry jeweils mit1/beiden EOFs. ENTRY_RESULT war angefordert; es gibt
keinen erneuten HOST_OBSERVE-Timeout. Der Owner bewahrt das tatsächliche REST-
Abbruchsignal und den ersten internen Fehler bisher nicht auf; diese Ursache
bleibt offen. Unbegründete Lockerungen von Sperren, Fristen und Abschlussregeln
folgen daraus nicht. Die vollständige Quellenidentitätslesung besitzt bereits
einen nativen generischen GET-Pfad; eine fehlende Route ist bisher nicht belegt.

Der äußere CLI-Exit1 und beide natürlichen EOFs sind diesmal dauerhaft erfasst,
ohne äußeren Timeout oder Zwangssignal. Die Quellpins und der saubere gebundene
Commit sind vor/nach identisch; ein positiver nativer Abschluss wird daraus nicht
abgeleitet. RAW,432Quellen und Originalauth blieben im tatsächlichen Worker-
Abschluss unverändert. Der frühere unbekannte CLI-Abschluss vonab17 bleibt offen.

Gemeinsamer Peak1.248.223.232B, alle Speicherereignisse0, nach letztem Prozessende
leere Gruppe/PostgreSQL0. Der fehlgeschlagene Fall beweist weder die500MB-Reserve
noch Unit60/Auth30, Ergebnisqualität oder ein500er-Plateau. Unbekannter Motorumfang
bleibt `null`; Vorprüfungen können den gemeinsamen Cache erwärmen.
[Bereinigter Fehler-/CLI-Beleg](belege/v12-native-unit-integration-20261022/NATIVE_48_SINGLE_FAILURE.SAFE.json).

Nach diesem Fall tatsächlich frei10.341.294.080B:396.124.160B unter der10GiB-
Einzelunitadmission,4.838.485.640B unter der Volladmission.48undab17 bleiben
unverändert erhalten. Redundante verschlüsselte Transferteile könnten bis zu
712.458.240B liefern, aber nur nach frischer Hash-/Bindungs-/Rückwegprüfung;
der vollständige Cipher samt Belegen bleibt geschützt. Diese mögliche Freigabe
schließt die spätere Volladmissionslücke nicht.

Nächster Schritt: den echten Quellenlesefehler und den Ownerabschluss gezielt
klären, fehlende private Abbruchdiagnostik schließen und sichere Kapazität
herstellen. Erst mit konkreter Korrektur bzw. begründeter kleinster Diagnose
weiterarbeiten; keine unveränderte Wiederholung des ganzen Einzelunitfalls.
Danach vollständige einzelne Motorabnahme und verbleibende CI-/Kapazitäts- sowie
sämtliche32Startbedingungen nachweisen. Ein vollständiger500er benötigt weiterhin
ein neues ausdrückliches konkretes GO.


## Enger Quellenlesevertrag und Vorprüfung vor Seed

Der erhaltene48-OWNER_START-Handoff enthält exakt dieselbe vierteilige
Tabellenliste wie die native ReadClosure; `ko_document_links` fehlt. Der echte
Publication-Consumer fordert genau diese Tabelle mit `raw_documents`-Einbettung
an. Der Broker verweigert sie vor seinem Trace/Upstream mit
`qualified-table-read`. Damit ist der Vertragskonflikt durch gebundenen Frame
und Quellpfad belegt; eine separat aufgezeichnete zurückgewiesene HTTP-Antwort
liegt im alten Fall nicht vor. Der spätere REST-Abbruch bleibt separat offen.

Die lokale Korrektur gewährt nur SELECT auf `knowledge_object_id` und
`raw_document_id` für die ausgewählten KOs. Die bisherigen sieben Grants und
die Raw-Dokumentauswahl bleiben unverändert. Privilegierte Guards müssen vor/
nach Installation und frisch danach sämtliche echten Verknüpfungen innerhalb
der ausgewählten Originaldokumente sowie ursprüngliche PK/FKs/Typen beweisen.
Fehlende Abdeckung stoppt vor dem Motor; kein Link wird still ausgeblendet.
Die tatsächliche Runtime muss den vollständigen Join gegen eine privilegiert
ermittelte Baseline erfüllen. Neue erwartete native Zählung:40Negativproben,
57Gesamtproben.22Puretests und zwei QuellreviewsPASS; SQL/Abdeckung sind damit
noch nicht nativ bestanden. Die Transaktion bleibt READ COMMITTED; kein
zeitübergreifender RepeatableRead-Snapshot wird behauptet.
[Quellreview](belege/v12-native-unit-integration-20261022/PUBLICATION_LINK_READ_CLOSURE_SOURCE_REVIEW.SAFE.json).
[Vorher nativ bestätigte Writer-Lesevoraussetzungen](belege/v12-native-unit-integration-20261022/NATIVE_48_WRITER_READ_PREREQUISITE.SAFE.json).

Im bestehenden CLIENT_QUALIFY-Schritt wird zusätzlich der unveränderte echte
Storage-Consumer über signierte GETs verlangt. Die privaten KO-IDs stammen aus
dem gesamten hashgebundenen Command; der Consumer führt seine vollständige
Pagination und Datenprüfung selbst durch. Erst tatsächlicher CLI0-Abschluss mit
beiden natürlichen EOFs und gebundener Readquittung erlaubt Source-Authority
und Seed. Probehash und Counts belegen die Eingangsbindung und den Lesepfad,
keine Ergebnis-/Produktabnahme. Controller20Purechecks und Endpoint76VMchecks
mit echtem Storage-/Publication-Code sowie zwei QuellreviewsPASS. Die tatsächliche
SQL-/HTTP-Wirkung bleibt vor einem frischen Fall offen. Diese Vorprüfung kann
Cache wärmen; sie ist kein Coldcache- oder Zeitoptimierungsbeweis.
Die neue Pythonabhängigkeit `unicodedata` wurde am unveränderten Original-
Interpreter tatsächlich als Builtin festgestellt, ohne sie zu importieren;
eine zusätzliche SO-Datei wird dafür nicht benötigt.
[Consumer-/Einbindungsreview](belege/v12-native-unit-integration-20261022/PRESEED_PUBLICATION_CONSUMER_SOURCE_REVIEW.SAFE.json).

Der Owner bewahrt nun das tatsächliche REST-Exit-Signal, die erste feste
Fehlerursache samt UTC/monotonem Zeitpunkt, Abschlussabsicht und geprüfte
Signalversuche. Rohlogs gelangen ausschließlich in den bereits begrenzten
privaten Host-Capture.128KiB-Grenze, Fristen, erlaubte Exits und natürliche EOF-
Pflichten bleiben erhalten; unbekanntes oder unvollständiges Forwarding ist FAIL.
58VM-Prüfgruppen und unabhängiger RootreviewPASS, keine native Erfolgsabnahme.
[Ownerreview](belege/v12-native-unit-integration-20261022/OWNER_PRIVATE_FAILURE_DIAGNOSTICS_SOURCE_REVIEW.SAFE.json).

## Tatsächliche weitere Freigabe von Plattenplatz

Nach vollständiger frischer SHA-/Inode-/Bindungsprüfung wurden exakt30eigene
redundante Cipherparts entfernt:15Originalsplit-Kopien und15zurückgeladene
Verifikationskopien. Beide vollständigen Reassemblies entsprechen dem erhaltenen
Gesamtcipher; dessen beide Hardlinknamen sowie sämtliche Belege bleiben erhalten.
Der Rückweg liest die exakten ursprünglichen24MiB-Segmentbereiche und prüft die
jeweiligen Hashes; Schlüssel oder Entschlüsselung sind dafür nicht erforderlich.
Keine Originale, PGDATA, Gitdateien oder übrigen Attachmentinhalte entfernt.
Die Schutzprüfung bewahrt frühere FAILs; vorhandene GPG-Sockets und die leere
0555Git-Sandboxgrenze sind ausdrücklich erfasst. Fremde FD-Sicht bleibt begrenzt.

Root las den vollständigen once-only-Helper, prüfte alle Belegpins und gab allein
diese30Dateien frei. Ein paralleler Schreiber pausierte für den unveränderten
Git-Vor-/Nachvergleich. Tatsächlicher Helperexit0,30Pfade unabhängig abwesend,
alle16Eltern erhalten, Gesamtcipher nach Löschung frisch gehasht. SourceDB-State
und sämtliche Mounts sind vor/nach exakt gleich: gestoppt255/PID0.
Gemessener Nettofreigabezeitraum712.437.760B; bei Root-Rückprüfung11.053.436.928B
frei:316.018.688B über Einzelunitadmission,4.126.342.792B fehlen zur Volladmission.
Weitere Belege verbrauchen geringe Kapazität; die Volladmission bleibt blockiert.
[Bereinigter Cleanupbeleg](belege/v12-native-unit-integration-20261022/REDUNDANT_CIPHER_PARTS_CLEANUP.SAFE.json).

Der Wechsel auf23.10.UTC erzeugt im nativen Einzelunitpfad einen neuen aktuellen
Ausführungstag und ein neues kurzes Fenster. Original-Quelltag21/Quelldaten werden
nicht umgeschrieben. Das ersetzt weder den gesonderten Full500-Kalendervertrag
noch ein neues konkretes GO/32frische Startbedingungen.

## 23.10.: Quellenanbindung nativ bestätigt; nächster Schreibfehler eingegrenzt

Der frische, einmalige Fall `f51940617fbf03e755af52ce41e60bab` bindet den sauberen
Commit `8dd83ba762de381c193e31aa688a6faca90132ef`. Die neue ReadClosure besteht
tatsächlich40Negativ- und57Gesamtproben. Der unveränderte Publication-Consumer
liest vor Seed über2signierte echte GETs6KOs mit7Dokumentidentitäten erfolgreich.
Dies schließt den vorherigen engen Quellenleseblocker; Cachewärme bleibt Teil
der Diagnosebedingungen. Kein alter Fall oder verbrauchtes Laufrecht wurde wiederholt.

Danach bleibt die Einzelunit FAIL. Der siebte Original-Service-psql endet mit
Exit3 und beiden natürlichen EOFs; die ersten sechs enden bestätigt0. Das
erhaltene PostgreSQL-Log enthält genau einen Fehler um00:10:37.199UTC:
fehlendes Leserecht für `briefings`. Die Quellprüfung zeigt einen konkreten
Rechtekonflikt: Der unveränderte atomare Artifact-Receipt liest als SECURITY
INVOKER unter Runtime `briefings.xmin`; bisher erhält nur Writer dieses
Spaltenrecht. Der alte LIMIT0-Vorabcheck prüft ausschließlich Writer. Die
einzelne fehlgeschlagene SQL-Expression oder Rolle ist nicht direkt geloggt;
der Quellkonflikt ist mit dem echten Tabellenfehler konsistent. Nur diesen
engen Runtime-Leseumfang samt authenticator→Runtime-Vorprobe korrigieren;
RLS, fremde Spalten, Schreibsperren und atomare Bestätigungen erhalten.

Entry meldet um00:10:37.220UTC einen Fehler nach44,095s Adapterzeit. Service-
STOP, Owner-Fehler und Host-Abbruch folgen danach. Der Owner protokolliert nun
tatsächlich SIGTERM-Versuch und späteres REST-Exit-Signal SIGINT. Die privaten
REST-Logs enthalten nur Start-/Verbindungsmeldungen. Ein spontaner primärer
REST-Fehler ist daraus nicht belegt; der Abschluss bleibt FAIL. Ein individueller
Service-Node-Exit0 mit beiden EOFs ist ebenfalls nicht nachgewiesen. Keine
Lockerung der Abschlussregeln aus diesen Folgemeldungen ableiten.

Die äußere CLI endet tatsächlich1 mit beiden natürlichen EOFs, ohne äußeren
Timeout/Zwangssignale. Gemeinsamer Peak1.340.301.312B, alle Speicherereignisse0,
PostgreSQL0 und Gruppe bis letztem Exit leer. Rechnerisch707.698.688B Abstand
zur harten Grenze sind wegen des Fehlers kein500MB-Puffernachweis. Unit60,
Auth30, vollständige Ergebnisse und500er-Plateau bleiben offen; Motorumfang null.
RAW,432Quellen und Originalauth bestehen die vollständige Worker-Finalprüfung.
Frisch sind432Source-/403Code-/553Runtimepfade und Größen sowie unveränderter
SourceDB-State/Mounts bestätigt; keine unnötige zweite2GB-Inhaltsprüfung.
[Bereinigter Fehlerbeleg](belege/v12-native-unit-integration-20261022/NATIVE_F519_SINGLE_FAILURE.SAFE.json).

Frei10.635.939.840B:101.478.400B fehlen zur10GiB-Einzelunitadmission und
4.543.839.880B zur Volladmission. f519/48/ab17-PGDATA und sämtliche Belege bleiben
geschützt. Vor jeder weiteren Bereinigung sind Umfang, Schutz und belegter
Rückweg erforderlich. Kein neuer unveränderter Einzelunitversuch.

CI39872884548 auf72e4db67 ist tatsächlich abgeschlossen: Standard-Offlinesuiten,
SQL-Nachweise, geschützter84Originale-Kanal und Browser erfolgreich; Bereichs-
Regression fehlgeschlagen. Die neue geschlossene öffentliche Metadatenzeile
benennt `profilhash-integration-test.js` und
`testnachweis-synthetik-quellen-id-test.js`, jeweils Exit1. Jetzt nur diese
realen Fehler untersuchen; kein erneuter breiter Offline-Lauf auf Verdacht.
Z22 wurde nach dem Fehler übersprungen und bleibt ohne neuen Nachweis. App403
bleibt separat offen. Kein vollständiger500er ohne neues konkretes GO.

Die Runtime-Korrektur ist lokal umgesetzt und zweifach im Quellcode geprüft:
einziges zusätzliches Recht `briefings.SELECT(xmin)`, weiterhin kein Tabellen-
SELECT und keine Runtime-Schreibrechte. Der effektive unveränderte ReadClosure-
Tabellengrant auf `helmut_store` deckt dessen xmin bereits ab; kein zusätzlicher
Grant dort. Der neue tatsächliche authenticator→Runtime-Vorabcheck liest beide
Receipt-Spaltensätze mit LIMIT0, prüft RLS/Nichtbesitz und weist verbotene
Briefingsspalten mit42501 zurück. Die zusätzliche Update-Negativprobe läuft
ausdrücklich in der schreibfähigen Probe-Transaktion, damit kein READONLY-Fehler
einen fehlenden Rechtefehler kaschiert. Katalogzähler11jeBatch/22gesamt statt
historisch20;4neue readonly42501- und8bestehende Writer42501-Proben separat.
Alle neun Helper-Bodies, Compiler, StoreDDL und atomare Bestätigungen unverändert.
25Puretests auf finalen Bytes mit geschlossenem Env und separat beobachtetem
Exit0 bestätigt. Ein früher kombinierter Shellaufruf lieferte keinen separaten
Unittest-Exit; genau diese Beleglücke begründete den finalen einzelnen Lauf.
LIMIT0 ist kein tatsächlicher Row-/Receipt-/Commit-PASS. Die neue native
Ausführung bleibt bis sicherer Kapazität und frischer vollständiger Bindung offen.
[Enger Quellreview](belege/v12-native-unit-integration-20261022/RUNTIME_RECEIPT_XMIN_SOURCE_REVIEW.SAFE.json).

Die zwei nun konkret bekannten CI-Fehler wurden ausschließlich in ihren
Testkontexten korrigiert: Die extrahierten echten Storage-Consumer erhalten die
fehlende echte Diagnose-Storefactory mit expliziter Inaktivitätsprüfung. Alle
bisherigen Assertions und Produktdateien bleiben unverändert. Je einmal gezielt
unter geschlossenem Env, lokalem Schutz und Offline-Preload geprüft: Profilhash
18/18 und Quellen-ID29/29, jeweils tatsächlicher Exit0. Root-DiffreviewPASS;
keine335Suiten-Wiederholung. Ein neuer grüner GitHub-Gesamtlauf auf dem Fixcommit
ist noch erforderlich und wird nicht aus diesen lokalen Teilprüfungen abgeleitet.
[CI-Fehler und Reparatur](belege/v12-native-unit-integration-20261022/CI_TWO_READER_CONTEXT_REPAIR.SAFE.json).
