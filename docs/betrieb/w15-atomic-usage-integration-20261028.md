# W15: lokale Integration des atomaren Nutzungsspeichers

Stand: 28.10.2026. **Teilweise abgeschlossen; kein Mock500- oder Production-Nachweis.**
Eigener Branch `codex/w15-atomic-usage-integration-20261028`,
[Draft-PR974](https://github.com/ernisch/helmut-pilot/pull/974), gestapelt auf
PR973 `fa506939` und PR972 `c36bd427`. Aktueller und neu ausgeführter Code `d2920d6d`.
Tatsächlich ausgeführter Anschlussstand D: `d66a94dc`; RAM-Diagnose: `55dda919`.
`e1a62acc` ergänzt danach ausschließlich Fehler-Metadaten; kein Lauf wurde wiederholt
oder nachträglich auf diesen Kopf umetikettiert.
Keine Änderungen im ursprünglichen972-Worktree oder am973-Branch; deren offene
Arbeit bleibt erhalten. Keine Merges, Production-Aktionen oder echten Modellaufrufe.

Der erste gezielte Transport-Sprint führte genau eine kleine HTTP-Probe
und eine begrenzte frische Auth-Probe aus. Die Auth-Probe endete beim kontrollierten
Prozessabschluss mit **FAIL**; danach keine Wiederholung und keine neue
End500-Diagnose. Der ursprüngliche11.UNKNOWN bleibt unverändert ungeklärt.

Im anschließend ausdrücklich freigegebenen Sprint wurde der kleine echte
PostgREST-Abschlusscheck bestanden. Die danach einmalig gestartete neue
End500-Diagnose B scheiterte nach290 bestätigten Vorgängen vor dem291.nativen
Schreiben. Unabhängige Endsicht bestätigt sämtliche Daten und0aktive Profile;
kein End500-PASS. Alle historischen UNKNOWN-/FAIL-Befunde bleiben erhalten.

## Was tatsächlich integriert und geprüft ist

Der standardmäßig ausgeschaltete atomare Speicherweg wird ausschließlich in
frischen netzlosen lokalen PostgreSQL-Kopien installiert. Der Originaldump braucht
fünf additive skalare Spalten, die973s Komponentenfixture bereits voraussetzt:
`kein_aufruf`, `source_id`, `package_id`, `vorgang_id`, `knowledge_object_id`.
Der lokale SQL-Vorschlag ergänzt nur diese Spalten und verlangt vor der DDL
`helmut.local_usage_experiment=on`. Die eigentlichen atomaren Protokollfunktionen
bleiben unverändert. Keine Production-Migration oder Production-Flagänderung.

Die echte Auth-Messhülle erfasst jetzt sowohl den ursprünglichen CAS-Schreiber
als auch `llm-usage-atomic.write`, einschließlich interner Pipeline-Sperren und
Nutzungsspeicherungen. Eine echte private relationale Quittung ersetzt keine
Sicherheitsprüfung: kopierte Quittungen bleiben ungültig. Vollständige native
Auth-Zählungen und Ergebnis-Audithashes verwenden den kettengeprüften logischen
Lesepfad; der physische Blob allein enthält die Nutzungshistorie nicht mehr.

Der CPU-Quellvertrag bindet den geänderten Kostenquelltext und die beiden
neuen transitiven Abhängigkeiten `llm-usage-atomic.js`/`auth-store-cas.js`.
Der gezielte Stored-Command-Test besteht **81/81**, einschließlich des auf973
fehlgeschlagenen geschlossenen Worker-Modulgraphen. Keine vollständige lokale
Suite wiederholt. Bestehende973-Komponentennachweise bleiben historische Belege
für ihren exakten Kopf; sie werden nicht auf974 umetikettiert.

Die vorhandene500/500-Quellenqualifikation wird ausdrücklich begrenzt übernommen:
16/18 Dateien bytegleich, die echten D-/R-Konstruktoren und die Herkunftsfunktion
auch in den beiden geänderten Dateien unverändert. Der neue Routenzeitraum bindet
frische reale Laufzeitgrenzen; das fachliche Eingabedatum bleibt unverändert.
[Quellvergleich](belege/w15-atomic-usage-integration-20261028/SOURCE_COMPATIBILITY.SAFE.json).

## Erfolgreicher begrenzter Ablauf D

Echter Originalrestore, atomarer Bootstrap mit vollständigem logischem Hashvergleich,
frische Ed25519-Signatur, echter Worker/fullC, Prepared0/Open, HTTP/PostgREST,
echte Auth-APIs und ein separater uninstallierter EU-DraftCompletion-Fall.

| Tatsächlicher Befund | Messwert / Ergebnis |
| --- | --- |
| Originale Nutzungshistorie | alle5.000 Einträge vollständig hashgleich erhalten |
| Vollständige Worker-Vorbereitung | 19.868,511201ms |
| Installation-Open | 49,115307ms |
| Vollständig bestätigte Auth-Vorgänge / native Schreibvorgänge | 12 /12 |
| Auth-Maximum einschließlich ganzer API bis ACK | 2.491,931300ms |
| Natives Schreibmaximum | 1.556,436538ms |
| Gemeinsamer Kernelpeak dieses begrenzten Ablaufs | 719.044.608Bytes |
| Lokale EU-Simulation / reale Modellaufrufe | 1 /0 |
| Simulierte bestätigte Kosten / erhaltene UNKNOWN-Reserve | 248 /81.400µUSD |
| Testprofile am Ende | 500 vorhanden,0 aktiv |

24 Start- und24 Abschlusszeilen der Auth-Beobachtung sind dauerhaft erhalten. Die unabhängige
Abnahme bestätigt16/16 Punkte einschließlich echter Signaturprüfung und nativer
Read-only-Endsicht. Haupt-Auth enthält5.001 Einträge nach einem echten kostenfreien
Skip; die getrennte EU-Komponentenzeile enthält einen weiteren Eintrag.

HTTP-Status liefert1.500 **Sollpositionen**, keine neu produzierten Ergebnisse.
Der signierte Cold-Open erfolgt vor diesem HTTP-Statusaufruf; kein neu gemessener
Cold-HTTP-Zeitnachweis wird behauptet. Der echte Runtime-Riegel verweigert0aktive
Profile unverändert. Journal-Claim/Stop und Ablehnung eines zweiten Claims sind
geprüft; keine Unit wurde betreten.

Der EU-Komponentenfall verwendet tatsächliche Storage-, AI-, private Quittungs-
und Kostenfunktionen mit genau einer lokalen HTTPS-Simulation. Er endet nach
privater DraftCompletion vor Dstore/R. Der vollständig installierte positive
D→R→Ergebnisjournal-Ablauf verlangt weiterhin native500aktive Profile und bleibt
Bestandteil der später gesondert freizugebenden Ausführung.

[Unabhängige Abnahme D](belege/w15-atomic-usage-integration-20261028/D_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [Auth-Rohzeiten](belege/w15-atomic-usage-integration-20261028/ATOMIC_AUTH_PREPARED0.SAFE.json)
· [EU-Komponentenfall](belege/w15-atomic-usage-integration-20261028/ATOMIC_EU.SAFE.json).

## Genau eine End500-Allokationsdiagnose: abgebrochen

Frische netzlose Kopie, vollständiges unverändertes inertes End500-Datenmodell,
6.000 Usage-Einträge,3.501 native Seed-Postimages, tatsächlich neu vorbereiteter
W15-Command als unveränderliche Daten und echter geladener Server-Modulbestand.
PostgreSQL, PostgREST, Node, SQL-Kinder und belasteter Dateicache im selben
technisch auf2.048.000.000Bytes begrenzten Container, Swap0. Kein Cache-/GC-Eingriff,
kein Messwertabzug und keine Verrechnung der395MB aus973.

**10/500** atomare Schreibvorgänge einschließlich Revision und vollständigem
Postimage bestätigt. Beim11. Schreiben TypeError vor bestätigtem ACK;
Ausgang bleibt **UNKNOWN**. Sofort beendet, kein Retry und kein weiterer Versuch.

| Tatsächlicher Messwert | Wert |
| --- | --- |
| Gemeinsamer Kernelpeak | 1.154.990.080Bytes |
| Rechnerische Reserve | 893.009.920Bytes =43,60% |
| Maximale vollständige bestätigte Auth-Zeit | 20.034,336894ms |
| Maximale bestätigte native Schreibzeit | 12.559,368517ms |
| Unbestätigte ganze Auth-/Schreibvorgänge | 1 /1 |
| Aktive Profile am Abschluss | 0 |

Die Reserve ist für den beobachteten kurzen Verlauf erfüllt. Die Diagnose
scheitert am technischen Fehler, nicht an einer gemessenen Reserveverletzung.
Keine ausreichende Laufdauer für eine belastbare End500-/Restwachstumsprognose;
kein RAM-PASS für500Units, kein vollständiges Auth30-PASS und kein Unit60-Nachweis.
Die unabhängige Abschlussprüfung bestätigt alle3.501 Datenpostbilder und6.000
Nutzungseinträge vollständig;0aktive von500Profilen. Der letzte sichtbare
Probeindex ist9; der11.Schreibvorgang ist nach Abschluss nicht sichtbar,
seine fehlende Laufquittung wird dadurch nicht nachträglich bestätigt.
468 dauerhafte Beobachtungen,55 natürliche Major-GCs. Nur ein früher
PostgreSQL-Statistikpunkt; kein später WAL-/Checkpoint-/Autovacuum-Verlauf.
Größte beobachtete Einzel-RSS-Werte: Node398,8MB, PostgREST298,8MB,
PostgreSQL-Backend324,6MB. Diese Maxima sind nicht gleichzeitig und werden
nicht addiert. Treiber, Gateway und PostgREST beendet; PostgreSQL/Daten erhalten.
[Unabhängige Fehlerabnahme](belege/w15-atomic-usage-integration-20261028/RAM_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [native vollständige Endsicht](belege/w15-atomic-usage-integration-20261028/RAM_NATIVE_FINAL_INDEPENDENT_READONLY.SAFE.json).

Die tatsächliche Fehlerursache unterhalb TypeError ist aus den damaligen Belegen
nicht rekonstruierbar. Keine Vermutung als Ursache darstellen.

Nach dem Abbruch wurde nur die Fehlerprotokollierung ergänzt: ausdrücklich
erlaubte Transportcodes und sichere Bytezähler, keine Nachrichten, Header,
URLs, Adressen, Schlüssel oder Inhalte. Drei reine Prüfungen bestanden;
unabhängiger statischer Review12/12. Der alte Fehler bleibt UNKNOWN.
[Trace-Review](belege/w15-atomic-usage-integration-20261028/TRANSPORT_METADATA_REVIEW.SAFE.json).

## Gezielte Transportdiagnose: Schreibbestätigungen grün, Abschluss FAIL

Zuerst ausschließlich vorhandene Transport-, PostgreSQL-, PostgREST-, Zeit- und
Kernelbelege geprüft: kein OOM, kein PostgreSQL-Fehlerbeleg, keine belegte
Überschreitung des Auth30-Limits beim11.Vorgang. Dessen native Dauer446,903297ms
und ganze Auth-Dauer1.417,059425ms erklären den TypeError nicht. Der ursprüngliche
Fehlerbericht hat den unterliegenden Transportcode nicht erhalten. Ein bestimmter
HTTP-, Pool-, Zeitlimit- oder RAM-Fehler ist deshalb weiterhin nicht nachgewiesen.
Keine ungeprüfte Transport- oder Speicheroptimierung vorgenommen.

Eine kleine HTTP-Probe über das echte lokale Gateway mit7s realem Eventloop-Stillstand
endet mit6/6 vollständigen Antworten, ohne Datenbank oder Modelle. Kein reproduzierter
Fehler; insbesondere kein Beweis für oder gegen den damaligen unbekannten Ausgang.

Danach genau eine frische isolierte Datenbankkopie, keine Wiederholung des alten
Schreibvorgangs:16 neue Nonce-gebundene Auth-Mutationen über den echten atomaren
Speicherweg, jeweils Revision, private Schreibquittung und vollständiges Nachlesen.
Der reale W15-Command bleibt als gehashte Daten geladen, ohne Ausführungsrecht.

| Tatsächlicher Befund der begrenzten Auth-Probe | Messwert / Ergebnis |
| --- | --- |
| Vollständige neue Schreibbestätigungen / Postimages | 16 /16 |
| HTTP-Anfragen | 49/49 Status200;33 Lese-,16 CAS-Anfragen;0 Requestfehler |
| Ganze Auth-Zeit maximal | 3.141,334564ms |
| Native CAS-Zeit maximal | 1.951,072017ms |
| Gemeinsamer historischer Containerpeak | 1.475.330.048Bytes |
| Reserve zum unveränderten Limit | 572.669.952Bytes =27,9624% |
| Profile / aktiv / Usage am Ende | 500 /0 /6.000 |
| Units / echte Modelle / Wiederholungen | 0 /0 /0 |

Der Peak gehört zum bereits genutzten begrenzten Container einschließlich alter
Diagnose und frischer Kopie. Er ist **kein frischer End500-RAM-Nachweis** und keine
Prognose bis500Units. Swap0, keine OOM-Ereignisse. Auth-Zeiten, Transportverlauf,
GC- und gemeinsame Kernelmessungen sind dauerhaft erhalten. Native Invarianthashes
bestätigen vollständige Historie, Kosten-/Sicherheitsbindungen und übrige Daten;
Quellzustand vor/nach identisch. Keine Profilaktivierung.

**Der tatsächliche Diagnoseabschluss bleibt FAIL:** Das eigene Programm forderte
SIGTERM an; PostgREST endete mit SIGINT. Die neue Abschlussklassifizierung akzeptierte
nur Exit0 oder SIGTERM und verweigerte die Bestätigung. Alle49 HTTP-Anfragen und
16 Schreibquittungen waren vorher vollständig. Zwei spätere Socket-Close-Ereignisse
nach dem letzten ACK gehören zum Abschluss, nicht zu einem gescheiterten Schreiben.
Alle eigenen Treiber-/Gateway-/PostgREST-Prozesse sind beendet; Daten erhalten.

Die bestätigte kleine Programmkorrektur `f8702304` akzeptiert den dokumentierten
PostgREST-UserInterrupt-Ausgang nur nach erfolgreich zugestelltem eigenem SIGTERM;
keine erzwungene Beendigung und keine offenen Sockets bleiben Voraussetzungen.
Primärbeleg: [PostgREST12.2.3, Unix.hs](https://github.com/PostgREST/postgrest/blob/v12.2.3/src/PostgREST/Unix.hs#L23).
Neun reine Zuordnungsprüfungen und unabhängiger statischer Review bestanden;
**kein erneuter Lauf**, keine nachträgliche PASS-Umetikettierung. Die Korrektur
behebt nicht den weiterhin ungeklärten ursprünglichen11.TypeError.

Stand des ersten Transportsprints, vor dem anschließenden neuen GO:
Die damals bedingt freigegebene neue End500-Diagnose wurde **nicht gestartet**:
Der notwendige Fehlerfix-/Start-PASS fehlt, außerdem gilt nach diesem tatsächlichen
Diagnose-FAIL die Stopregel. Neuer Ausführungsversuch benötigt ein neues gezieltes GO.
[Unabhängige17-Punkte-Abnahme und exakte Beleg-/Quellhashes](belege/w15-atomic-usage-integration-20261028/AUTH_TRANSPORT_PROBE_RESULTS_REVIEW.SAFE.json)
· [bereinigte Sprintübersicht](belege/w15-atomic-usage-integration-20261028/TRANSPORT_SPRINT_SUMMARY.SAFE.json).

## Echter PostgREST-Abschlusscheck: PASS

Genau ein neuer kleiner echter Prozessstart auf der bestehenden isolierten
Testdatenbank; keine Auth-/CAS-Schreibanfrage und keine Wiederholung der16/49-
Belege. Die bestehende `serve()`-Abschlusslogik und unveränderte SIGINT-Bewertung
werden tatsächlich ausgeführt. Ergänzt wird ausschließlich die messende Forderung,
dass aktive und freie HTTP-Agentverbindungen des Kindes ebenfalls0 erreichen.

Angenommenes SIGTERM um15:26:01,391UTC, tatsächlicher PostgREST-Ausgang SIGINT,
bestätigte IPC-Abschlussquittung, Kindexit0, kein SIGKILL,0Gateway-Sockets,
0aktive/freie Agentverbindungen und native0Authenticator-Verbindungen vorher/nachher.
Gesamter kleiner Ablauf552,613949ms.500Profile/0aktiv,6.000Usage und native Hashes
unverändert. Unabhängig bestätigt; keine RAM- oder500er-Abnahme daraus abgeleitet.
[Echter Abschlussbeleg](belege/w15-atomic-usage-integration-20261028/POSTGREST_STOP_RESULT.SAFE.json)
· [unabhängige Abschluss-/Transportschutzprüfung](belege/w15-atomic-usage-integration-20261028/POSTGREST_STOP_AND_TRANSPORT_REVIEW.SAFE.json).

## Neue End500-Diagnose B: FAIL bei290/500

Frisches netzloses Ziel `w15-memory-atomic-20261028b`, vollständiger unveränderter
inert deklarierter End500-Bestand, echter geladener W15-Command ohne Ausführungsrecht.
25Quellpins unabhängig vorab geprüft.3.511 vorhandene SQL-Parserbelege übernommen,
nur die neue CREATE-DATABASE-Anweisung beschrieben;0Arbeitsabfragen ausgeführt.
Eine danach rein mathematische Quellneubindung übernimmt alle3.512 SQL-Abfragebindungen:
Nur Diagnosezeitbudget und Berichtspfad ändern sich, Rücktausch reproduziert exakt
den bereits geprüften Pythonhash. Keine neue SQL-Serie.

**Ausdrückliche lokale Planabweichung:** ausschließlich das Diagnosefenster
von1.800/1.790 auf3.600/3.590Sekunden außen/innen erweitert. Die vorhandenen warmen
Intervalle ergaben im Mittel1.664s, bei durchgängig bereits beobachtetem Maximum
2.307s für500Vorgänge. Auth30, Unit60, hartes2.048.000.000Bytes-Limit,
20%Reserve, Swap0 und NoRetry bleiben unverändert. Dies ist keine Verlängerung
des späteren3h+30min-Mock500-Vertrags.

| Tatsächliches Ergebnis B | Wert |
| --- | --- |
| Bestätigte Mutationen / native CAS / volle Postimages | 290 /290 /290 |
| Begonnene Auth-Vorgänge / unbestätigt | 291 /1 |
| Fehlerposition | Index290, vor Callback; kein291.nativer Schreibaufruf |
| Ganze bestätigte Auth-Zeit maximal | 11.681,541407ms |
| Native bestätigte CAS-Zeit maximal | 6.150,820550ms |
| Gescheiterter ganzer Vorgang | 10.339,606479ms; Ursache UNKNOWN |
| Gemeinsamer Kernelpeak, auch nach unabhängiger Endlesung | 1.444.556.800Bytes |
| Rechnerische Reserve | 603.443.200Bytes =29,4646875% |
| Limit / Swap / OOM-Ereignisse | 2.048.000.000Bytes /0 /0 |
| Unabhängige Endsicht | 500Profile,0aktiv,6.000Usage,3.501volle Postimages erhalten |
| Neue Units / echte Modelle / Wiederholungen | 0 /0 /0 |

Der291.Auth-Vorgang hat `callbackRuns=0`; alle290nativen Schreiber haben echte
ACKs. Das grenzt den Fehler auf die Phase vor dem Callback/Schreiben ein.
Der Fehlertext ist nur als generischer Error erhalten. Weder HTTP-Status noch
unterliegender Request-/Timeoutgrund lassen sich daraus rekonstruieren.
Die Nähe zur konfigurierten Requestfrist ist **kein Timeoutbeweis**. PostgreSQL-
Primärlog enthält keine ERROR/FATAL/PANIC-/Timeout-/OOM-/Platzfehler; PostgREST
hat nur Startmeldungen, Gatewaylog leer. Abwesenheit von Fehlermeldungen ersetzt
keinen Ursachenbeleg. Der ursprüngliche11.UNKNOWN ist ein eigener alter Fall.

Alle8.424 dauerhaften Beobachtungszeilen mit581Starts/581Finishes sind erhalten;
eine Fehler-Hülle bleibt unbestätigt.13echte PostgreSQL-Statistikpunkte einschließlich
des Fehlerabschlusses erhalten: WAL physisch konstant134.217.728Bytes, kumulativ
geschrieben120.168.018→1.075.781.447Bytes; letzteres ist kein RAM-/Dateibestand.
Store einschließlich TOAST64.995.328→max69.615.616Bytes, TEMP0;
Checkpoints2→17, Autovacuumzähler2→93.4.353natürliche GC-Ereignisse, darunter
961Major-GCs, längste Pause526,377951ms. Kein erzwungener Checkpoint/GC/Cache-Eingriff.
Prozess-RSS-Werte werden wegen geteiltem Speicher und verschiedener Zeitpunkte
nicht addiert. Der gemeinsame Kernelpeak bleibt der maßgebliche Messwert.

Die eingebaute Controller-Endsicht bleibt `activeProfiles:null`: Die PostgREST-
Stopdatei enthält die Signalanforderung, aber keine Abschlussquittung. Die
anschließende separate unabhängige Read-only-Transaktion bestätigt alle3.501
Postimages und alle Auth-/Kosten-/Sicherheitsfelder außer neuer Revision/Probeindex,
6.000Usage und0aktive Profile. Eine spätere reine Prozesssicht findet keine
eigenen laufenden Prozesse. Diese Belege erfinden keine fehlende frühere Quittung;
Controllerbefund und Stop-UNKNOWN bleiben unverändert.

**Kein End500-RAM-PASS:** Der späte Messbereich abIndex349 fehlt, Restwachstum
ist nicht berechnet. Die unbekannte Prognose wird nicht mit0 angesetzt, auch
wenn beobachteter Peak plus64MiB noch unter der Grenze liegt. Vollständiges
Auth30/Unit60/Mock500 bleiben offen. Nach diesem FAIL keine weitere Ausführung,
kein Retry, kein Resume und kein Mock500.
[Unabhängige vollständige Ergebnisabnahme B](belege/w15-atomic-usage-integration-20261028/RAM_B_RESULTS_INDEPENDENT_REVIEW.SAFE.json)
· [native vollständige Endsicht](belege/w15-atomic-usage-integration-20261028/RAM_B_NATIVE_FINAL_INDEPENDENT_READONLY.SAFE.json).
Die vollständigen bereinigten [581 Auth-Zeitzeilen](belege/w15-atomic-usage-integration-20261028/RAM_B_AUTH_TIMINGS.SAFE.json)
und [1.297 äußeren Kernel-/Fortschrittspunkte](belege/w15-atomic-usage-integration-20261028/RAM_B_MEMORY_TIMELINE.SAFE.jsonl)
sind zusätzlich in Git erhalten. Originale private Rohbelege bleiben geschützt;
Größe und SHA256 der Exporte und ihrer Ausgangsdateien sind gebunden.

## Übernommene und erhaltene Belege

Die ersten lokalen Vorbereitungen bleiben FAIL: A überschritt mit dem alten
Quellenzeitpunkt den9h-Routenzeitraum; B traf auf fehlende Spalten im Originalschema;
C konvertierte bereits verlustfrei, wurde dann von der unveränderten Netzsperre
wegen fehlender lokaler CLI-Umgebungswerte gestoppt. Keine dieser Vorbereitungen
war ein RAM-500er- oder Mock500-Gesamtversuch. Originaldateien und alte DBs bleiben
unverändert erhalten. [Fehlerübersicht](belege/w15-atomic-usage-integration-20261028/START_FAILURES.SAFE.json).

Die neue SQL-Vorprüfung deckt3.512 tatsächliche Abfragen ab:5 neue Parse/Describe-
Prüfungen, übrige über exakte frühere Hashes übernommen; keine Arbeitsabfrage
ausgeführt. Eine reine Python-Namenskorrektur änderte keine SQL-Bytes, daher alle
3.512 Parserbelege übernommen statt erneut ausgeführt. Der nachgewiesene alte
RAM-FAIL aus972 mit1.644.748.800Bytes/19,69% bleibt unverändert bestehen.

V8-Funktionsabdeckung wurde beim ohnehin notwendigen Ablauf gesammelt:
Nutzungsadapter15/16=93,75%, Kostenmodul41/48=85,42%, AI40/102=39,22%,
Storage63/458=13,76%. Begrenzter Funktionswert dieser Node-Prozesse, keine
Zeilen-/Branch-, Worker- oder Gesamtprojektabdeckung.
[Coverage](belege/w15-atomic-usage-integration-20261028/COVERAGE.SAFE.json).

## Freigabestand und nächster Schritt

**Nicht freigabereif für einen neuen Mock500-Gesamtversuch.** Der kleine echte
SIGINT-Abschlusscheck ist bestanden. Die neue End500-Diagnose B ist jedoch
unvollständig, der Fehler vor dem291.Callback und die fehlende Abschlussquittung
der tatsächlichen RAM-Stopphase sind nicht erklärt. Nächster notwendiger Schritt
ist ein neues gezieltes GO für eine begrenzte Lesepfad-/Abschlussdiagnose mit
vollständiger sicherer Fehlerklassifizierung. Kein alter Schreibvorgang darf
wiederholt werden. Danach bleibt die vollständige End500-/Restwachstumsabnahme nötig.

Für den späteren Mock500-Start sind außerdem vier vorhandene Bindungen anzupassen:
alter4-Blob-Auth-Beleg auf die bereits geprüften12atomaren D-/EU-ACKs,
neuer974-Review mit echter RAM-Endabnahme, strikte Übernahme des500er-Quellen-PASS
über den belegten16+2-Quellvergleich und frische konsistente Laufverzeichnisse.
Diese Lücken wurden nur lesend ermittelt; nach FAIL keine Umsetzung/Patchanwendung.
Die vorhandene fachliche Qualifikation gilt ausdrücklich für28.10.; ein späterer
Tag braucht eine gültige ausgewiesene Kalenderbindung. Keine Signaturen wiederverwenden.
Der bisherige Full500-Controller ist im Integrationssprint ausdrücklich vor
jeder Wirkung gesperrt; historische Reviews erteilen dem neuen Speicherweg
keine Startfreigabe. Erst später frische Operation, Datenbank, Signaturen,
Quell-/Worker-/Auth-/RAM-Abnahme und vollständiges gültiges3h+30min-Zeitfenster.

CI auf Codekopf `e1a62acc`: [lokale Integrität40699087786](https://github.com/ernisch/helmut-pilot/actions/runs/40699087786)
grün; [Pflicht-CI40699087763](https://github.com/ernisch/helmut-pilot/actions/runs/40699087763)
ebenfalls abgeschlossen/grün (Browserlauf gemäß Prüfplan übersprungen).
Dies gilt für `e1a62acc`, nicht automatisch für `f8702304` oder den aktuellen Code `d2920d6d`.
Neue Kopf-CI wird nach dem Push getrennt ausgewiesen; keine lokale Gesamtsuite
wiederholt. Der folgende Kopf `d823e95f` hat177/178Offline-Suiten bestanden;
allein `current-state-groesse-test.js` scheiterte an31.601>30.000Zeichen.
Die beiden historischen12.10.-Abschnitte wurden wortgleich archiviert
(SHA256`72622750e75961613b0ce7f7d37ad6cba61c30a5dabf45ed0aafd5233ae55d51`).
Der gezielte Größentest bestand danach4/4 bei25.901Zeichen; keine vollständige
lokale CI-Wiederholung. Neue Berichtsergänzungen bleiben unter der unveränderten Grenze.
Lokale Belege ersetzen keine Pflicht-CI. Der bekannte unveränderte Vercel-Konfigurationsfehler bleibt
außerhalb dieses Sprints: `functions.api/index.js.includeFiles` hat2.915Zeichen,
zulässig sind256. Keine Preview-/Production-Bereitschaft behauptet.
