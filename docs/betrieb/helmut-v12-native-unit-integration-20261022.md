# V12: native Einzelunit-Anbindung, 22.10.2026

Stand23:16UTC: teilweise abgeschlossen. Kein erfolgreicher Motorlauf, Unit60-
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
CI-FAIL bleibt unbekannt. CI39868819326 aufa18 läuft noch; eine neue vollständige
CI mit dem Metadatenpatch ist noch nicht belegt.
[CI-Metadatenreview](belege/v12-native-unit-integration-20261022/PRIVATE_CI_SUITE_METADATA_SOURCE_REVIEW.SAFE.json).

Nächster Schritt: enges Writerrecht nativ bestätigen und ausreichende sichere
Kapazität herstellen, dann einen neuen einzelnen nativen Fall bis echter
Ergebnis-/Zeit-/Speicher- und Abschlussabnahme führen.
Danach verbleibende CI-/Kapazitäts- und sämtliche32Startbedingungen nachweisen.
Ein vollständiger500er benötigt weiterhin ein neues ausdrückliches konkretes GO.
