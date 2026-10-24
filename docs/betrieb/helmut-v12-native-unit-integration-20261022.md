# V12: native Einzelunit-Anbindung, 22.10.2026

Stand24.10.2026: teilweise abgeschlossen. Kein erfolgreicher Motorlauf, Unit60-
oder500er-Reservenachweis. Basis `c46d07ebddaf8914c747fbc84f8059888376d9c1`;
Branch `codex/v12-unit60-native-integration-20261022`,
[Entwurfs-PR936](https://github.com/ernisch/helmut-pilot/pull/936).
Alte GOs und Claims bleiben verbraucht. Keine Production-Aktion, kein Merge und
kein vollständiger500er-Lauf sind aus dieser Arbeit freigegeben.

## 24.10.: Rollbacks PASS; Vergleich und letzte Einzelunit ausgewertet

SameRootUsage4150 bestand drei State-CAS/einen Usage-CAS mit vollständigem Abschluss.
Die korrigierten Negativfälle e755/b237 bestanden: Beide erwarteten späten
Receiptfehler rollen Original-CAS und Own-Zustand vollständig logisch zurück;
elf Tabellen und Katalog identisch, kein Commit/externes ACK. 44/63 unabhängige
Belegchecks PASS. Der frühere eb508-Fixturefehler bleibt FAIL; sein enger Scopefix
lockert keinen Originalguard.

Gleiche Input-/DB-/Settingsbindung im ersten Claimpaar6994/0ea8:
State-PSQL905,736911→549,184351ms (−39,366%); gemeinsamer Kernelpeak
1.218.666.496→1.252.741.120B (+34.074.624B). Kein RAM-Gewinn, kein Plateau und
kein reproduzierbarer Laufzeitgewinn aus je einem Fall bei ungeklärter Cachewärme.
Die Bridge ist ein privater Diagnosewriter; der geteilte Voll500-Writer ist unverändert.

Letzte volle Einzelunit7b2 auf603642aa scheiterte nach70,524240716s Adapterzeit
an `entry-terminal-deadline`: neun/16 Kontrollen bis send-R, keine Finalposition
oder Endquittung. Alle zehn Sourcewrites COMMIT/ACK/Exits0/zwei EOFs;
Hostmappingfehler/137-Enden folgten beim Abbruch und werden getrennt berichtet.
Peak1.348.653.056B,109 Samples/Events0/vollständige letzte Exits sind kein
bestandener Unit60-/Auth30-/500MB-Nachweis. Kein Neustart vor wirksamer Änderung.

137 vollständig verbundene HTTP-Spuren: Original9 Aufrufe5,929s, davonPSQL5,073s;
Broker-Prüfblöcke gesamt4,371s, darin Binary-SHA-Anteil nicht separat gemessen.
Keinen Parts-/Kopierengpass aus unmarkierten Restzeiten ableiten. Nächster Schritt:
frische Lese-/Prüfarbeit ohne Guard-/Zeit-/Latenzlockerung strukturell reduzieren.
CI40051723434 auf603642aa vollständig SUCCESS inklusive84 Originale/Z22.

Drei eigene abgeschlossene PG-Kopien7bace/6994/4150 nach vollständigem physischem
Restore und verschlüsseltem Drive-Rückdownload/Hashvergleich ausgelagert;
Originale, Metadaten und notwendige Quellen erhalten. Dreierphase netto+1.064.271.872B;
Kapazität und Volladmission15.179.779.720B weiter frisch prüfen.
[Aktuelle Messwerte und Primärpins](belege/native-claim-only-20261023/NATIVE_SAFETY_PAIR_UNIT60_20261024.SAFE.json)
haben Vorrang vor historischen Abschnitten und dem älteren Checkpoint-JSON.

## Historischer Nachweis vom23.10.: Claim bestanden, Einzelunit weiter fehlgeschlagen

Geprüfter Runtimecode `444e496fde2789211da77db1a5a9038ba9437360`; dessen
[CI40002522827](https://github.com/ernisch/helmut-pilot/actions/runs/40002522827)
ist vollständig grün, einschließlich84 geschützter Originale und Z22.
[Aktuelle bereinigte Zahlen und Quellenpins](belege/native-claim-only-20261023/ACTUAL_NATIVE_AND_CAPACITY.SAFE.json)
haben Vorrang vor den nachfolgenden historischen Arbeitsständen.

Der frische Claim-only-Fall515c8b bestand den zuvor fehlerhaften scoped Endsnapshot:
Callback genau einmal, Originalseed/Claim mit COMMIT und ACK, echter EntryExit0 und
beide natürliche EOFs. Own7/Revision1/History6000 sind bestätigt. Er führte keinen
Motor aus. Sein logisch laufender Claim bleibt verbraucht und darf nicht fortgesetzt
werden. Peak1.269.202.944B und sechs Speicherereignisse0 sind kein Unit-/Reservenachweis.

Der folgende echte Motorfall7bace scheiterte. Er erreichte neun der16 Kontrollen bis
send-R und benötigte im Adapter71,729s. Der erste gespeicherte Fehler ist
`entry-terminal-deadline`; der spätere Hostmappingfehler entstand erst nach dem
Source-Stopp. Alle zehn aufgezeichneten Sourcewrites endeten mit Exit0, EOFs,
COMMIT und ACK. Die finale Motorquittung fehlt. Gemeinsamer Peak1.342.267.392B,
Speicherereignisse0 und vollständige letzte Prozessenden ändern diesen FAIL nicht.

Die neue isolierte Readonly-SQL-Kopie55d0 bestand24 EXPLAINs: acht Komponenten,
je drei Wiederholungen,23,919s einschließlich Aufbau und Abschluss. Gemeinsamer
Peak792.047.616B, alle Speicherereignisse0; vier Captures tatsächlich Exit0/zwei EOFs,
PostgreSQL sauber beendet und finale Gruppe leer. Drei vollständige Quellhashmanifeste
und9MD blieben gleich, ebenso Katalog, Rollen, RLS, Einstellungen und logischer
Authzustand PRE/POST. PostgreSQL darf dabei physische Hintbits/Statistik/WAL ändern.
Geänderte Dateigrößen sind kein tatsächlich gemessenes Schreibvolumen.

Die SQL-Mediane liegen bei84,431ms für Graphprüfung,91,525ms für Own-Projektion,
176,579ms für Compare bei identischer Root und36,536ms für den Usagebeweis.
Kontrolllesen benötigte kalt302,547ms, mit frischen passenden Hinweisen119,378ms.
Diese verschachtelten Komponenten werden nicht addiert und nicht von früheren
HTTP-/Writezeiten subtrahiert. Ein erfolgreicher echter CAS, Unit60, Langzeitplateau
oder500MB Reserve ist dadurch nicht bewiesen. Es gab keinen neuen Voll500-Lauf.

Der vorhandene Motortrace grenzt den nächsten Schritt ein: neun Kontrollen kosteten
insgesamt9,663s. Bei deren Original-Control-Anteil4,005s liegen1,566s im gemessenen
Graph-Upstream-Intervall; weitere2,439s umfassen Brokerprüfung, Contract-RPC,
Transport und Clientvalidierung. Dieser Rest ist nicht vollständig vermeidbar.
Für dessen genaue Aufteilung fehlen wenige Zeitmarker im bestehenden privaten
Trace. Einen hinreichenden Gewinn durch einen atomaren Lesekontext behaupten wir
deshalb noch nicht. Ein Graph-only-Umbau wäre kein belegter Abschluss des Zeitfehlers.

Abgeschlossene eigene PG-Kopien af33/2f/515c wurden vollständig archiviert und
probeweise restauriert, für den bestätigten Empfänger verschlüsselt, im privaten
Drive gespeichert und vollständig zurückgeladen/byte- und SHA-geprüft. Erst danach
wurden die redundanten lokalen Kopien entfernt. Effektive Wiederherstellungsindizes,
Originale und Claim-/Prozessbelege bleiben erhalten; private GPG-Schlüssel wurden
nicht gelesen oder exportiert. Bei515c waren nach dem ursprünglichen Restore-PASS
nur30 TEMP-Verzeichnis-atimes verändert: offen dokumentiert, keine Zeitrestaurierung,
frische vollständige Löschbindung. Quellmetadaten blieben davor exakt gleich.

Zusätzlich wurden ein eigener abgeschlossener WIP-Worktree nach exaktem Bundle-/WIP-
Restore und verschlüsselter Drive-Rückprüfung sowie153 öffentliche Laufzeitduplikate
aus20 geschlossenen Fällen kontrolliert entfernt. Alle Gitrefs/Objekte, kanonischen
öffentlichen Quellen und aktuellen7bace-Runtimekopien bleiben erhalten. Der Versuch
zur RAW-ReservierungsfreigabeV3 scheiterte vor jedem RAW-Open/Punch; Originale wurden
nicht geändert. Komponentenadmission10GiB ist wieder tatsächlich erfüllt; die volle
Plattenadmission und32 frische Startbedingungen bleiben offen. KeineProduction/Merges.

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

CI39877703129 auf931477bd endete bereits im öffentlichen synthetischen Schritt14
mit AssertionError im Registry-Codec-Test: Der explizite vollständige Reader-
Sourcepin erwartete nochc52a98, vor der geprüften KO-Link-Erweiterung auf12a8c5.
Zwei unabhängige Quellreviews gegen72e4 bestätigen identische Funktionsbytes/AST
und exakt716Scalar-SQL-Bytes; die Funktion enthält keine globalen Abhängigkeiten
oder Helperaufrufe. Importe sind gleich, neue Modulinitialisierung führt keine
I/O aus. Nur diese aktuelle gesamte Source wird nun hart akzeptiert; zusätzlich
bindet der Treiber die unveränderte SQL-Prüfsumme und prüft im Worker den festen
Sourcepin erneut. Der historische Pin bleibt gesonderter Beleg ohne Fallback.

17gezielte Puretests mit geschlossenem Env/Python-I-S-B und tatsächlichem
separatem Exit0 bestanden. Zwei fehlerhafte private Test-Belegadapter bleiben
als Fehler erhalten; aus deren fehlender Exitquittung wird kein Autor-PASS
behauptet. Der einfache einzelne Root-Aufruf schließt genau diese Beleglücke.
Keine native Codec-/Engineausführung, keine Übertragung historischer Abnahme
auf den neuen Gesamtcode. Frische CI und frisch gebundene Einzelunit bleiben
erforderlich; die vorbereitete931-Capture bleibt unbenutzt erhalten.
[Codec-Sourcevergleich und Tests](belege/v12-native-unit-integration-20261022/REGISTRY_CODEC_CURRENT_SOURCE_REVIEW.SAFE.json).

Der aktuelle PostgREST-Abschluss ist jetzt eng integriert und unabhängig im
Quellcode geprüft. Acht originale PostgREST-/GHC-Quellen werden frisch gehasht,
als0444-Aliase innerhalb der Messgruppe installiert und durch Host, Controller
und Owner gebunden. Vor Spawn bindet eine neue private Einmalpolicy die aktuelle
generierte Config, feste Binary, Quellen und Scope; danach folgt die tatsächliche
Prozessidentität. Vor eigenem TERM werden alle Bindungen erneut geprüft.
Das rohe Exit-Signal bleibt erhalten. SIGINT gilt nur bei fehlerfreiem Verlauf,
genau einem identitätsgeprüften eigenen TERM, tatsächlichem Exit/Close, beiden
natürlichen EOFs, vollständigen begrenzten Logs und unverändert höchstens4500ms
als erwartete Übersetzung dieser festen Binary. Vorfehler und alte Fälle bleiben
FAIL.71Owner-VM-,103Host- und21Controller-Prüfungen endeten jeweils tatsächlich0;
Root und unabhängiger SOL-Reviewer bestätigen die finalen sechs Dateipins.
Die vollständige private Prelaunchpolicy bleibt flüchtig; dauerhaft sind deren
Hash und Abschlussmetadaten erhalten. Keine Signaltrace-/Build-Reproduktions-
behauptung. Echte native Normalclose-, Unit60- und Reservenabnahme noch offen.
[Aktuelle Quellenbindung und Grenzen](belege/v12-native-unit-integration-20261022/POSTGREST_CURRENT_CLOSE_SOURCE_REVIEW.SAFE.json).

Die eigene abgeschlossene48-PGDATA wurde vollständig privat archiviert und in
eine neue Kopie restauriert:1748Dateien/30Verzeichnisse,373.061.467logische Bytes;
Archiv123.467.342B, SHA256
`1fd940a98c915ef7ca35285baa66bda4391037717dd7e6e96ed5ce29f5bd319f`.
Alle1778Member wurden nach Inhalt und Metadaten verglichen. Beide expandierten
Kopien bleiben vorerst erhalten: Der frische Schutzcheck stoppt an46 unlesbaren
Docker-Mountreferenzen. Diese sind24tmpfs-Volumes, ein Kernelnamespace und das
geschützte Original-DB-Volume. Dessen physische Pfadidentität muss noch rein
lesend geklärt werden. Kein EACCES wird als sichere Nichtüberlappung gewertet;
keine Löschung erfolgt. Das private Archiv enthält synthetische Secrets und
bleibt ausschließlich lokal. Frei etwa10,136GB nach Archiv/Restore; neue
Einzelunit erst nach tatsächlicher Kapazitätsadmission und frischer Hostbindung.


23.10., aktueller Nachtrag: CI39881015738 auf48c15b09 ist vollständig grün,
inklusive84Originale, SQL-/Backup-/Return-/pgcron-Kontrakte, Offline/Bereich und
Z22. Der bedingte Schnellkernschritt36 wurde übersprungen; kein Laufnachweis
für diesen Einzelschritt. Die folgende Hoständerung benötigt eigene frischeCI.

Die48-Kopie ist nach tatsächlicher Archiv-/Member-/CRC-Prüfung und frischer
vollständiger Restaurierung kontrolliert entfernt, ebenso deren redundante
Restaurierung. Alle368Containerbindungen wurden geprüft; EACCES wurde nur für
exakt physisch belegte lokale Mounttypen aufgelöst. Der Original-DB-Volume-
Gegenstand wurde rein lesend mit dev27/inode1606697 identifiziert und gegen
sämtliche Zielobjekte und Vorfahren geprüft. Docker-Mountlisten werden als
vollständige kanonische Objekte verglichen, ohne Arrayreihenfolge anzunehmen.
Eigener beendeter Metadatencontainer danach ohne Force/Volumes entfernt.
Originale, Archiv, alle Fehlerbelege und fremde Ressourcen erhalten. Frei vor31:
10.870.374.400B; Voll500 fehlten damals4.309.405.320B, danach neue Belegung.
[Kontrollierte Bereinigung](belege/v12-native-unit-integration-20261022/CONTROLLED_48_COPY_REMOVAL.SAFE.json).

Frische isolierte Einzelunit31 auf48 scheitert im ENTRY_START-Hostdialog:
Request01:20:56.277UTC, nach5s keineReply08. Fehlerdatei-mtime01:21:01.282UTC
ist kein interner Fehlerzeitstempel. Hostmappingfehler01:21:01.493 folgt bereits
begonnenem Sourcecleanup. Kein vorgelagerter SQL-Fehler: Serviceledger1/1/1 mit
psql0/beidenEOF, SQL-stderr leer; PG-FATAL gehört zum Fastshutdown. Eigene
Service-Node-Abschlussquittung fehlt, deshalb kein Node0/EOF-PASS. OuterCLI1/
2EOF; Host37Handles,36Exit0/ein137, alle2EOF;35Observer0/2EOF, keine unbekannten
Handles.137 belegt kein PostgREST-Signal. PG0/ein gemergtesEOF+Shutdownmarker,
Gruppe zweimalleer/letzterExit erfasst, Peak1.079.160.832B/alle6Events0. Wegen
FAIL kein Unit60/Auth30-/Reservebeweis. Originale unverändert, Motorzahl unbekannt.
[Unveränderter Fehlerbefund](belege/v12-native-unit-integration-20261022/NATIVE_31_ENTRY_START_FAILURE.SAFE.json).

Belegte Ursache im Host: ENTRY_START lief nach einer vollständigen Inventur ein
und wartete vor Gate/Reply auf eine zweite äußere Inventur. Jetzt nur bei bereits
gebundener Source in QUALIFIED frühe Annahme vor einer vollständigen frischen
Inventur. Alle Envelope-/Scope-/Sequenz-/Nonce-/Body-/Freshness-/Replayguards
bleiben erhalten; Gate/Reply bei unvollständiger Beobachtung gesperrt. Source5s,
Request/Beobachtung3s sowie Unit60/Auth30 unverändert.106gezielte Purechecks auf
Testpin21d39e55 plus genau ein gezielter Test auf finalem Uhrfixturepin f7feada2
enden tatsächlich0; kein vollständiger106er-Rerun nach der reinen Fixturezeile.
Vor Fix scheiterte der neue Vertragstest tatsächlich. Root und unabhängiger SOL
bestätigen beide finalen Sourcepins. Das ist noch keine neue native Zeitabnahme.
[Änderung und Prüfumfang](belege/v12-native-unit-integration-20261022/ENTRY_START_SOURCE_REVIEW.SAFE.json).

Die eigene f519-PGDATA ist nun ebenfalls ausschließlich lokal privat archiviert:
Archiv123.772.928B, SHA256
`0ac87db59a88b3b8b761c91750aed258a5fc426ff2030ac81579d04627f48742`.
Tatsächlicher Archivhelferexit0; vollständiger Member-/CRC-/EOF-Readback und
frische Restaurierung aller1779Member/1749Dateien mit Inhalts-/Metadatenvergleich
bestanden. Danach beide Expandedformen sowie beide eigenen Ab17-Expandedformen
nach getrennten frischen Schutzprüfungen mit tatsächlichen Exit0 entfernt.
373Container mit vollständig geprüften Mountobjekten, ursprünglicher Volumegegenstand,
alle Originale und Belege geschützt; kein fremdes oder aktives Objekt entfernt.
Das erste f519-V1-Removal scheiterte vor Löschung; Ursache bleibt unbekannt.
Ein separat belegter procfs-nlink-Wechsel wurde in neuemV2 durch stabile
Vorfahren-Corefelder bei unverändert vollständiger Namespace-/Kernel-/FD-Prüfung
behandelt; keine nachträgliche Ursachenbehauptung fürV1. Alle vierV2-Entfernungen
enden0. Archive mit lokalen Testsecrets werden nicht exportiert. Frei vor44:
10.906.013.696B. f519/Ab17 bleiben fehlgeschlagene Motorfälle.

## 23.10., 02:45UTC: Zeitfehler44 und gezielter Manifestumbau

CI[39885153523](https://github.com/ernisch/helmut-pilot/actions/runs/39885153523)
auf a58a741f vollständig grün, einschließlich geschützter84Originale; keine
Abnahme des neuen Folgecodes daraus. Bedingter Schritt36 war nicht ausgeführt.

Fall44 (`44e251ee0f05668cfa2e540ec004abbe`) auf a58: Startdialog gelöst,
Adapter60.163,097461ms, Entrygesamt62.703,085012ms, FAIL. SQL meldet
02:12:31.626UTC `local-unit-store-send-running-window`; Hostmapping folgt erst
02:12:32.633UTC. Erhaltene Captures identifizieren weder send-D/send-R noch die
Kontrollzahl. Konfigurierte Delays sind keine tatsächlich abgeschlossenen Phasen.
Der Ownertrace lag auf tmpfs; nach beendetem Mount kein Remount/Docker-cp als
vermeintliche Wiederherstellung. Gemeinsamer Peak1.342.197.760B, alle6Events und
CPU-Drosselung0; kein konkreter Speicherdruckbeleg, jedoch keine Komponenten-
Aufteilung/Plateau-/Reserveabnahme. Alle82Hosthandles2EOF,80Exit0/ein1/ein137;
79Observer0/2EOF. PG0/einmergedEOF/Shutdownmarker, Kernelgruppe bis letztemExit
leer. Host-/Service-Protokoll unclean.
[Fehlerbefund](belege/v12-native-unit-integration-20261022/NATIVE_44_UNIT_WINDOW_FAILURE.SAFE.json).

Native Originalnachprüfung unterbrochen: InterruptedError/raw-pin/checkedCount0,
false-Flags unverändert. Separat frisch993Hostpins/2.476.732.862B inklusiveRAW
und vier Anfrageoriginale mit vollständigemSHA/stabilen9MD/Endesweep PASS. Keine
DB-Anfrage, interneReader-Neuprüfung oder JIT-Reextraktion. ÄußeresGit/6Sourcepins
vorher/nachher identisch, CLI1/Wait/beideEOF/keinTimeout. Fehler in Root-
Startaufzeichnung nach tatsächlichemPopen ist separat über beobachtete PID-/
Parent-/Argv-/STARTED-Bindung dokumentiert; kein zweiterStart/Retry.
[Begrenzte Originalprüfung](belege/v12-native-unit-integration-20261022/POST_FAILURE_HOST_ORIGINALS.SAFE.json).

Der Store hashte jeKontrolle erneut1961Dateien/440.753.882B. Begrenzter Vergleich
986Hostdateien/233.577.290B:16abwechselndePaare3,525780→0,711679s für vollständige
SHA gegenüber einemFD9-Pass; alle16Wall-/CPU-Paare positiv. Initial228,003ms und
Final238,493ms separat. Zwei PostgREST-Dateiprüfungen jePaar370,441→1,441ms über
16Paare, ebenfalls alle positiv. Kein Live-/proc-Exe-/Container-/JIT-Nachweis;
974JIT-Dateien fehlen im Hostvergleich. Kein erzwungenerGC/Cacheflush, kein
ColdCache-/gemeinsamerRAM-Beweis. Getrennte Komponenten nicht addieren.
[Exakter Prüfumfang](belege/v12-native-unit-integration-20261022/IMMUTABLE_FILE_CONSUMER_COMPARISON.SAFE.json).

NeuerStore: initial vollständigerSHA-/FD9-Record pro privatemWitness, gebunden an
Operation/Scope/DB/beideManifestpins. JedeKontrolle hasht kleineManifeste frisch,
prüft Namespace/Mountinfo sowie kanonischeNamen/volleFD9 vor UND nach frischem
Catalog. Initial alleDateien aufRO-Cover; normale Source-Siblingwrites werden
über Inode/ctime/9MD erkannt. Kein Schutzversprechen gegen privilegierte
Metadatenrollbacks oder neuer kryptographischerInhaltsbeweis proGruppe. Runtime,
geladenesCode-Closure und alle16mutable Sicherheits-/Kostenkontrollen bleiben
frisch. Drift sperrt denselbenWitness permanent, auch nach parallel gescheitertem
Catalog. KeinRefresh/Fallback/Retry. Produkt macht zweiFD9-Pässe, Prototyp einen;
dessen Zeiten sind kein Produktgesamtvergleich.

Scope hält auf echtemFehler einen privaten einmaligenSnapshot bestätigter Auth-/
Kontrollzeiten und aktiverEnumphase. Entry schreibt separatPRIVATE vor dem
unverändertenFehlerterminal; Ausgabefehler verdecken nicht die ursprüngliche
Ausnahme. Snapshot unvollständig/ungeprüft; vorClaim keiner. Capturezeit ist
kein erfundenerDB-Fehlerzeitpunkt.17.Kontrolle/undefined stoppt vor weiterenReads.
Gezielt tatsächlich0: Manifest17, Store9, Originalconsumer15, Guards27, Entry48,
Authority121; Syntax/Root/unabhängigerSOL-SourcereviewPASS. BestehendeCI-Globs
erfassen neueTests. Kein unnötiger179er-/95er-Rerun lokal.
[Code-/Testpins](belege/v12-native-unit-integration-20261022/MANIFEST_CONTINUITY_SOURCE_REVIEW.SAFE.json).

Offen: frischeCI des Folgecodes, sicherePlattenadmission, nativeRO/JIT-/normaler
Ownerclose-/Zeit-/Qualitäts-/gemeinsameRAM-Abnahme derselben echtenEinzelunit.
31/44-Archive erst vorbereitet, keine daraus abgeleiteteLöschung. Voll500 braucht
15.179.779.720B/alle32frischenBedingungen/neueskonkretesGO. DiagnoseR6000/medium
ist nicht automatisch VollvertragR3000/low; zwei eigeneTickets belegen keinen
globalen500er-Zähler. Budget-/Invocationlease-Motorverbesserungen integriert;
neuer Umbau senkt Prüfoverhead, noch kein weitererMotor-RAM-Beweis.

## 23.10., 03:36 UTC: CI bestätigt; native Endquittung fehlt

[CI39891861503](https://github.com/ernisch/helmut-pilot/actions/runs/39891861503)
ist für `0b1a233553b1ac0f2d0ce13fed86dbefb5f774f4` vollständig grün:
öffentlicher Prüfplan, Browser/Mobile und Syntax/Offline samt geschütztem
Originalkanal. Der folgende native Fall `00c9af1a352ed9689449e041091ae9f8`
bleibt trotzdem **FAIL**. Kein erneuter vollständiger500er wurde gestartet.

Der Entry begann03:27:42.942UTC. In Controllerstufe6 wurde die unveränderte
70s-Wartefrist auf den dauerhaften Entryabschluss überschritten
(`entry-terminal-deadline`). Entryterminal, Fehlerphasendatei und unabhängige
Finalabnahme fehlen. Die tatsächliche Adapter-/Authdauer, D/R-Fortschritt und
abgeschlossenen Kontrollgruppen sind daher unbekannt. Die feste Abschlussfrist
ist kein gemessener Unit60-Wert. Der spätere fehlende Source-PID-Eintrag beweist
keine primäre Motorursache. Weder der begrenzte Prototypvergleich noch grünes CI
qualifizieren diesen fehlgeschlagenen nativen Umbau.

Gemeinsamer Peak1.366.712.320B, alle sechs Speicherereignisse0, CPU-Drosselung0,
vollständiger letzter Exit erfasst und beide Kernel-Leerprüfungen bestätigt.
Owner und Entry wurden lokal mit137/beiden natürlichen EOFs geschlossen;
86weitere lokale Kinder und85Beobachter mit0/beiden EOFs. PostgreSQL endete0,
alle Workerchildren sind beendet. Zehn SQL-Kinder endeten bestätigt0/beideEOFs;
eine Zuordnung zu D/R oder einzelnen Kontrollen fehlt. Service-Selbstreceipt
meldet sauber, tatsächlicher Service-Nodeclose ist nicht belegt. Der äußere
CLI-/Helperexit1 wurde jeweils tatsächlich gewartet, beide CLI-EOFs natürlich,
keine äußeren Signale/Timeouts/Capturefehler. Git und sechs Quellpins sind vor/
nach identisch. Die nativen Originalschutzflags sind diesmal beide **true**.
Die rechnerische Reserve eines FAIL ist kein angenommener Puffer-Nachweis.
[Bereinigter Befund](belege/v12-native-unit-integration-20261022/NATIVE_00C9_TERMINAL_DEADLINE.SAFE.json).

31 und44 sind jetzt privat archiviert, vollständig zurückgelesen und durch
frische Wiederherstellung aller Member geprüft. Genau ihre vier redundanten
Expandedformen wurden nach separaten Rootreviews mit tatsächlichem Exit0
entfernt. Vor jedem Schritt wurden Archiv, Originalschutz, Prozesse und alle
Dockerbindungen frisch geprüft. Der unveränderte44-Altplan wird ausschließlich
um1778 nachgewiesen entfernte31-Member und einen belegten Elternübergang
abgeleitet; alle erhaltenen31-Dateien bleiben geschützt. Originale, Archive,
Gitstände und sämtliche Belege bleiben erhalten. Die Archive enthalten lokale
Testsecrets und dürfen nicht exportiert werden. Direkt danach waren
10.834.771.968B frei; der folgende native Fall benötigt wieder eigenen Platz.
Bei der anschließenden Berichtsaufnahme waren10.416.967.680B frei, noch
320.450.560B unter der nächsten10GiB-Einzeladmission und4.762.812.040B unter der
Volladmission. Keine weitere sichere große Löschquelle belegt.
[Vier geprüfte Entfernungen](belege/v12-native-unit-integration-20261022/VERIFIED_31_44_COPY_CLEANUP.SAFE.json).

Weiter ausschließlich gezielt: kleinsten vorhandenen COPY-Lesepfad für den
erreichten eigenen00c9-Journalzustand qualifizieren, Ursache belegen und dann
reparieren. Kein weiterer Motorlauf als Hypothesentest. Numerische Authzeit und
die vollständigen16Kontrollzeitfenster werden im Erfolgsfall bisher nur im
Evidence-Datenbankobjekt erhalten; der Endsnapshot exportiert Hashes/Zähler.
Fehlendes Evidence beweist weder0Kontrollen noch eine fehlgeschlagene Autorisierung.
Fünf neue Manifestfehlercodes fehlen zudem im bereinigten CLI-Fehlerkatalog;
eine Auslösung im Fall00c9 ist nicht belegt. Kein Unit60-/500er-Puffer-/Plateau-
oder tatsächlicher gemeinsamer RAM-Ersparnisnachweis. Alle alten Rechte bleiben
verbraucht; Full500 braucht ausreichende Platte,32frische Bedingungen und neues GO.

## 23.10., 04:20 UTC: COPY-only-Fortschritt bestätigt; R zu spät freigegeben

Der neu qualifizierte, einmalige Forensikleser hat ausschließlich eine neue
Kopie des abgeschlossenen eigenen00c9-Zustands geöffnet. Alle1750 Dateien wurden
beim Kopieren vollständig gehasht und zurückgelesen. Source00c9 und RAW wurden
nicht an den Leser gemountet oder gestartet. Auf der neuen Kopie wurde ihre
unverändert separat aufgehobene `postgresql.auto.conf` durch eine leere Datei
ersetzt und eine eigene, begrenzte PG-Konfiguration verwendet. Diese veränderte
Kopie wird danach ausdrücklich nicht mehr als byteidentisch bezeichnet.

Nach unabhängiger Source-/Deltaabnahme und11 gezielten Puretests: tatsächlicher
Leserexit0, genau eine Metadatenabfrage mit tatsächlichem psql0/2 natürlichen EOF,
PG0/clean, keine Closefehler/Signale, vollständige leere Kernelgruppe und
Source9MD danach unverändert. Der separate feste Metadatenvalidator bestand
135 synthetische Prüfungen und unabhängigen Review; seine tatsächliche Anwendung
auf die hashgebundene Ausgabe endete ebenfalls0. Root verknüpfte beide Belege.

| Erhaltener Schritt | Seit Scopeentry |
|---|---:|
| Claim-CAS | 4,257s |
| D reserviert | 13,378s |
| D-Sendautorisierung | 17,007s |
| D-accounted, Draft/immutable-D/usage-D jeweils1 | Zeitpunkt nicht gespeichert |
| R reserviert | 50,345s |
| R-Sendautorisierung | 53,501s |

Der Journalzustand bleibt `running`, Resultat `pending`, abgeschlossene Units0.
Für R fehlen Abrechnung und Usageartefakt. Seine dauerhafte Sendautorisierung
beweist weder Timerstart noch Transportabschluss oder Client-ACK. Die16Kontrollen
und Authdauer sind ohne gespeichertes Verificationobjekt weiterhin UNKNOWN.

Der aktive D/R-Fixturetransport verwendet einen socketlosen Requestshim und
startet erst bei `req.end()` den konfigurierten19900ms-Timer. Es handelt sich um
konfigurierte lokale Verzögerungen, keine gemessenen Provider-HTTP-Antwortzeiten.
Bei R-Freigabe verblieben6,499s; nominelle19,9s würden die Unitfrist bereits
um13,401s überschreiten, selbst ohne weitere Arbeit. Der Rest53,501−19,900=33,601s
ist kein gemessener SQL-, Node- oder vermeidbarer Anteil. Die zehn bestätigten
Service-PSQL-Kinder gehören zum Schreibcompiler; das Ledger enthält keine
einzelnen Operationsnamen oder Abschlussdauern.

Zusätzlich belegt der aktuelle Nativehost feste Modi: HistoryReuse/ControlRead
ON, separater FullauthGraphReuse/SingleWriteCapture OFF. Der4-Feld-Kontrollleser
nutzt bereits unabhängig davon eigene warme Graphwiederverwendung. Die neue PG-Lesekomponente soll zunächst den
tatsächlichen Graph-/History-Anteil auf derselben eigenen Kopie eingrenzen;
ihre Aussage bleibt getrennt von Node-Decode, Schreibpfad, Broker und Unit60.
Die tatsächliche Graphfunktionsidentität wird aus dem nativen Katalog geprüft:
die ersetzende8231B-Definition im Bounded-Proposal stimmt zum tatsächlichen4e2b9015…-
Body. Er validiert warme History ohne volle Aggregation; cold/changed History wird
voll geladen. Die frühere Basisdefinition im Parts-Proposal wäre die falsche Quelle.
`controlReadEnabled` schließt die beiden separaten Modi derzeit ausdrücklich aus;
ein Flagwechsel allein wäre ungültig. Bisherige native Capturechecks verwenden
ProjektionOFF/keine `mandate_profiles`, der OriginalService ProjektionON. Vor einer
Kombination bleiben Vollsnapshot-/Controlview-Trennung, CAS/ACK/History und
Cacheinvalidierung im tatsächlichen Kontext gezielt nachzuweisen.

Die Fehlerdiagnose hat zwei belegte Lücken: Vor Scope-Erzeugung fehlt der
Phasencatch; danach entsteht er erst nach awaited Adaptercleanup. Ein noch
laufender Await kann den äußeren70s-Controller erreichen, bevor Run persistiert.
Keiner dieser inneren Pfade ist als00c9-Primärursache bewiesen. Separat repariert
`fc2d6d04` fünf fehlende feste Manifestreasoncodes;54 gezielte Run-Checks bestanden,
unbekannte Near-Matches bleiben unterdrückt. Das lockert keine Schutzregel.

Frisch04:15:52UTC waren9.919.639.552B frei,817.778.688B unter10GiB-Einzeladmission
und5.260.140.168B unter Full500. Die neue Readerkopie belegt373.870.592B und bleibt
erhalten; selbst ihre vollständige Rückgewinnung würde die Einzeladmission nicht
herstellen. Keine weitere Löschung in dieser Auslesung. Der Leserpeak36.200.448B
misst ausschließlich den Metadatenleser und ist kein Motor-/500MB-Nachweis.

[Hashgebundener Fortschrittsbeleg](belege/v12-native-unit-integration-20261022/NATIVE_00C9_FORENSIC_PROGRESS.SAFE.json).
Native00c9 bleibt FAIL. Kein neuer Motor-/Full500-Lauf, keine wiederverwendeten
Claims, keine Originaländerung, keine Production-Aktion und kein Merge.
CI39896369875 ist inzwischen auch für den reinen Dokumentationsstand940ce102
vollständig grün. Der anschließende Reasoncode-Fix besitzt den getrennten
gezielten54er-Testbeleg; seine neue Push-CI bleibt bis zur tatsächlichen Endquittung offen.

## Begrenzte echte Auth-Komponentenprüfungen, 23.10.2026

Die folgenden Prüfungen verwenden ausschließlich die isolierte abgeleitete Kopie
des erhaltenen fehlgeschlagenen nativen00c9-Zustands mit6001 Historyeinträgen.
Sie sind kein neuer ursprünglicher V12-Lauf und kein vollständiger Motorlauf.

Drei getrennte echte Readonly-Transaktionen bestanden. Der vorhandene native
Graphleser benötigte344,511ms beim ersten und166,992/155,944ms bei den beiden
Folgeaufrufen; einschließlich Guard/SQL412,808/205,811/196,739ms. Originalcode,
volle6001 Historyeinträge,1923 Graphknoten und frische native Proofs wurden
geprüft. PostgreSQL endete mit0, alle Kinder und Container endeten tatsächlich;
die Gruppe war leer, alle Speicherereignisse0, Original9MD unverändert.
Der gemeinsame PG-Komponentenpeak war189.198.336B. Node, Motor und Abschluss-
phasen eines vollständigen Falls waren nicht enthalten. JIT war OFF gegenüber
ON im ursprünglichen Lauf; keine Kaltcache-Gleichheit behaupten.

Der anschließende Konstruktorvergleich bestand mit vier getrennten echten
Node-Prozessen in Reihenfolge alt/direkt/direkt/alt. Alle vollständigen Artefakte
mit jeweils16.567.116B sind bytegleich. Die bisherige Snapshotkonstruktion
benötigte131,566/128,028ms, Parts.captureWrite118,676/102,100ms. Zwei Proben je
Methode belegen keine statistische Aussage; die rund20ms mittlere Differenz
erklärt die bekannte Zeitüberschreitung nicht. Der vollständige U.read-Leseweg
benötigte1.415–1.544ms. Dessen Differenz zur Psqlzeit umfasst mehrere JavaScript-
Schritte und ist noch keine isolierte Decoderzeit.

Der gemeinsame Peak über alle vier Komponentenfälle beträgt435.965.952B;
es gibt keinen getrennten gemeinsamen RAMvergleich der beiden Methoden.
Natürliche Speicherbereinigung unterschied sich; Heap/RSS vor und nach der
Konstruktion sind keine Spitzen und kein Einsparnachweis. Tatsächliche Node-,
Comparator- und PostgreSQL-Abschlüsse mit0 und natürlichen Pipe-Enden,
leere Gruppe und unveränderte Original9MD sind unabhängig bestätigt.
Keine Motor-, CAS-, Claim- oder Provideraufrufe; keine Zustandsmutation.

Die erste Konstruktorvorbereitung blieb FAIL, weil sie fälschlich500 Profile
im Authspeicher voraussetzte. Profile liegen getrennt im Main-/Relationsspeicher;
der korrigierte Guard prüft den echten vollständigen Authsnapshot und die
6001 unveränderlichen Historyeinträge. Auch die zwei früher fehlgeschlagenen
synthetischen Launcherprüfungen bleiben FAIL; ihre Fixturefehler wurden nicht
nachträglich zu Erfolgen erklärt. Neue gezielte Deltaprüfungen und der echte
Vergleich sind getrennte Belege.

Die nachfolgend ausgewertete CPU-Diagnose trennt den kalten und warmen
unveränderten U.read. Keine inkompatiblen Flags oder produktiven Cacheänderungen
aus den Komponentenwerten ableiten.

[Bereinigter PG-Beleg](belege/v12-native-unit-integration-20261022/NATIVE_PG_READ_COMPONENT.SAFE.json),
[echter Konstruktorvergleich](belege/v12-native-unit-integration-20261022/NATIVE_AUTH_CAPTURE_COMPONENT.SAFE.json).


## Instrumentierte Lesephasen und direkter nächster Schritt

Im neuen einmaligen Fall `run-9f75e7a1a264f93d351238d89481e31d` wurden exakt zwei
unveränderte U.read im selben frischen Node und Target ausgeführt. Der interne
Inspector öffnete keinen Port;1ms-Sampling, keine erzwungene GC/Cachebereinigung,
keine Enginepatches. Beide Profile und vollständigen Authartefakte entstanden
erst nach beiden Reads und Profilerabschlüssen.

| Instrumentierter Teil | Kalt | Warm |
|---|---:|---:|
| U.read Wall | 1523,869ms | 408,019ms |
| Node CPU ohne Psql-Kind | 1019,545ms | 158,548ms |
| Psql Wall bis Exit/EOF, vor JSONparse | 499,797ms | 301,001ms |
| Voller Graph | 1923Nodes | 1923Nodes |
| Native Historyreuse | false,6001Records übertragen | true,kein Historypayload |

Beide Ergebnisse besitzen echte Snapshots und6001 eingefrorene Historyeinträge.
Die Profilerintervalle sind mit1555,490/476,392ms länger als U.read: Startaufwand
und Idle gehören zu den Rohprofilen. Inklusive Decodersamples697,509/86,065ms
überschneiden sich mit aufgerufenen Funktionen und dürfen nicht addiert werden.
Natürliche GC hatte171,677/7,551ms exklusive Samples. Das sind instrumentierte
Teilbelege; keine uninstrumentierte Vergleichsmessung und kein Memorysaving.

Der abschließende strenge Vollbytevergleich bleibt ausdrücklich FAIL
`AUTH_BYTE_DIFFERENCE`: beide9.561.729B groß, unterschiedliche SHA.
Ein vollständiger logischer Vergleich ergab0 Typ-, Skalar-, Membermengen- oder
Arraylängenunterschiede in25.684Objekten/1.402Arrays/264.691Skalaren. Einzige
Abweichung ist die Top-Level-Reihenfolge von `llmUsage` und `_authStoreRevision`.
Quellursache: `verifyReuse` gibt kalte native Daten unverändert zurück, hängt
warm History nach der Revision an; der accepted-Merge erhält diese Ordnung.
Diese beiden Felder sind aus dem Merkle-Graphroot ausgeschlossen. Der logische
Vergleich wurde nachträglich aus seiner tatsächlichen vollständigen Toolausgabe
gesichert; es gibt dafür keine damals separat persistierte CLI-Exitquittung.
Keine Wiederholung und keine Umdeklaration des fehlgeschlagenen Gesamtlaufs.

Tatsächlich: beide Psql0/2EOF, Node1/2EOF ohne erzwungenen Abschluss, PG0/clean,
alle Kinder beendet, drei eigene CIDs frisch stopped/PID0, Gruppe leer und alle
sechs Speicherereignisse0. Original9MD und neun Enginequellen blieben gleich.
Der Peak402.771.968B gilt nur für diese fehlgeschlagene instrumentierte Komponente.
Die Profile bleiben privat; der öffentliche Beleg enthält nur geprüfte Zahlen
und klar begrenzte Teilbefunde.
[Bereinigter Teilbeleg](belege/v12-native-unit-integration-20261022/NATIVE_AUTH_READ_PROFILE_PARTIAL.SAFE.json).

Der enge CAS-Sourceaudit gegen erhaltene native Funktionspins belegt bereits
aktive Projektion: keine vollständige logische Auth-JSONB-Rekonstruktion im
beabsichtigten Original-CAS. Der normale Diagnosebridge-Commit enthält dennoch
vier zusätzliche Graphchecked-Pässe sowie einen Original-CAS-Graphpass.
Das ist keine gemessene CPU-/RAMzuordnung und rechtfertigt kein Entfernen von
Sicherheitsprüfungen. Ein zusätzlicher direkter CAS-Kerntest würde die Bridge-
und Rollenanteile auslassen und wird nicht vorbereitet. Die bestehenden
Motoränderungen bleiben erhalten; diese Runde liefert keinen neuen maßgeblichen
Motorumbau oder bestandenen vollständigen Einzelunitfall.

Der Betreiber verlangt nach dem langen Diagnoseaufwand den kürzesten direkten
Weg zum500er. Weitere Snapshot-/Reader-/CAS-Kernexperimente sind gestoppt.
Zunächst muss die unveränderte Ressourcenadmission erreichbar sein. Frischer
statvfs-Befund:9.777.184.768B verfügbar; zur10GiB-Einzeladmission fehlen
960.233.472B, zur Volladmission15.179.779.720B fehlen5.402.594.952B. Die Basiskopie
bleibt geschützt. c898 besitzt ausdrücklichen Metadatenschutz und keinen
qualifizierten Archiv-Rückweg; seine anfänglichen logischen Kopierbytes sind
kein Allokations- oder Freigabenachweis. Keine sichere Deckung der Lücken ist
belegt; keine weitere Bereinigungsserie oder Schutzlockerung wurde begonnen.

Nach Kapazitätszulassung folgt ein frischer hashgebundener echter Einzelunitfall
im vollständigen vorgesehenen Motorpfad; nur dessen belegte Blocker beheben.
Unit60/Auth30, alle16 frischen Kontrollen, Qualitäts-/Abschlussnachweis,
Langzeitplateau und500MB Reserve bleiben offen. Die CI auf1d7bc947 ist grün;
[Run39900463531](https://github.com/ernisch/helmut-pilot/actions/runs/39900463531).
Ein späterer500er benötigt weiterhin32 frische Startbedingungen, gültige Fall-
und Zeitbindung sowie ein neues konkretes GO. Keine alten Rechte wiederverwenden;
kein Merge, keine Production-Aktion und keine bezahlten Anbieteraufrufe.

## 23.10.: Drei parallele Abschlussaufgaben, Schreibphasen integriert

Der eng begrenzte Servicepatch `b006750c` zeichnet Prepare, den echten Psql-Pfad
und lokale Ergebnisannahme privat und dauerhaft auf. Maximal acht Zeilen/2KiB
pro authentifiziertem Request, insgesamt höchstens512KiB; feste Metadaten ohne
SQL-/Authinhalte. Der vorhandene monotone Servicebeginn und sämtliche Fristen
bleiben bestehen, Trace-I/O zählt zur Laufzeit. Ein Publikationsfehler bleibt
terminal ohne Retry; bereits bestätigter Commitprozess wird nicht als ungesendet
bezeichnet. Response-, CHILDREN- und STOP-Schemata bleiben unverändert.

Root hat nach Integration die gesamte betroffene Service-VM-Suite tatsächlich
ausgeführt:72PASS, Exit0, einschließlich zehn neuer Phasenchecks. Unabhängiges
Source-Review des identischen Hashs ist PASS. Keine echte Datenbank oder Unit
wurde dafür gestartet. `ackAccepted` ist nur lokale Ergebnisannahme vor dem
Socketversand; Psql-Aufruf ist kein Spawnbeleg und Phasenende kein Erfolgsbeleg.
Die bisher fehlende Zeitzuordnung ist damit vorbereitet, der Zeitfehler noch
nicht behoben. [Bereinigter Integrationsbeleg](belege/v12-native-unit-integration-20261022/NATIVE_WRITE_PHASE_INTEGRATION.SAFE.json).

Die parallele Kapazitätsprüfung qualifiziert keine weitere Löschung. Sieben
untersuchte eigene gestoppte Tiny-Container haben jeweils0B Schreibschicht.
Selbst die großzügige unqualifizierte Obergrenze alter Checkouts reicht nicht
für die Lücke; private/unfertige Stände bleiben erhalten. Frisch9.775.599.616B
verfügbar,961.818.624B fehlen zur Einzeladmission und5.404.180.104B zum Voll500.
Kein unterstützter Cloud-Kapazitätsausbau ist in den verfügbaren Tools vorhanden.

Alle32 Startgruppen sind statisch zugeordnet:11 benötigen frische Bindung,
13 sind veraltet,4 verbraucht,4 blockiert; keine operative Gesamtannahme.
Ein neuer Day23/V13-Namensraum wurde nur als GO-freier Dateikandidat beschrieben,
nicht gestagt oder autorisiert. Die alten Slot-/GO-/Claim-/Setup-Belege bleiben
unverändert verbraucht. Der bestehende Source-Consumer benötigt Live-Psql im
fest gebundenen Original-CID22465; dieser ist tatsächlich exited255/PID0.
Eine Diagnose-Readerkopie oder eine alte Restorequittung erfüllt diese native
Originalgleichheit nicht automatisch. Originalquelle und Volume bleiben erhalten.

Zusätzlich integriert: `e20edf5b` bindet ausschließlich die reine
Tagestransfer-Vorbereitung an den aktuellen Worktree und lässt genau den23.10.
zusätzlich zu. Unverändert bleiben Originalfenster, maximal neun Stunden,
500 eindeutige Profile, Ablehnung alter Tageseingaben, unabhängige tatsächliche
zeitliche Akzeptanz und die bestehenden modellgebundenen Reviewregeln. Kein
Urteil oder GO wird durch diesen Patch erzeugt. Der enge synthetische Test
bestand25 Checks, tatsächlicher Helper-Toolchunk `3d038e`, Exit0; keine echten
Engineimporte/-aufrufe, Zeilentransfers, DB, Container oder Provider.
Ein erster Testlauf hatte nur eine falsche Erwartung zum bestehenden
Fehlertext und bleibt als fehlgeschlagener Testlauf erhalten.

Produktpin `rebind-local-day.js`:8825B,
`00e89eb7dbdcf9ccc44aa1167df2785a90c4c0d95e7ab41d68087c28afc88c8d`.
Testpin:6796B,
`9201f0711cde9fe1b0ca70fcf8afd8b4d7d361b1b60bbf2a0fc56acfb368492e`.
Die Connector-/Finish-Templates bleiben unverändert:26 historische Consumer,
drei eingebettete alte ROOT-Pfade und128 alte Codepins im festen RuntimeTemplate
verlangen eine kohärente echte aktuelle Bindung. Ein einfacher Repo-Pfadtausch
würde Pins still verwerfen oder weiterhin alten Appcode ausführen. Keine solche
Umschreibung, neue Akzeptanz oder gestagte Voll500-Verbindung ist erfolgt.

## 23.10.,06:54UTC: Kontrollierte Bereinigung tatsächlich abgeschlossen

Drei abgeschlossene saubere Helper-Worktrees wurden nach vollständigem Git-
Bytevergleich entfernt; alle Branchrefs und erreichbaren Objekte bleiben erhalten.
Die redundante entschlüsselte Transferdatei wurde erst entfernt, nachdem das
erhaltene lokale Cipher tatsächlich erneut entschlüsselt und dessen Ausgabe
streamend exakt nach Größe/SHA geprüft war. Schlüssel bleiben ausschließlich lokal.
Zwei ungenutzte musl-Pakete wurden unter Erhalt von Locks und glibc-Werkzeugen
entfernt. Alle sechs Einzellöschungen besitzen vorab gespeicherten Umfang,
Schutzprüfung und konkreten Rückweg; private Einzelpfade bleiben außerhalb Git.

Tatsächlicher Netto-Free-Zuwachs:222.097.408B. Verfügbar9.997.402.112B, zur
Einzeladmission fehlen740.016.128B, zum Voll5005.182.377.608B. Die sichtbaren
167.706.624B der musl-Pakete sind kein zusätzlicher Gewinn: im unteren Overlay-
Layer verursachte deren Entfernung netto28.672B Metadatenmehrverbrauch.
Aktuelle Originalpfadbindungen verhinderten die Entfernung dreier älterer WTs.
Die vier Originalpins sind frisch SHA-/9MD-identisch, alle Gitrefs unverändert;
Original-CID bleibt stopped/PID0/Exit255. Datenbanken, erforderliche Archive,
Messbelege, Profile und fremde/aktive Ressourcen wurden nicht gelöscht.
[Bereinigter Abschlussbeleg](belege/v12-native-unit-integration-20261022/CONTROLLED_CLEANUP_20261023.SAFE.json).

Der unveränderte Runtimecode auf `f1f9f456` ist jetzt CI-grün:
[Run39911729550](https://github.com/ernisch/helmut-pilot/actions/runs/39911729550).
Das ersetzt keinen Unit60-/500MB-/Voll500-Nachweis. Keine Tests, DB-, native
Unit-, Provider- oder Production-Aktionen wurden durch diese Bereinigung gestartet.

## 23.10.,07:21UTC: Aktueller Code im vorgesehenen Full500-Pfad gebunden

Die vorhandene Vorbereitung konnte trotz Aufruf aus dem neuen Worktree alte
CPU-Module verwenden: Kernel-Mount, Isolation-BIN, Runner, optionaler Broker/
Owner sowie drei ursprüngliche Vorlagenliterale zeigten auf den alten Checkout.
`37f1e7af` leitet die vier Ausführerpfade aus der kanonischen tatsächlich
geladenen Datei ab. `1ddcb1e1` ergänzt Connector/Finish: alle128 historischen
Codepins des fest gepinnten Restoretemplates bleiben unverändert Herkunft;
ihre128 aktuellen Gegenstücke werden vollständig neu gepinnt. Tatsächlicher
Gitroot und HEAD müssen vor dem ersten Finish-Schreibzugriff zur Stagingbindung
passen. Fehlende/aliasierte Dateien, widersprüchliche Pins und alte Code-Assets
stoppen. Die neue `sourceCodeBinding` erteilt ausdrücklich keine Codeakzeptanz
und kein GO. Vorlagen und frühere Freigaben werden nicht überschrieben.

Acht neue reine Ausführerchecks und13 neue Connectorchecks bestanden mit echtem
Exit0; beide Produktumfänge sind unabhängig lesend geprüft. Danach prüfte Root
mit den integrierten tatsächlichen Funktionen alle128 echten Quellpaare und
Gitroot/HEAD, alle26 Originaltemplatehashes/9MD sowie genau drei Rootersetzungen
im Speicher. Ein Importcheck lud die sieben echten Harnessmodule: sämtliche
Selectoren zeigen auf den aktuellen Checkout. Ein Audit-Hook verbot dabei
Subprozesse, Sockets, Dateischreiben und Umgebungsänderungen; kein solcher
Seiteneffekt wurde versucht. Keine Authority- oder Motorfunktion wurde aufgerufen.
Beide neuen reinen Suites sind zusätzlich vor den privaten Originalschritten in
der unverändert vollständigen Pflicht-CI registriert. Drei gezielte bestehende
Workflow-/Privatkanal-Wächter bestanden; das ist noch kein Gesamt-CI-Ergebnis.

Das ist keine vollständige26-Consumer-Render-/Finish-/Mount-/Ownerabnahme.
Ein neues Request wurde nicht erstellt oder vermessen. Die gelesenen Request-
Verträge erlauben das neue Herkunftsfeld und prüfen tatsächliche Länge/SHA;
keine entgegenstehende Request-Bytecap wurde gefunden. Die128 Paare sind fest
begrenzt. Neue exakt gebundene Meter-/Backendreviews, vollständige aktuelle
Coverage, Live-Originalabnahme, Tages-/Finanz-/Zeit-/Fallbindung und alle32
Startgruppen bleiben nötig. Historische Reviews gelten nicht für die neuen
Quellbytes. Kein GO, Claim, Setup, DB-/Provideraufruf oder Ressourcenlauf erzeugt.
Unit60/Auth30, gemeinsamer Speicher/500MB und Langzeitplateau bleiben offen.
[Bereinigter Code-/Integrationsbeleg](belege/v12-native-unit-integration-20261022/CURRENT_CODE_BINDING_20261023.SAFE.json).

## 23.10.,07:37UTC: CI-Fixture und tatsächlicher Renderer

CI39918181373 bestand Browser/Public-Plan, scheiterte aber an einer alten reinen
Backend-Negativfixture: ohne neue Herkunftsbindung stoppte Finish vor dem
beabsichtigten Backendfehler. `273e4e08` ergänzt ausschließlich synthetische
Provenienz und exakte Assertions; unveränderte echte Backend-Ablehnung muss vor
Source-Binder und jedem Save erfolgen. Neun Checks bestanden mit echtem Exit0.
Die Produktguards bleiben unverändert. Zwischenlauf39918554198 wurde vor dem
identischen bekannten Fehler abgebrochen und zählt nicht als CI-Erfolg.

Zusätzlich bestand der echte vorhandene Renderer-Replaytest gegen alle26
Originalvorlagen: Plain-/Restorevarianten, vollständige Originalpins und exakte
Ersetzungszahlen, anschließende JS-Kompilation ohne Ausführung. Nur die lokalen
Materialdateien waren synthetische, danach entfernte Fixtures; kein Caseverzeichnis,
Stage/Finish, Claim, GO, Setup, DB- oder Motorlauf entstand. Das qualifiziert nicht
die vollständige operative Kombination aus atomarem Descriptor, Budget und Owner.
Zeit-/RAM-Nachweis und alle übrigen oben genannten Startgrenzen bleiben offen.

## 23.10.,07:47UTC: Zweite alte VM-Pfadannahme gezielt korrigiert

CI39918968768 bestand die vorher korrigierte Backendfixture, scheiterte danach
im privaten Ressourcenstart-Schritt. Dessen erste exakte Python-Sequenz wurde
einmal lokal reproduziert:19Tests,18ohneFehler,ein Fehler beim reinen VM-Child
`runtime-memory-staging-test.js`. Dessen Modultabelle erwartete weiterhin nur
den alten CPU-Root. `7b051edc` ändert ausschließlich die eine Testkonstante auf
den kanonischen aktuellen Dateipfad; sämtliche VM-Whitelists, Assertions und
Produktguards bleiben erhalten. Danach bestand nur der betroffene eine Test
mit echtem Exit0; die übrigen18 wurden nicht wiederholt. Der erste19er-Lauf
bleibt FAIL. Childstderr war im Pythonlog nicht enthalten und wird nicht erfunden.

Die634B verschlüsselte GitHub-Diagnose wurde tatsächlich über den geschützten
Connector serverseitig geladen und lokal SHA-geprüft aufbewahrt. Der CI-Schlüssel
ist in dieser Cloud nicht verfügbar; keine Entschlüsselung oder Einsicht in
den privaten GitHub-Log wird behauptet. Es entstand keine DB-, Docker-, Motor-,
Provider-, Authority- oder Production-Aktion. Gesamt-CI und operative Zeit-/
Speicher-/Startabnahme bleiben bis zu ihren tatsächlichen Ergebnissen offen.

## 23.10., aktueller Arbeitsstand: Cachevergleich, echter FAIL, fehlende Wartezeiten

Die Hostinventarisierung materialisiert globale Dockerobjekte nicht mehr vollständig.
`1abb2555` verwendet die unveränderliche Elternbindung vollständiger Container-IDs
nur unter frisch geprüfter Unixsocket-/Peer-/Prozess-/exakter Moby28.4.0-Identität.
Neue IDs werden abgefragt, entfernte verworfen, eigene Details bleiben vollständig
und frisch. Fehler verwerfen den Cache; keine ungeprüfte Wiederverwendung.
Elf neue reine Wächter bestanden; unabhängiges Source-/Testreview PASS.

Ein tatsächlicher einmaliger Vergleich prüfte415 identische globale IDs, gleiche
Elternzuordnung und sechs vollständige eigene Objekte. Alle CLI-Aufrufe Exit0 und
zwei natürliche EOFs. Bisheriger Handle2,004040348s; neuer kalter Handle2,040040728s;
warmer Handle0,580515699s. CLI-CPU2,266580/2,375482/0,519314s. Kalt bezeichnet nur
den leeren Handlecache; feste Reihenfolge und Betriebssystem-/Daemoncache können
beitragen. Python-Tracemalloc ist kein gemeinsamer RAM-Nachweis; Daemon-Wirebytes
wurden nicht gemessen. Kein Motor-, Unit60- oder Reservegewinn daraus abgeleitet.

Der danach tatsächlich gestartete neue native Einzelfall6073319e29c220907278e1c4bb8497be
endete mit echtem Parentwait Exit1, zwei natürlichen EOFs, ohne äußeren Timeout/Kill.
Primärfehler: Controller-Entry-Terminaldeadline. Die spätere Host-Abschlussabweichung
ist ein getrennter Cleanupbefund. Quelle vor/nach unverändert, PostgreSQL beendet,
alle letzten Prozesse erfasst/Gruppe leer. Ergebnis bleibt FAIL; motorCalls UNKNOWN,
Unit60/Auth30/16 Kontrollen/Qualität und Reserve nicht qualifiziert.

Gemeinsamer Peak1.340.100.608B, alle sechs Speicherevents in allen Proben0.
130/130 zusätzliche anon/file/kernel-Proben sind mit Index, Cgroupidentität sowie
monotoner UTC-Klammer gültig. Beim größten aktuellen Sample1.336.352.768B folgten
anon645.324.800/file652.791.808/kernel36.564.992B. Diese nacheinander gelesenen Werte
sind keine atomare Zerlegung des historischen Peaks; file enthält auch tmpfs/shmem.
Kein Plateau, keine Zuordnung zu einzelnen Prozessen und kein kausaler Schreib-
oder Speicherdruckbefund. Zehn Schreibphasen sind bestätigt; Psql ohne Seed insgesamt
7,217492139s. Auth-/Kontrollreads und echter R-Transportbeginn blieben unbelegt.
Nominelle zweimal19,9s Antworten und Rechnung mit dem70s-Controller sind keine
gemessene Ursache der fehlenden Zeit. Kein echter Provider-HTTP-Nachweis.

Der Roottrace-Leser war registriert, bekam aber vor dem blockierenden Clientstop
noch kein stdin; die Source endete davor. Das erklärt den leeren Reader, nicht
fehlende Ursprungsdateien. `4482b78a` pumpt ihn vor destruktivem Cleanup. Vor-/Nachpump
teilen dasselbe6s-Budget. Zwei neue reine Checks PASS; tatsächliche native Wirkung
noch offen. Teiltraces bleiben ausdrücklich UNKNOWN und erzeugen keine Akzeptanz.

`63affb05` ergänzt deshalb nur die kleinste fehlende Diagnose: begrenzte private
Zeitmarken um die realen Await-Schritte im bestehenden Entry-stderr. Feste ASCII-
Enums, maximal256 Ereignisse/24KiB, keine Payloads/Hashes/Fehlerwerte. Ein Ende
belegt nur abgeschlossenes Await, niemals ACK/Commit/Dispatch/Erfolg. Fehler oder
fehlender Sink deaktivieren das Logging; kein Retry. Uhrursprung, Unit60/Auth30,
Rückgabe-/Fehleridentitäten, CAS und16 Kontrollen bleiben erhalten. Drei neue
Timinggruppen PASS, anschließend27 betroffene bestehende Guardchecks PASS mit
echtem Exit0; unabhängige vollständige Source-/Testprüfung PASS. Das repariert
noch nicht den Motorzeitfehler. Nächster Schritt ist genau eine frisch gebundene
isolierte Einzelunit zur bisher fehlenden realen Zeitzuordnung.

## 23.10.: Strenge CI-Planabnahme korrigiert; neue Pflicht-CI steht aus

CI39937538074 auf8807 bleibt FAIL ausschließlich Z22/9.1, der84er Originalkanal
bestand. Der separate geschützte historische Readback39944954841 bestand nur
seinen Diagnoseauftrag; er macht den alten CI-Lauf nicht grün. Historischer exakter
Abfrageplan nicht vollständig vorhanden, daher keine behauptete alte physische
Fehlerursache. Keine Originale oder Prüfungen ersetzt/übersprungen.

Eine eigene isolierte PostgreSQL17.6-Fortsetzung prüfte das echte private Kernel-
limit402.653.184B/Swap0 vor/nach SQL, startete mit leerem Katalog und führte die
vier kanonischen Migrationen/20.013 Fixturezeilen aus. Zwei echte Abfragepläne:
Aggregate→BitmapHeapScan→BitmapIndexScan auf dem vorgesehenen Index; beide PASS,
Ausführung1,073/1,177ms. Keine Plannerzwänge, VACUUM- oder Cachemanipulation.
Alle Prozesse0/natürliche EOFs, eigene DB sauber gestoppt, Originalquelle unverändert.
Dies ist kein erneuter historischer CI-Lauf oder Zeit-/RAM-Abnahmetest.

`d8259579` korrigiert den belegten logischen Fehler des bisherigen Validators:
identische Scanarten sind kein Integritätsbeweis und konnten sogar zwei SeqScans
akzeptieren. Der neue eng begrenzte Validator prüft beide VERBOSE-JSON-Pläne einzeln
gegen den echten Katalog, exakte Indexdefinitionen, Schema/Relation, Window-Indexcond,
tatsächliche Loops und zulässige vollständige Index-/Bitmapbäume. SeqScan, unbekannte
oder fehlende Knoten und ungeeignete IndexOnly-Abdeckung werden abgelehnt. tenant_id
fehlt im abdeckenden Index; deshalb kann ein Filter eine andere gültige Scanart
erzwingen. Fixture/SQL-Abfragekörper, Reihenfolge und alle übrigen Z22-Zeit-/Qualitäts-
grenzen bleiben gleich. 16 neue reine Gegenbeispielgruppen PASS; vollständiges
unabhängiges Review PASS. Die neue Live-VERBOSE-/Katalogintegration muss die reguläre
Pflicht-CI beweisen; bisher kein Gesamt-CI-PASS des neuen Codes. App403 bleibt separat.

## 23.10.: Verifizierte Auslagerung und eigene entbehrliche Containerhülle

Elf abgeschlossene Archive und16 von22 weiteren qualifizierten Archiven sind im
bestätigten privaten Empfängerkanal verschlüsselt gesichert. Sämtliche Cipherteile,
verschlüsselten Metadaten und kumulativen Wiederherstellungsindizes wurden vollständig
zurückgeladen und per Bytes/SHA geprüft, bevor exakt gelistete lokale Redundanzen
entfernt wurden. Private Drive-Verweise bleiben im privaten Wiederherstellungsindex.
Sechs Fälle verbleiben, die Pipeline pausiert während der nativen Messung. Die
authentische V11-Deltabasis ist weiterhin notwendige lokale KEEP-Abhängigkeit;
kein eigenständiges externes Vollbackup dieser Basis behauptet.

Die abgeschlossene eigene CI-Containerhülle hatte nur geänderte Laufzeitverzeichnisse
/run und /run/postgresql. Vorab wurden vollständige Konfiguration, Logs, Diff, Image-
und Volumebindung/Hashes gesichert. Nach frischer Schutzprüfung wurde ausschließlich
dieser gestoppte eigene CID regulär entfernt: ohne force, ohne -v, ohne Image-/
Volumelöschung. Persistente eigene PGDATA, Image, Originalquelle und alle Belege
bleiben erhalten. Tatsächlich verfügbar10.630.676.480→11.542.228.992B, netto
911.552.512B; kleine parallele Codewrites verhindern exklusive Allokationskausalität.
Keine DB-Schreibaktion und kein Test bei dieser Bereinigung.

Die10GiB-Einzeladmission ist damit erfüllt, die Voll500-Admission15.179.779.720B
weiterhin nicht. Das Freigeben nur unbeschriebener Reservierungen zweier Original-
RAW-Dateien wurde von der automatischen Prüfung abgelehnt: Änderung von Allokation/
Metadaten trotz bytegleicher Inhalte ist nicht eindeutig vom Originalschutz gedeckt.
Keine solche Mutation erfolgt; ausdrückliche Einzelentscheidung wurde angefragt.
Der spätere Voll500-Pfad braucht außerdem sechs authentische Quell-DBs, nicht nur
V12-POSTRUN; eine kleinere persistente Source-Anbindung ist lediglich vorbereitet.
Alle32 frischen Startbedingungen, Tages-/Fall-/Finanzbindung und neues konkretes GO
bleiben Pflicht. Kein Voll500-Start, Production, Merge oder Budget-/Reserveänderung.

[Bereinigter aktueller Beleg](belege/v12-native-unit-integration-20261022/SPRINT_PROGRESS_20261023.SAFE.json).

## 23.10., 13:41 UTC: Pflicht-CI grün, echte Zeitursache eingegrenzt

[CI39958713128](https://github.com/ernisch/helmut-pilot/actions/runs/39958713128)
auf `2cfd657fdf3b2877db4963334f8fd353898c3c08` ist tatsächlich vollständig
SUCCESS. Alle drei Jobs bestanden, einschließlich84 geschützter Originale,
Offline-/Bereichssuiten, Browser/Mobile sowie neuer Z22-Pure- und Liveprüfung
§1–§11. Live endete13:40:22UTC, Gesamtstatus13:40:37UTC. Die früheren CI-FAILs
bleiben erhalten. Zwei veraltete Diagnose-Testannahmen wurden eng korrigiert:
Anzahl der Z22-Schritte und Rollenidentität des tatsächlich registrierten Entry-
Childs statt pauschal CLOSE_000. Keine Produkt- oder Sicherheitsregel gelockert.
Dieser CI-Erfolg ist kein nativer Zeit-/RAM- oder vollständiger500er Nachweis.

Der inzwischen tatsächlich gemessene Einzelfall2797ac2a auf40a8ce7b bleibt FAIL.
Parentwait Exit1, zwei natürliche EOFs,142,144s äußere Erfassung ohne äußeren
Timeout/Signal. Controller-Entry-Terminaldeadline ist primär; spätere Stop-/Host-
Fehler sind gesonderte Folgen. Quelle unverändert, letzte Prozesse erfasst,
Gruppe leer. Peak1.343.369.216B und alle sechs Events0.125 gültige Komponenten-
Proben; beim größten aktuellen Sample1.312.976.896B folgten anon619.130.880/
file654.630.912/kernel37.638.144B. Keine atomare Peakzerlegung, kein belastbares
Plateau und wegen fehlenden Erfolgs kein Nachweis des500MB-Puffers.

Die neue Diagnose lieferte142 gültige Zeitmarken mit70 abgeschlossenen Paaren.
Der letzte State-CAS vor R endete55,822250750s nach Scopebeginn. Für die nominell
19,9s dauernde R-Antwort und anschließende Prüf-/Schreibarbeit reichen die übrigen
4,178s nicht. Die sechs State-CAS-Awaits beanspruchten12,490566213s, neun Original-
Control-Reads4,778378458s,14 Runtimeprüfungen3,939376280s und Authority3,453332846s.
Das sind gemessene Wartefenster, keine CPU-Zuordnung. Verschachtelte Broker-/SQL-
Zeiten werden nicht hinzuaddiert. Der vorgezogene Roottrace-Reader hatte nun
tatsächlich stdin, Exit0/zwei EOFs und neun echte Control200, jedoch keine End-
quittung; damit ist die Diagnose-Rettung belegt, nicht der Motorerfolg.

Ein separater struktureller Umbau vermeidet vollständige logische Authkopien bei
begrenzten Own7-Änderungen und unveränderten Usage-Writes; Originalgraph, CAS,
Historie und bestätigte ACKs bleiben gebunden. Zehn gezielte reine Suiten bestanden.
Vollständiges unabhängiges Review fand zwei enge Korrekturen: Aliasfreiheit der
Control-Order-Metadaten und zusätzlich monotone30s-Lebensdauer privater Handles.
Beide behoben, drei neue gezielte Regressiongruppen PASS, abschließendes Review PASS.
Als4c01430c/adbcbc70 integriert; neue Code-CI und native Qualifikation stehen aus.
Der neue direkte Schreibpfad gilt
ausschließlich für die isolierte Native-Einzelunit; geteilter Control-Read ist auch
im vollständigen500er Pfad erreichbar. Kein Full500-Schreibgewinn daraus abgeleitet.

Alle33 qualifizierten Archive sind vollständig verschlüsselt zurückgeladen und
hashgeprüft. Exakt gelistete lokale Redundanzen mit insgesamt2.792.718.336B vorheriger
Allokation wurden entfernt. Die Deltabasis bleibt notwendig; kein selbständiges
externes Vollbackup dieser Basis behauptet. Drei weitere abgeschlossene eigene
CI-Worktrees wurden nach vollständiger Git-/Originalschutzprüfung regulär entfernt;
alle Branches, Commitobjekte, aktiven Arbeitsstände und benötigten DBs bleiben.
Dabei beobachtet239.321.088B netto zusätzlich frei. Zuletzt11.486.609.408B verfügbar:
Einzeladmission10GiB erfüllt, vollständige Admission15.179.779.720B weiterhin offen.
Original-RAWs unverändert; ausstehende ausdrückliche Allokationsfreigabe nicht ersetzt.
Sechs authentische Quelldatenbanken,32 frische Startbedingungen und ein neues
konkretes500er GO bleiben erforderlich. Kein vollständiger Lauf gestartet.

## 23.10.: Vergleich des eingebundenen Umbaus bleibt negativ

Der frische native Einzelfall1a964261 auf7cf21c32 endete tatsächlich mit Parentwait
Exit1/zwei natürlichen EOFs nach145,099s; kein äußerer Timeout, Signal oder Retry.
Primär wieder Controller-Entry-Terminaldeadline, sekundär unsauberer Hostabschluss.
Originale unverändert, PG Exit0, letzte Prozesse erfasst und Cgroup leer. Gemeinsamer
Peak1.349.353.472B, sechs Events0;122 gültige Komponenten-/Ankerpaare. Gegenüber2797
liegt der Peak5.984.256B höher. Keine gemeinsame Speicherersparnis, kein Plateau,
Unit60/Auth30/Qualität/500MB-Reserve weiterhin nicht qualifiziert.

Alle70 gepaarten Zeitmarken haben dieselben Vergleichsschlüssel. Prä-D19,035s statt
18,034s; prä-R56,108009355s statt55,822250750s. Sechs State-CAS zusammen12,224424945s
statt12,490566213s: keine wesentliche Verkürzung. Darin seriell zugeordnete Service-
Fenster5,926146428s, darin PSQL5,737673136s; nicht addieren. Original-ReadRPC,
Node-Verarbeitung und Rückweg lassen sich mit den vorhandenen Grenzen nicht trennen.
Bis prä-R28,798264600s disjunkte Awaitpaare plus27,309744755s nicht instrumentierte
Zwischenräume. Der größte Zwischenraum21,847652986s enthält die D-Verarbeitung;
19,9s bleiben nur Fixturekonfiguration, kein tatsächlich erhaltener Timerbeleg.
Keine weitere Cache- oder Deltaoptimierung allein aus dieser Restzeit abgeleitet.

Der Vergleich ist positiv quellgebunden:433 Codepins, ausschließlich vier Produkte
plus Release-Manifest geändert,1530 Runtimepins identisch, gleiche echte Eingaben
und restaurierte Ausgangs-DB. Frische eigene DB/Claims, keine alten Laufrechte.
Der Umbau vermeidet nach Source-/Purebelegen Kopien, beseitigt im gemessenen Ablauf
jedoch keinen maßgeblichen Zeit-/gemeinsamen Speicherengpass.

CI39964220284 auf47eeaeb4 scheiterte korrekt an zwei noch alten Release-Pins.7cf21c32
aktualisiert ausschließlich diese und den abgeleiteten Mappinghash:89 Mitglieder,
historische Belege und Full500Qualification=false erhalten; zehn betroffene Checks
PASS. CI39964840723 besteht öffentliche Bindung, Browser und84 Originale, scheitert
aber im Ressourcenstartvertrag am berechtigten Controlcache-Sourcegate. Lokale
Skripte1–3 bestanden; Skript4 verwirft neue Atomic32050B gegen historisch25446B und
anschließend neue Parts27356B gegen historisch22169B. Skript5 wurde nicht wiederholt.
Historische Nativequalifikation darf nicht auf diese Bytes umgepinnt werden. Für
Full500 fehlen neue exakte Source-/Komponentenqualifikation und geprüfte Adoption;
die isolierte Native-Single-Unit nutzt ihre eigenen frischen Manifest-/Quellgates.

`ba75d837` ergänzt ausschließlich die noch fehlenden privaten Writer-Zeitgrenzen:
gesamter Aufruf, Ownread, dessen tatsächlicher Reader-Promise, Write/Capture und
native HTTP-Schreibantwort. Feste ASCII-Enums, Index/Systemzeiten, global maximal
128 Ereignisse/16KiB, keine Nutzdaten, Hashes oder Fehlerwerte. Fehler/Backpressure
deaktivieren nur Logging. Kein neuer Await, gleiche Reader-Promise-/Rückgabe-/Fehler-
identität; Endmarke heißt abgeschlossen, kein ACK. Source-/Testreview unabhängig PASS,
drei neue Tracegruppen und43 betroffene Writerchecks Exit0. Keine Parts-Suite wiederholt.
Das ist die kleinste fehlende Messung zur Wahl des nächsten belegten Umbaus, kein
weiterer Optimierungsversuch oder nativer Erfolgsnachweis. Neue Einzelunit erst nach
frischer sauberer Head-/Quell-/Platten-/Originalbindung; kein vollständiger500er.

## 23.10.: Echte Writer-Zeitgrenzen grenzen den Engpass ein

Einzelfallaf33f16d aufcad305f9 ist tatsächlich beendet: Parentwait Exit1/zwei EOFs
nach144,753s, primär Controller-Entry-Terminaldeadline; kein äußerer Timeout,
Signal oder Retry. PG Exit0, alle Kinder beendet, letzte Prozesse erfasst, Gruppe
leer; Hostabschluss behält `execution-host-not-clean`. Originale unverändert.
Peak1.344.360.448B, sechs Events0 und124 gültige Speicher-/Ankerpaare. Ein fehl-
geschlagener Einzelfall belegt weder Unit60/Auth30/Qualität noch Plateau oder500MB.

Alle70 neuen Writer-Zeilen sind vollständig: sieben Aufrufe mit je fünf Zeitpaaren,
einschließlich separatem Usage-Aufruf1,586107234s. Sechs State-CAS11,918265219s
zerfallen disjunkt in6,369642982s nativen Write-Endpoint,2,792191486s tatsächlichen
Reader-Promise,0,765701844s übrigen Ownread,0,222252845s übrigen Write,
0,469448844s sonstigen Own-Writer und1,299027218s außerhalb des Own-Writers.
Endpointzeit enthält Bridge/Transaktion/Antwort/Transport, nicht ausschließlich SQL.
Keine verschachtelten Zeiten addiert, keine CPU-Anteile aus Wandzeit abgeleitet.

Die erste Claim-Lesung1,355655585s bleibt erforderlich. Eine optionale private
Fortsetzung könnte höchstens die fünf folgenden State-Reads2,202237745s vor neuen
Pruning-/Versiegelungskosten vermeiden; deshalb kein weiterer Umbau auf Verdacht.
Die tatsächliche Schreibbestätigung dominiert diese sechs Änderungen. Nächste
kleinste Diagnose: vier reine native SQL-Komponenten an einer unabhängig kopierten
kalten af33-DB, echte Writerrolle/RLS und unverändertes JIT. Kein Motor/Provider,
keine alten Claims, kein CAS. Noch kein passender Komponentenlauf gestartet;
frischer konkreter Vertrag, Quell-/Runtimeprüfung und unveränderte Plattenadmission
sind vorher erforderlich. Eine reine SELECT-Messung beweist keine Commit-/WAL- oder
Service-Ledgerkosten und ersetzt keinen erfolgreichen Motorlauf.

433 Codepins gegen1a96: ausschließlich Writer mit begrenzten Zeitmarken geändert;
1530 Runtimepins und36 SQL-Quellbindungen gleich. Beide unabhängigen Auswertungen
bleiben als vollständige private Belege erhalten; öffentliche Hash-/Größenbindungen
stehen im aktualisierten Sprintnachweis. Kein weiterer vollständiger500er gestartet.

Die abgegrenzten SQL-Komponenten sind unabhängig statisch geprüft. Die reine
Kontrolldateiprüfung mit gepinntem PG17.6 meldet für af33 `shut down` und dieselbe
Clusteridentität wie vor dem Lauf; Quelldatei inklusive Zeitstempeln unverändert.
Frische Quieszenzprüfung vor der vollständigen unabhängigen Kopie bleibt Pflicht.
Der neue Komponentenrunner wird separat vorbereitet; alte00c9-Metadatenverträge
erteilen ihm keine Startrechte. Tatsächliche Writer-TX10s/500ms, native PGdefaults
30s/1s und JIT bleiben; vier Lese-EXPLAINs, kein CAS/Claim/Schema-/Providerpfad.

Zwei weitere abgeschlossene öffentliche Arbeitskopien (Source1940 und CI-entry9b8)
nach vollständigem Gitblob-/SHA-/9MD-/Originalschutz-/Rückwegbeleg regulär entfernt,
jeweils tatsächlicher Git Exit0. Alle Branchrefs/Commitobjekte und privaten Außen-
belege bleiben erhalten. Beobachtete Nettogewinne79.888.384B und79.831.040B; keine
exklusive globale Allokationskausalität behauptet. Danach10.803.478.528B verfügbar:
unveränderte Einzeladmission10GiB erfüllt; Voll50015.179.779.720B nicht erfüllt.
CI39968408053 aufcad305f9 besteht öffentliche Bindung, Browser und84 Originale,
scheitert weiter in Schritt19; weitere DB-/Z22-Schritte übersprungen. Fehlerdetails
dieses Remote-Laufs nicht gelesen; voriger exakter Sourcegate-Befund separat erhalten.

## 23.10., 15:36 UTC: Vier echte SQL-Komponenten bestanden

Der erste Komponentenversuch endete vor jeder SQL-Messung mit FAIL: PostgreSQL
entfernte beim Start eigene `pg_internal.init`-Caches zwischen Verzeichnislauf und
Dateimetadatenlesung. Keine Motor-/Provideraufrufe oder vier EXPLAINs. Die neue
Runnerfassung toleriert ausschließlich ENOENT dieser drei exakt gebundenen Cache-
pfade in ihrer eigenen Kopie; unbekannte Dateien, Quellen und Symlinks bleiben
Fehler. Zwölf erzwungene Racefälle und vier Negativfälle PASS. Bekannter Container-
Exit1 wird separat als bekannt und weiterhin fehlgeschlagen behandelt. V1 bleibt FAIL.

V2 `ddfad507b23b46b5b69242e5138f546f` auf unverändertem208e02ab bestand nach
21,537s: vier echte read-only EXPLAIN ANALYZE, alle vier Prozesse Exit0/zwei EOFs,
PG Exit0/sauber, alle Kinder beendet, finale Gruppe leer und letzte Exits erfasst.
Alle sechs Speicherereignisse0; Katalog/Rollen/RLS/Einstellungen PRE=POST,
drei vollständige Quellmanifeste identisch. Unabhängige Actualprüfung PASS.

| Komponente | Tatsächliche SQL-Ausführungszeit |
| --- | ---: |
| Graphprüfung |145,909ms |
| Graphvertrag |168,983ms |
| Own-Projektion |111,166ms |
| Usage-Historienbeweis |41,653ms |

Der gesamte Messprozess einschließlich Start/Transport brauchte0,483144836s.
Komponenten überlappen logisch; feste Reihenfolge wärmt Cache. Keine getrennten
Spitzen/Summen als Motorverbrauch oder exklusive CPU-/Phasenanteile ausweisen.
703.197.184B gemeinsamer Peak gilt ausschließlich für diesen Komponentenfall;
kein Unit60-/Auth30-/Plateau-/500MB-/Voll500-Nachweis. Write-DDL, tatsächlicher
CAS/Trigger/Receipt, COMMIT/WAL und Service-Ledger wurden hier nicht gemessen.
Diese Arbeit im tatsächlichen Transaktionspfad ist der nächste gezielte Messschnitt.

Die fehlgeschlagene eigene V1-Kopie wurde erst nach vollständigem Vergleich,
byteverifiziertem Vierdatei-Endoverlay und gebundenem Rückweg kontrolliert entfernt:
1747 Dateien/30 leere Verzeichnisse, alle Außenbelege und Quelle af33 KEEP,
Rootprozess Exit0. Beobachteter Nettogewinn373.657.600B. Nach V2 verblieben
10.437.079.040B; für weitere Komponenten ist zuerst erneute sichere Kopienbereinigung
nötig. Zwei weitere saubere eigene Worktrees regulär entfernt, alle Gitrefs/Objekte
erhalten; fremde vier uncommittete Dateien strikt KEEP.

Aktuelle CI39972723984 für208e02ab: geschützter Zugang und84 Originale SUCCESS,
Schritt19 Ressourcen-/Sourcegate FAIL. Öffentlich nur Exit1, aktuelle private
Assertion nicht gelesen; bekannter unqualifizierter U/Parts-Gate bytegleich.
Browser während Installation abgebrochen, Z22 übersprungen. GitHub meldet Vercel
SUCCESS. Aktuelle gepaarte Sourcequalifikation ist separat vorbereitet und unabhängig
statisch geprüft; noch keine ihrer fünf frischen nativen Fälle ausgeführt. Historische
Belege bleiben unverändert; keine bloße Pinänderung als CI-Reparatur.


## 23.10.: Frische Schreibdiagnose integriert, erster Quellenfall bestanden

Die explizite CLI `--diagnose-native-claim-only` durchläuft unveränderte echte
Originalkopie, Runtime-/Source-/Nativequalifikation, Admission/Seed und ersten
`Scope.runClaimed`-CAS samt Receipt/COMMIT/ACK/Readback. Der Callback ruft keinen
Motor/Provider auf. Getrennter Terminal `diagnosed`, anschließende echte Readonly-
Snapshotprüfung und unveränderte gemeinsame Native-/PG-/Prozessabschlussprüfung.
Claim bleibt running; Autorität und Kopie sind danach nicht wiederverwendbar.
Normale Unit-Abnahme bleibt getrennt und unverändert.

Unabhängiger voller V1- und enger V2-Deltareview PASS. Zwei Pure-Gegenbeispiele
korrigiert: zurückgegebene Callbackzahl exakt1; Python-Exit echter int0, kein False.
Alte62PASS/2FAIL erhalten. Nach repo-tauglichem Ladeheader einmal aktuelle Tests:
Client16/16PASS, DTO48/48PASS, beide tatsächlicher Root-Exit0. Kein SQL/Native-Erfolg.
[Quellen/Reviews/Pure-Ergebnisse](belege/v12-native-unit-integration-20261022/FRESH_CLAIM_ONLY_INTEGRATED_PURE_20261023.SAFE.json).
Frischer einmaliger Capture und konkret gebundene Root-Startentscheidung fehlen.

Control-V2: Cache-Racefix eng übertragen/unabhängig geprüft; Original-/Auth-/Restore-
pfade unverändert. Lifecycle b6db529358bd08339aa59ebd PASS/RootExit0, vollständiger
unabhängiger Actualreview PASS:22,727456725s, gemeinsamer Lifecyclepeak1.023.897.600B,
sechs Events0, PG0/PostgREST12.2.3 tatsächlich-2 gemäß gepinnter SIGTERM-Policy,
natürliche EOFs/alle Kinder/finale Gruppe leer. Root/Revision/History6000/Katalog/
volle Quelle unverändert. Kein Node/Auth-RPC, keine Mutation oder Motor-/Unit-/
500MB-Abnahme. Vier OLD/NEW/NEW/OLD-Fälle und Gesamt-/Publikationsabnahme offen.

Nach zweiter SQL-Kopie Achtdatei-Endoverlay vollständig lokal archiviert und
rückgelesen/hashgeprüft; nur eigene redundante Sparse-Dateien entfernt, Root-Exit0.
Gesamtoperation61.497.344B netto frei, danach10.787.094.528B verfügbar. Originale/
af33/Außenbelege KEEP, kein Export. Neue Quellenfälle vorab nur abgeleiteter Scratch;
komplette geprüfte Außenbelegsicherung und frische Rootprüfung bleiben vor Entfernung
Pflicht. FAIL/Unknown/fehlende Wiederherstellung KEEP. Alle fünf echten Ergebnisse
bleiben unabhängig vom Scratchretirement für jede Sourcequalifikation erforderlich.


Neuer CI-Lauf39987309979 aufdbdf3d71: Browser und öffentlicher Prüfplan SUCCESS,
Einzelunit-Integration Schritt14 FAIL;84er Originalschritte18/19 SKIPPED, keine neue
Original-/Sourcegateabnahme. Die sechs genannten Fehler stammen aus der Controller-
Testfixture: object.__new__ umgeht den echten Konstruktor und setzte claim_only
nicht. Nur explizites False für diese normale Unitfixture ergänzt; unveränderte
Controller-Suite21/21PASS, tatsächlicher Root-Exit0/710175, keine nativen Prozesse/
DB/Provider. Produktkonstruktor und16Kontrollen/3Positionen unverändert. Remote-
Gesamt-CI bleibt bis neuem tatsächlichem Nachweis offen.


## 23.10.: Fünf aktuelle Quellenfälle und echte Publikation angenommen

Lifecycle, OLD, NEW, NEW, OLD liefen jeweils auf eigener frischer abgeleiteter
DBkopie tatsächlich mit Root-Exit0. Viermal27 echte RPC, darunter jeweils4CAS
mit3Probes und echter Wiederherstellung, History6000, Sourcevollmanifest, Katalog,
finale SQLrevision und alle Prozess-/EOF-/Kernelabschlussbelege unverändert streng
geprüft. Jeder Fall unabhängig angenommen; global108 RequestUUIDs, fünf Rootnonces
eindeutig und vier logische Ergebnisse gleich. Ein Aggregator-DTOfehler vor Ausgabe
bleibt als Harness-FAIL erhalten; korrigierter echter Join Exit0, keine Fallwiederholung.

Root führte den unveränderten gepinnten Offline-Gesamtverifier einmal aus: Exit0,
373 tatsächliche Belegpins/9.618.120B verifiziert. Proof17625B/95c8878e und
Audit120220B/692649f1 sowie unabhängige Actual-/Publicationreviews byteidentisch
veröffentlicht; erst danach separaten SourceDelta als Komponentenquelle qualifiziert.
Neuer integrierter Gate besteht99 Negativmutationen, tatsächlicher Root-Exit0.
Die positiven Descriptorfixtures binden jetzt den expliziten unabhängig geprüften
aktuellen Storage-SourceDelta; bare/historische/gefälschte Pins bleiben negativ.
Fünf bereits separat vollständig geprüfte aktuelle CPU-Quellenpins samt abhängigem
Releasemapping berichtigt, keine Produktquellen oder historischen Abnahmen geändert.
Artefaktreader10 und Runtime-Read-Contract14 PASS. Descriptorlauf22 danach18PASS,
3FAIL/1ERROR; nur die vier Restfixtures und ihr bestehender Assertionhelper korrigiert,
anschließend diese vier gezielt PASS. Reale delegierte Umgebung und strikte Tages-
bindung geprüft; historische Tagesabweichung bleibt negativ. Kein finaler vollständiger
22er Durchlauf behauptet; bereits bestandene Prüfungen nicht pauschal wiederholt.

CI39989672128 bleibt historisch FAIL. Runner-only-Diagnose39997839458 SUCCESS
benennt die tatsächliche Runtime-Read-Contract-Assertion, deren14 Tests lokal PASS.
Keine Rohlogs/Secrets exportiert; neuer vollständiger CI-Lauf nach Push erforderlich.

Die vier gemeinsamen Komponentenspitzen OLD/NEW/NEW/OLD sind
1.013.436.416/1.019.572.224/1.043.419.136/1.015.066.624B; Außenzeiten
37,985/36,378/38,316/36,121s. Das belegt keine RAMersparnis und keinen Unit60-/
500MB-/Plateau-/500er Erfolg. HTTPbytes je Fall57.089.403 identisch; originale
Stringify-Aufrufe5/2/2/5. Der erste echte Schreib-CAS bleibt separat zu messen.

Alle fünf vorab klassifizierten PGscratchkopien erst nach unabhängiger tatsächlicher
Annahme und kompletter hashgeprüfter Außenbelegsicherung entfernt: zusammen
1.849.159.680B Zielallokation. Scope-/Backup-/Root-/ONCE-/Abschlussbelege bleiben
privat erhalten. Zwölf eigene gestoppte Hüllen aus Lifecycle/Fall1–3 nach gesicherter
Inspect-/Log-/Diff-/Outsideprüfung, unabhängigem Review und frischem Einzelcheck
mit plain container rm entfernt; tatsächliche df-Deltas18.137.088+6.049.792B.
Keine Images, Volumes, Bindquellen, Originale, fremden oder aktiven Ressourcen
angefasst. Alte CIDs nicht wiederherstellbar, gesicherte Konfiguration und erhaltenes
Image erlauben nur neue eigene Hüllen; kein physischer Scratchendstand versprochen.

[Generierter Nachweis](../../scripts/helmut-resource-meter/control-cache-native-qualification-20261023.SAFE.json),
[Audit](belege/current-control-source-qualification-20261023/GENERATION_AUDIT.SAFE.json),
[unabhängige tatsächliche Gesamtabnahme](belege/current-control-source-qualification-20261023/INDEPENDENT_ACTUAL_REVIEW.SAFE.json).
[Zusammengeführtes tatsächliches Ergebnis](belege/current-control-source-qualification-20261023/ROOT_INTEGRATION_RESULT.SAFE.json).
Nächster Pfad: Commit/Push, frische exakte HEAD-/Root-/Admission-/Einmalbindung und
echte isolierte claim-only-Schreibdiagnose; kein weiterer Voll500. Rund4,44GB fehlen
weiter zur vollständigen Plattenadmission; keine sichere Mehr-GB-Bereinigung belegt.


## 23.10.: Echte Claimdiagnose und gezielter Snapshotfix

Gepushter sauberer Commit23ee9c7a, neuer Descriptor/Rootreview/Adoption, exklusive
10GiB-Admission; genau ein frischer nativer Claim-only-Fall2f5448, tatsächliche
Helper-/CLI-Exits1, beide natürlichen CLI-EOFs/Wait, keine Signale/Timeouts.
Echter Claimcallback genau1, Entry0+2EOF in8,222s; zwei echte Source-PSQL-Prozesse
mit COMMIT/ACK. Motor/Provider0. GesamtFAIL: separater Readonly-Endsnapshot Stage8
scheitert mit auth-state-projection-not-admitted. Own7/Revision1/History/Usage/
Katalog-Endjoin bleibt ungeprüft; Claim/Autorität verbraucht, eigene DBKEEP/NOREUSE.
Host45Kinder/40Observer geschlossen, PG0, korrekte ursprüngliche PostgREST-Policy,
finale Kernelgruppe leer,77Samples alle6Events0; gemeinsamer Peak1.240.449.024B.
Das ist keine Unit60-/Auth30-/500MB-/Plateau-/Voll500-Abnahme.

Ursache: Der unveränderte native Graphprojektor verlangt eine transaktionslokale
Scopebindung. Der eigene spätere Snapshot eröffnet eine neue Readonly-Transaktion
und erbte sie nicht vom früheren COMMIT. Genau eine feste SET LOCAL-Anweisung im
speziellen Snapshot ergänzt, nach unverändertem Owned-DB/PG17/postgres-Boundary;
Originalguard/SQL/ACL/Rollen/allgemeiner Reader/Fristen/CAS/Abnahme bleiben gleich.
Root und unabhängiger Quellenreview PASS, neue gezielte Pure-SQLkonstruktionsgruppe
PASS (a29b16), keine echte SQL-/Nativewirkung aus dem Purecheck abgeleitet.

Nach erhaltenem Fall rund10,324GB frei: Zur unveränderten10GiB-Komponentenadmission
fehlen413MB; zur Voll500-Admission rund4,86GB. Zusätzliche enge bestehende Backup-/
Git-Audits belegen keinen sicheren413MB-Kandidaten. V11-Basis notwendig für17
Deltaarchive; af33/neue Claimkopie/Originale/Quellen bleibenKEEP. Kein weiterer
nativer Start/keine neue Einmalautorität vor tatsächlicher Kapazitätslösung.
[Unabhängiger tatsächlicher FAILreview](belege/native-claim-only-20261023/INDEPENDENT_ACTUAL_REVIEW.SAFE.json),
[unabhängiger enger Fixreview](belege/native-claim-only-20261023/INDEPENDENT_FIX_REVIEW.SAFE.json),
[Rootbefund mit Pins und nächstem Schritt](belege/native-claim-only-20261023/ROOT_ACTUAL_AND_FIX.SAFE.json).


## 23.10.: CI-Zugang an unveränderliche Eingabecommits gebunden

Neuer CI40000572324 aufc0a847d7 scheitert vor Tests/Originalen an Ownerzugang Step5,
validate_owner_access219;84/Z22 SKIPPED, Browser/Prüfplan/Vercel SUCCESS. Öffentlicher
Checkout6b46ea24 und späterer API-Merge9be0edf1 haben nach tatsächlichen Gitmetadaten
dieselben geordneten Eltern b1333219/c0a847d7 und denselben vollständigen Tree03234c6.
Der genaue historische API-Antwortwert beim Reject ist nicht gespeichert; der alleinige
damalige fehlgeschlagene Teilvergleich bleibt UNKNOWN.

Autozugang bindet nun aktuelle Basis/Head exakt an die schon gegen die echten geordneten
Git-Eltern validierten Eventcommits. WorkflowSHA/Checkout/HEAD/OwnerIDs/RepoIDs/Fork/
Run/Attempt/Branch bleiben streng. Der instabile Live-Mergealias wird im Autozweig
ersetzt; tatsächlicher vertrauenswürdiger Checkout bleibt zwingend. Receipt verlangt
baseSHA typgleich aus frischem Kontext, vor Transport/Key/GPG. Manuelle Approvalfunktion,
Reviewer-/Reject-/Environmentregeln und Provisionierung bytegleich.

Root und unabhängiger SourceReview PASS. Gezielte34Checks:33PASS/einArtifact-ERROR,
weil das echte öffentliche CI-Cipher im Sparsecheckout fehlte. Byteidentisch aus dem
bestehenden HEAD-Gitblob restauriert, Transport-SHA geprüft; nur den fehlgeschlagenen
Hashcheck erneut ausgeführt/PASS. Keine privaten Originale entschlüsselt/Secrets gelesen,
kein abschließender durchgehend grüner34er Durchlauf behauptet. Neuer Remote-CI-PASS
erforderlich. Nach Cipherrestore fehlen rund443MB zur Komponentenadmission/rund4,89GB
zur Voll500-Admission; angefragte Original-RAW-Metadatenausnahme noch nicht erteilt.
[Öffentliche Originalmetadaten und Review/Testbelege](belege/ci-owner-immutable-inputs-20261023/ROOT_INTEGRATION_RESULT.SAFE.json).


## 23.10. später: echte U/Parts-Leseanbindung und enger CI-Fixturefix

Runtime562d880f: private korrelierte Zeitgrenzen und separater Readonly-HTTP-Modus.
Frische Fälle9b3 (signierter Vertrag/Publikation) und44d4 (zusätzlich zwei echte
U.readControl/Parts-Lesevorgänge) bestanden.44d4 verknüpft5/5Anfragen, drei
Qualifikationsreads und zwei U-Reads mit Antwort/Trace/privatemFooter. Kalt1,346893s,
warm0,261859s;6000Historyzeilen/1868Knoten. Gemeinsamer Peak1.137.496.064B,
54Samples/Events0, alleKinderExit0/zweiEOFs, PGsauber/Gruppeleer. KeineUnit,
keinUnit60/Auth30/500MB/Plateau-Nachweis. Keine alteAutorität wiederverwendet.

Die zerlegte fehlgeschlagene7bace-Einzelunit bleibt71,709s imEntry: Auth6,395s,
neunKontrollen9,663s, Scope-CAS8,428s, Draftkontexte1,091s, übrigeStateReads0,681s,
D21,570s, R19,990s, Rest3,892s (gerundet/disjunkt). D enthältUsage, nichtaddieren.
SiebenOwn-PSQL-Prozesse beanspruchen6,044s innerhalb6,724s Own-Write-HTTP.
Die nächste fehlendeGrenze liegt innerhalb echter Schreibtransaktionen;
keine unbelegteParts-/Graphoptimierung oder Wiederholung des vollenUnitfehlers.
Zwei getrennte Diagnoseoverlays und ein strengerDecoder sind vorbereitet,
noch nicht nativqualifiziert. Kleinster vorhandenerPfad: frischerClaim-only von
erhaltenem authentischemspätemOriginal, genau eine echte State-CAS. Unverändertes
7bace-POST-D kann wegen vorhandenerDiagnoserollen undConsumedGrants nicht neu
geseedet werden; keinRebase/Claimreuse und keine Behauptung identischer7bace-Basis.

CI40035705164 vollständigSUCCESS; neueCI40040458161/562d880f scheitert vor
Originalentschlüsselung an einemTestfixture-Nutzer. Testfix3cbcfad0 bindet nur den
Fixture-Reader an os.getuid(); unveränderterProduktreader lehnt falscheUID ab.
GezielteQualifikation mit realer und synthetischabweichenderFixture-UID PASS.
Keine151er/179er Gesamtsuite erneutlokal; neueRemote-CI bleibt erforderlich.

Vier bestehende abgeschlossenePG-Archive wurden ausschließlich an den bestätigten
Empfänger verschlüsselt, vollständig zurückgeladen und byte-/SHA-/indexgeprüft.
Erst danach wurden die exakten Klararchive und redundanten Bulk-Cipherkopien
entfernt; alleMetadaten/Indizes/Belege bleiben. ZweiweitereArchive werden ebenso
übertragen. NeueVollbackups9b3/1a96 sind lokal mit vollständigemphysischemRestore
geprüft; nur die entbehrlichenTEMP-Restores sind entfernt, Quell-PG/ArchiveKEEP.
Original-RAW, benötigteOriginale und Gitrefs/Objekte bleiben erhalten. Die frischen
Pins/Drive-Indizes stehen im [bereinigtenBefund](belege/native-claim-only-20261023/ACTUAL_NATIVE_AND_CAPACITY.SAFE.json).


## 24.10.: echte Schreibphasen gemessen, struktureller Umbau noch ohne Wirkungsaussage

Frischer isolierter Claim699469bb77dde904a7d26035ef472ddd auf eigenem
Diagnosebranch codex/native-claim-write-phase-20261024/78a4c1a9 PASS. Produktbasis54c61de1
bleibt getrennt. Drei Diagnose-Dateien: ursprünglicheSQL-Befehle mit neun skalaren
Messpunkten, private monotone/wall-Clockanker und tatsächliche Readonly-Session-GUC-
Qualifikation vor Seed/Service. Keine Originalfunktion verändert. 55 Overlay-/Decoder-
Checks plus elf enge Sessionguard-Fälle PASS. Neuer Fall: genau Seed1+State1, beide
COMMIT/ACK/Exit0/zweiEOFs; Callback1, Ownrevision1/running/consumed/NOREUSE, siebenOwnkeys,
History6000 unverändert. Unabhängig50Belegprüfungen PASS, CODE435/RUNTIME1530 einschließlich
JIT974 exakt, Sources436/RuntimeBindings553. Alle44Hostkinder/39Observer sauber beendet,
Kernel75Samples/Events0/Gruppeleer/bisletztemExit, Peak1.218.666.496B.

Strikter Decoder unverändert:26PID-gebundeneSQL-Dauern, neunMarker, achtServicephasen;
PSQL905,736911ms monotonic. Wall-Phasen: SourceGraph+OwnProjection228,161ms, OriginalCAS
189,183ms, ACK+Readback37,324ms, ChangedRootCompare191,764ms, OwnCAS+Receipt180,876ms;
COMMIT1,935ms. Verschachtelte Phasen nichtaddieren oder alsCPU ausgeben. Vier volle
Bridge-TopMap-Prüfungen old/new/old/new sind im Code belegt; keine pauschaleErsparnis
von600,801ms behauptet. Zentralisierung in der verpflichtendenReceipt ist lokal
als88a5b818/22679d99 umgesetzt; Rollback-/Integritäts-/NativeVergleich noch erforderlich. Dieser Fix betrifft
die private Einzelunit-Anbindung; Full500-Pfadeinbindung und tatsächliche Motorwirkung
sind nicht nachgewiesen. KeineUnit60/Auth30/Reserve/Plateau-/500erAbnahme.

Die39,8s zweier gebundener19.900ms Mocklatenzen bleiben unverändert. Die alten
D/R-Lücken sind keine belegte20s vermeidbareNachverarbeitung; keinProviderrewrite.
InitialClaim liegt innerhalb derselbenEntry/Auth/Unit-Uhr; nurSeed liegt davor.

Alle sechs alten Vollarchive sind nach Cipher-/Metadata-/Index-Vollrückprüfung
ausgelagert; Plainarchives+Bulkcipher/Returns kontrolliert entfernt, MetadatenKEEP.
1a96 ist zusätzlich vollständig offsite gesichert und byte-/SHA-/indexzurückgeprüft;
1a96-Quellkopie/Klararchiv und zehnBulk-Cipher/Returns danach perfrischemRoot-/
Originalschutz+vollständigemSHA/11MD-Prüflauf kontrolliertentfernt: tatsächlicherExit0,
+744.140.800B beobachteteFreigabe. Metadaten/Index/OriginaleKEEP. Neue6994-Kopie
benötigt wiederPlatz; freieKapazität immerfrisch messen, Gewinne nichtblindaddieren.
CI40042703899 auf54c61de1 vollständigSUCCESS einschließlich84Originale. NeueCode-CI
für22679d99 erforderlich. Pins/Drive-Indizes im bereinigtenBefund.


## 24.10.: verpflichtende Bridge-Prüfung strukturell vereinfacht

22679d99 (auf88a5b818): Pflichtreceipt liest beideOriginalmaps frisch, prüft Own-before
weiter gegen den echten gesperrten DBbody und übergibt diesen als siebtesArgument an
den reinen Compare-Helper. Frühe doppelte Ownprojektion/Delta-Prüfung sowie doppelter
Requestparse und Own-Read entfallen. Bei gleichemRoot wird genau eine genuineMap
verwendet. Locks, OriginalCAS/ACK/Readback, Receipt-ACL/RLS/PID/xact/Nonce/Quellen-
und Revisionsprüfungen unverändert. Kein Cross-DO-Cache/Retry oder Guardskip.
Fehler nachOriginalCAS müssen dieselbeTransaktion vorOwnACK/COMMIT vollständig
zurückrollen; genau dieser nativeNegativnachweis ist noch offen.

30Compiler-Purechecks und25Python-Bridgequalifier-Tests PASS, zweiunabhängige
Quellenreviews ohnekonkretenBug. Keine nativeWirkung, Unit60, Auth30 oder500MBReserve
daraus abgeleitet. Compare-Body1313273b41be966c4a86cb34fb933079f4312527bfe3f47b267276bba464aa71;
Receipt-Body058e191329a6ed64753fd3660a7219b6cb192c2f8481ad1a94aa6719b60edbdd.

9b3-Vollbackup vollständig verschlüsselt offsite und byte-/SHA-/Indexzurückgeprüft.
Ein ersterVerifier brach vorONCE an falschemProvider-MIME ab; keine Prüflockerung:
tatsächlicherDateityp korrigiert, alleBytes neu authentischzurückgeladen, danach
unveränderterVerifier PASS. Sechs alte redundanteCipherdownloads separat gegen
neueReturns vollverglichen und entfernt: +123.924.480B beobachtet. Quell-PG/Archiv
bis separatemRetirementKEEP.


## 24.10.: echte State-CAS bestätigt; Guard-Gesamtabnahme offen

Guardbranchf988991b, im Arbeitsbranch1845bc64 integriert: vier explizite SQL-
Sicherheitsfälle, neueCopy/Authority jeFall, Entry/Motor/Provider gesperrt. Echte
U.write→T.prepare-SQL→T.acceptResult-Verbraucher; elf vollständige logische
Tabellenhashes einschließlichNodes/Usage/Own/Katalog.

6e9f75c9/bb42 bleibtFAIL vorClaim: Snapshot überschritt128MiB-temp_file_limit.
Fixbfd42002 materialisiert ausschließlich64Hex-Zeilenhashes; 6f760dc3 ergänzt
festePRIVATE-Tabellen-/Katalogmarker. Keine Speichergrenze erhöht.

Frischerb0f2c82e/6f760dc3: State-CAS mitOriginal-/Own-ACK undNachvergleich PASS;
alle8Probe-PSQLs Exit0/zweiEOF, Probe8,774411633s einschließlichdreiSnapshots,
keineUnitzeit. GesamtlaufFAIL danach: finalerVertragsreadback kollidierte mit
demInitialreadback-O_EXCL-Capturename. Fixf988991b: zwei festeNamen, identischesSQL
undPrüfungen; zwei gezieltePuretests PASS. NativeClosure/SameRootUsage/Negativrollback/
Vergleich offen. B0f2-Final-Originalcheck beimAbbruch unterbrochen; anschließende
frische84-/RAW-/436-/553-Schutzprüfung für00c9-Backup PASS. AlteFälle nicht wiederbenutzen.

9b3 nachActual-Drive-Vollrückprüfung kontrolliertausgelagert: +739.753.984B beobachtet;
Originale/Indizes/MetadatenKEEP. 00c9 vollständig lokal archiviert und physisch
wiederhergestellt; Originalquelle/Archiv/TEMP bisgesondertemRetirementKEEP.

22679d99-Receipt ist ausschließlich im privatenEinzelunit-Schreiber wirksam.
Full500: production-adapter→storage.mutateAuthStore→U.write→helmut_auth_state_cas_v1,
ohne dieseReceipt. KeinFull500-Gewinn daraus hergeleitet. GemeinsamerControlreader/
Budget-/Leasepfad vorhanden; Unit60/Auth30/16Kontrollen/500MB/32Startbedingungen offen.
