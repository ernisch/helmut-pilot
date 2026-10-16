# Production-Vorbereitung für genau 500 synthetische Profile

Stand: 16.10.2026. **Lokales Releasepaket vorbereitet und unabhängig sicherheitsgeprüft; Production-Start noch gesperrt.** Keine erneute 500er-Ausführung, kein Motorumbau und keine Production-Änderung in diesem Sprint. Eigener Branch: `codex/immutable-command-proof-20261015`, [Draft-PR915](https://github.com/ernisch/helmut-pilot/pull/915). Der vollständige maschinenlesbare Stand einschließlich Originalbelegpins steht in [Vorbereitungsnachweis](500er-production-vorbereitung-20261016.json); die getrennte vollständige Kostenrechnung mit explizit offenen Größen in [Kostenregister](500er-production-kostennachweis-20261016.json).

## Bereits belegte Abnahme

Die Werte stammen aus dem abgeschlossenen W15-Lauf auf `11ca02dbea72603ccdabc3560edf93f45caabe3a`; er wurde nicht wiederholt. Alle 80 tatsächlich geprüften Corequellen sind weiterhin bytegleich. Die folgenden Zeitwerte beziehen sich ausdrücklich auf den echten lokalen Datenbankpfad mit Mockprovider, nicht auf bezahlte Productionantworten.

| Kriterium | Tatsächlicher Nachweis |
|---|---|
| Finale Abschlüsse | 500/500 CAS-ACKs, Journal `closed/index500`, 1500 gespeicherte Positionen |
| Sicherheitskontrollen | 8000 frische Kontrollen, sämtliche 16 je Profil |
| Getrennte Offline-Vollprüfung | 8,067519 s ≤ 90 s |
| Vorbereitung | maximal 2,483585 s ≤ 60 s |
| Unit60 | maximal 58,950356 s ≤ 60 s |
| Auth30 | maximal 1,263639 s ≤ 30 s; 4000 Laufmutationen plus Installation |
| Installation / Original-U | 3,336130 s; beide ursprünglichen Ablaufprüfungen positiv, U unverändert |
| Gesamtablauf | 2 h 15 min 17,631 s einschließlich Vorbereitung und Zwischenphasen |
| Negative Fälle | Veränderte Signatur und fehlende Ausführungsautorität abgewiesen; bereits abgenommene weitere Corefälle übernommen |
| Reale Modellantworten | keine; 1000 lokale D/R-Mocks |

Die gesonderte W16-Messung hat die Root-Vorstufe mit 0,925676 s und 234.057.728 Bytes Node-Höchststand erfasst. Der maximale konservativ zusammengesetzte Phasenwert einschließlich erfasster Hilfsprozesse beträgt **1.703.567.360 Bytes < 2.048.000.000 Bytes**. Die gesonderte Messung beweist den historischen gleichzeitigen Gesamtpeak des bereits beendeten W15-Laufs weiterhin nicht. Auch die letzten Serialisierungstails einzelner Beobachter fehlen als absolute Spitzen. Ein strikter Gesamtpeak desselben vollständigen Laufs bleibt daher offen. Es wurde keine Überschreitung gemessen. Kein erneuter Volltest ist hiermit freigegeben.

## Neues lokales Datenbankpaket und Rückweg

Die ursprünglichen drei nativen Funktionskörper bleiben unverändert; Original-SQL-SHA256: `29c1ef679f3d887a7888a508d466b1e696733e352262a8f8278add1aa2184a3c`.

| Inerter Vorschlag | Zweck | SHA256 |
|---|---|---|
| [install_guarded](../../supabase/proposals/synthetik500_stored_command_install_guarded.sql) | Drei Funktionen und zwei ALWAYS-Schutztrigger einmalig installieren | `17e41c0448fb82e8e2e99421bc7f7c8d2e3f85ad202552a56c2fc44482b8cdf3` |
| [suspend_reader](../../supabase/proposals/synthetik500_stored_command_suspend_reader.sql) | Reader-Ausführungsrecht entziehen; sämtliche Funktionen, Trigger und Originalzeilen erhalten | `6b65ed567e26b330ca12c355c4031d955aebcd57d27e895149e140d2b49babd7` |
| [remove_if_empty](../../supabase/proposals/synthetik500_stored_command_remove_if_empty.sql) | Vollständig entfernen ausschließlich ohne geschützte Auftragshistorie | `7d812c61df9fb1b6b1166c956bd53f3de8fc40066777f85b4813695e8515c31e` |

Dies sind bewusst Dateien unter `supabase/proposals`, keine automatisch ausführbaren Migrationen. Der [Offlinegenerator](../../scripts/synthetik-500-release-sql.js) prüft den Originalpin und gibt mit `--print-manifest` ausschließlich Dateipins aus. Er führt keine SQL-Anweisung aus.

Jeder Vorschlag sperrt zuerst die Tabellen innerhalb derselben Transaktion, begrenzt Lock-/Anweisungswartezeit auf 3/15 Sekunden und prüft Owner, Runtime-Rolle, Tabellenform, RLS, inaktive Profile sowie das Fehlen sämtlicher Proof-/Authorityzeilen. Installation überschreibt keine gleichnamigen oder teilweise installierten Objekte. Rückwege prüfen zusätzlich exakte Funktionskörper, Signaturen, ACLs und Triggerform. Keine SECURITY-DEFINER-Erweiterung, kein CASCADE, keine Datenlöschung und keine Wiederholung nach unbekanntem Ausgang.

**Echte externe Writer-/Workerquieszenz muss vor dem SQL-Lock beginnen und bis nach COMMIT sowie lesender Nachprüfung bestehen.** Der verlangte Receipt-SHA ist nur eine Bindung an diesen getrennten Beleg. Ein frei gesetzter Marker beweist keine Quieszenz; nach Lockfreigabe könnten wartende Writer weiterarbeiten.

Der gewöhnliche sichere Rückweg der Vorbereitung ist Reader-Suspend plus gesondert gebundene Rückkehr zur bisherigen Anwendung. Vollständiges DROP ist bei geschützter Historie, einschließlich bestehendem U-Auftrag, gesperrt. Auch Suspend verweigert vorhandene Proof-/Authorityzeilen, einschließlich abgelaufener oder fehlerhafter Einträge: **nach Ausstellung solcher Nachweise ist dieser Vorbereitung-Rückweg nicht verfügbar**. Dann Ausführung über den bestehenden Notstopp sperren, Schutzfunktionen und Originaldaten erhalten und den tatsächlichen Zustand lesend klären. Keine Belege löschen, um einen Rückweg freizumachen. Das alte ungeschützte `binding_rollback.sql` ist nur erhaltene Rohvorlage und kein zulässiger direkter Rückweg.

Zehn neue Übergangsprüfungen sind im kleinen neuen lokalen DB-Fixture belegt, darunter echte Zweiverbindungssperre, Proof-/Authority-/Historien-/ACL-Drift und sicherer Reader-Suspend. Zwei Auswertungsfehler des Testharness wurden dokumentiert; erfolgreiche Übergänge wurden nicht wiederholt. Eine unabhängige abschließende SELECT-Ablesung bestätigte 0 Profile, drei Originalfunktionshashes, zwei ALWAYS-Trigger, drei erhaltene Originalzeilen und entzogenen Readerzugriff. Der bestandene native 30er-Test und der 500er-Lauf wurden nicht erneut ausgeführt.

## Runtime, Worker, Bundle und Schlüssel

Vorbereitet ist ein kleiner [Artefaktleser](../../lib/helmut/synthetik-500-runtime-artifact-attestation.js) ausschließlich innerhalb des bestehenden authentifizierten Konfigurations-GETs. Alle bisherigen Bearer-, Nonce-, Host-, Commit-, Fenster- und Fristprüfungen bleiben davor erhalten. Der gemeinsame Modell-Konfigurationspfad bleibt unverändert und bekommt keine zusätzlichen Datei-/Hashzugriffe. Der Leser startet keine Worker, Datenbank- oder Modellaufrufe und erteilt keine Ausführungsbefugnis.

Der Leser meldet tatsächliches `process.version`, tatsächliche Quellbytes sowie ausschließlich den Ed25519-SPKI-Fingerabdruck des öffentlichen Schlüssels und die Anwesenheit des privaten Schlüsselnamens. Private PEMs im Public-Feld werden abgewiesen. Er begrenzt Manifestbytes auf 64 KiB und sämtliche tatsächlichen Quelllesevorgänge zusammen auf 32 MiB, auch wenn eine Datei nach dem Lesen wegen Drift verworfen wird. Zehn gezielte Readerfälle sind grün; Authregressionen des geänderten GETs wurden separat geprüft. Der letzte reine Testportabilitätsdelta akzeptiert unter CI-Node22 ausdrücklich **keine** Nodequalifikation und ändert keine Produktquelle.

Extern erwartete Pins für genau diesen lokalen Releasekandidaten:

- [Manifest](../../lib/helmut/synthetik-500-release-artifacts.json): `1cd3020b7db97853039add34828cdc995af13da2dbc9a8b48c4741f85e371ea7`.
- Tatsächliche Quellenzuordnung: `b72636831505875ef47d5e848be6b20874079ae2b5cc35482ba972cb5c9ffebc`.
- 84 lokale Dateien, 2.289.608 Quellbytes; 81 explizit im Include-Muster, drei statisch importierte API-/Server-/Readerdateien. Die Manifestdatei selbst ist zusätzlich explizit enthalten.
- Unveränderter geschlossener Workergraph: 67 Quellen plus Workerentry; bisherige tatsächliche Workerprüfungen übernommen. Worker erhält weiterhin nur die nicht geheime Veröffentlichungspolitik, keine Signierschlüssel oder DB-/Providercredentials.

Diese Hashes sind vor jeder späteren Aktion erneut an den tatsächlich unabhängig angenommenen Releasecommit zu binden. **Manifest und gemeldete Hashes aus derselben Runtime beweisen nur Selbstkonsistenz.** Root muss Manifest-SHA und tatsächliche Quellenzuordnung gegen diese unabhängig angenommenen Erwartungen vergleichen. Aktueller Source-Include-Nachweis ist kein Beleg der wirklich gebauten/deployten Bundlebytes. Der historische Packagingtrace betrifft andere Bytes und wird nicht als aktuell ausgegeben.

Production muss weiterhin exakt **v24.19.0** nachweisen oder eine neue Qualifikation erhalten. `Node24.x` genügt nicht. Zusätzlich müssen das tatsächlich ausgelieferte Bundle, der unveränderte Workergraph und der Schlüsselpfad belegt werden: privater Produktionssignierschlüssel ausschließlich im berechtigten Offline-/Root-Signierpfad, dazugehöriger öffentlicher Schlüssel in allen tatsächlich prüfenden Runtimeprozessen, keine Signierschlüssel im Worker oder Bundle. Der prozesslokale GET kann weder alle Instanzen noch den Offline-Signer attestieren. Keine Produktionsschlüssel erzeugt, gelesen oder verteilt; kein Fixture-Schlüssel als Produktionsanker verwendet.

## Zeitreserve und konkrete Betriebsgrenze

Die kleinste gemessene Reserve beträgt **1,049644 s** beziehungsweise rund 1,75 % von Unit60. Der gewünschte Abstand von fünf Sekunden ist nicht belegt; dafür fehlen 3,950356 s. Fünf Sekunden wurden nicht eigenmächtig zum neuen Abnahmekriterium gemacht.

Im letzten Grenzfall dauerten die beiden tatsächlichen Providerwartezeiten 19,901011 s und 19,901644 s. Würden nur diese bis jeweils 20 s reichen, blieben bei sonst identischen Bedingungen rechnerisch **0,852299 s**. Die übrige Arbeit dauerte 19,147701 s. Die SQL-Sendeprüfung im Mock liegt innerhalb seiner 19,9-s-Warteuhr und darf deshalb nicht als frei abziehbarer zusätzlicher Zeitgewinn gerechnet werden. Die Root-Vorstufe liegt außerhalb Unit60. Keine neue CPU-, SHA- oder Architekturänderung wurde begonnen.

Eine lokale Messung belegt weder Production-vCPU noch Supabase-Netzwerklatenz, Kaltstart oder echte Modellantwortzeit. Der 300-s-Functiontimeout verlängert Unit60 nicht. **Lokale Unit60 bestanden; robuste Production-Zeitreserve offen.** Eine Überschreitung im echten Test muss zum bestehenden sicheren Stop führen und darf weder automatische Wiederholung noch Timeoutverlängerung auslösen.

Zusätzlich begrenzt der vorhandene synthetische GitHub-Endwächterjob seine Laufzeit auf 270 Minuten. Sein gemeinsamer EU-Code lässt ein aktives Fenster bis neun Stunden zu. Der Job allein deckt daher kein volles Neunstundenfenster ab. Der vorhandene persistente Cron ist ein zusätzlicher historischer Beleg, aber keine neue Bescheinigung dieses konkreten künftigen Fensters. Kleinste Planungsoption: höchstens vier Stunden aktiv plus 30 Minuten Endbeleg unter Berücksichtigung von Setup/Polling/Abschluss innerhalb der tatsächlichen Wächterlebenszeit binden; dies bleibt unter der bestehenden Neunstundenobergrenze, beweist aber keinen vollständigen 500er-Abschluss innerhalb von vier Stunden. Für ein längeres gewähltes Fenster ist eine passende vollständige Wächterabdeckung gesondert nachzuweisen. Kein Workflow, Timer oder Vertrag geändert.

## Infrastrukturkosten: bekannte Werte und echte Lücke

Alle Ownerbelege sind übernommen. Vercel: rund 18 USD Infrastrukturrest am 15.10., 200 USD Budget, automatische Pause aus, 2048 MB/300 s/FRA1, vCPU unbekannt, 19 % Rechnungsteuer. Supabase: bestehender Protarif 25 USD/Monat, eine Microinstanz vollständig kreditgedeckt, rechnerisch 6,94 USD Computecreditrest, Spend Cap an, keine zusätzlich ausgewiesenen Pakete. Der Supabasebeleg enthält keinen gesonderten Steueraufschlag. Keine erneute Frage nach diesen Daten erforderlich.

Aus den vorhandenen Quoten folgen rechnerisch 244,38 GB uncached Egress, 250 GB cached Egress und 18,318 GB Logingestionrest. 2 GB provisionierte Disk gegenüber 8 GB inklusive sind keine Messung des belegten oder maximalen Plattenverbrauchs. Logabrechnung ist laut Beleg erst 2027 vorgesehen. Spend Cap garantiert keine erfolgreiche Ausführung bei erschöpfter Quote; das Vercelbudget ist kein automatischer Stopp und keine zusätzliche Ausgabenfreigabe. Monatliche Grundpreise werden nicht als neue Testgebühren nochmals addiert. Observability-Plus-Grundgebühr ist mit 0 USD belegt.

Neu aus den erhaltenen W15-Daten, ohne Test, vollständig ausgezählt: **82.505 native HTTP-Aufrufe im Lauf, 18 bei Installation, fünf offline**. Die 1000 lokalen Mockrequests enthalten zusammen 16.617.940 Bodybytes. Dies sind Beobachtungen, keine Production-Höchstgrenzen und keine Messung aller Header-, Antwort-, Fehler- oder Exportbytes. Die fertige lokale Datenbank enthält 165.432.467 physische Bytes; dieser Endsnapshot belegt keinen WAL-/TOAST-/Dead-Tuple-Höchststand.

Das Kostenregister umfasst CPU, provisionierte RAM-Zeit, Aufrufe, Build, Origin-/Datentransfer, CDN, Observability, einschlägige WAF-/Zusatzmeter, Endwächter/CI sowie Supabasecompute, Egress und Plattenspitze. Unbelegte Größen bleiben offen. Bereits eine sehr lose Rechnung von 500 Functions × 300 s × konservativ zwei vCPU und 2 GB ergibt nur für CPU/RAM **19,754 USD inklusive 19 %**, ohne übrige Positionen. Das ist ausdrücklich **keine tatsächliche Kostenprognose und kein Beweis fehlenden Guthabens**; es zeigt, dass diese grobe Obergrenze den ≤18-USD-Deckungsnachweis nicht liefert. Der vollständig aufgezählte, noch nicht zugelassene Kontroll-/Exportvorschlag umfasst 1005 Functionanfragen plus zusätzliche Wächter-/Cronzugriffe; deren alleinige lose CPU-/RAM-Rechnung beträgt 39,70554 USD.

**Ein vollständiger numerischer Kostendeckungsnachweis ist aus den vorhandenen Belegen nicht herleitbar.** Es fehlen gebundene vollständige abrechenbare Prozesszeiten, Wire-/Antwort-/Fehler-/Exportbytes einschließlich CASkonflikten, alle relevanten Ereignis-/Wächtermengen und der physische DB-/WAL-Peak. Fehlende vergangene Messwerte können nicht nachträglich erfunden werden. Kleinster Schritt: zunächst vorhandene Quellen-/Mengengrenzen schließen; wo das nicht ausreicht, einen klar begrenzten passiven Transport-/Speichernachweis gesondert vorbereiten und freigeben. Kein automatischer Gesamtlauf oder zusätzlicher Productiontest. Die frühere 2,50-USD-Hülle gilt ausschließlich für den alten konkreten Finanzintegrationsakt und wird nicht auf diesen Sprint oder den 500er-Test übertragen.

Modellbudget bleibt separat: maximal **81,400000 USD** für 500 D + 500 R/U0, **82,036000 USD/UTC-Tag**, **88,845364 USD kumulativ**. Für 1000 neue Calls muss im vorhandenen Zählervertrag `Used≤714` gelten. Vercelguthaben wird nicht als Modellguthaben behandelt. Der zuletzt belegte Finanz-HTTP409 bleibt ein interner Finanznachweisfehler; keine Zugangsreparatur und kein neuer 409-Probeaufruf in diesem Sprint. Für einen neuen Start sind tatsächlicher Tag, Bücher, Auftrag, Route, Reserve und Zähler frisch zu binden.

## Konkreter Freigabeplan

1. **Lokales Paket festhalten:** eigener Commit, unveränderte Core-/Nativepins, unabhängige Deltaabnahme und vor jeder Integration sämtliche Pflichtchecks des tatsächlich einzuliefernden Commits. Die grüne [CI38880549289](https://github.com/ernisch/helmut-pilot/actions/runs/38880549289) gilt für den bisherigen Commit11ca; neue lokale Dateien haben noch keinen eigenen Remote-CI-Lauf. Branch-Autodeploy bleibt ausgeschaltet. Commit/Push und eigene Pflicht-CI sind durch die bestehende Entwicklungsfreigabe gedeckt; die neue Readersuite ist im bestehenden Pflichtlauf eingetragen. Keine bereits bestandenen 500er-Prüfungen wiederholen.
2. **Vor einer Integration konkret freigeben:** exakten Releasecommit, begrenzten Integrationskostenplan, echte externe Quieszenz, gesicherten Istzustand, tabelleneigenen Ausführungskontext, geprüften Install- und passenden Rückweg binden. Neue Productionübernahme des ausdrücklich lokalen 90s-/Wiederverwendungsvertrags benötigt ebenfalls GO. Erst nach diesem gesonderten Integrations-/Migrations-/Deployment-GO dürften guarded SQL und Runtimepaket angewendet werden. Profile bleiben dabei inaktiv; keine Modellcalls oder Ausführungsnachweise ausstellen. Diese Freigabe ist derzeit nicht erteilt.
3. **Tatsächliche Zielumgebung belegen:** unter weiter bestehender Quieszenz Funktionshashes/ACLs/ALWAYS-Trigger, unveränderte Originaldaten, exakt angenommene Runtime/Nodepatch, gebautes Bundle/Workerbytes und die gesamte öffentliche/private Schlüsselverteilung prüfen. Neuen GET nur mit eigener gültiger konkreter Host-/Commit-/Nonce-/Zeitbindung benutzen. Abweichung oder unbekannter Schreibausgang: lesende Klärung, kein Retry. Rückweg nur innerhalb der oben genannten echten Voraussetzungen.
4. **Vor Aktivierung alle offenen Tore schließen:** strikten Gesamtprozessspeicher oder explizit zulässige Nachweisform, vollständige Infrastrukturdeckung, erfolgreichen aktuellen Finanznachweis, neue aktuelle 500er-Quellen-/D-/U-/Fach-/Originalbindung, gültige Fristen sowie tatsächlich passendes Wächter-/Notstopp-/Endfenster. Die geringe Zeitreserve muss ausdrücklich bewertet sein; kein Productionzeitversprechen aus lokalem CPU-Erfolg. Geschlossenen Archivbeleg übernehmen.
5. **Eigenes finales Test-GO:** erst danach eine konkrete neue Operation mit exakt 500 gleichzeitig aktiven synthetischen Profilen (330 BT/120 BE/50 BB), höchstens 1000 echten D/R-Aufrufen, unveränderten 16 frischen Kontrollen, Unit60/Auth30/RAM und vollständiger Kosten-/Ausgangsbilanz freigeben. Verbrauchte alte Operationen bleiben unverändert. Kein automatischer Retry bei Überschreitung oder unklarem Ausgang.
6. **Abschluss:** sämtliche 1500 Positionen, aktuelle Original-/Faktenbindung, reale modellseitige Fachabnahme, Laufkosten und Zeit-/Speicherbelege unabhängig abnehmen; Endsteuerung und Rückkehr zu 0 aktiven Profilen nativ bestätigen. Bis dahin ist ein echter Production-500er-Nachweis nicht bestanden.

Frühestmöglicher sicherer Start: erst nach den Punkten 1–4 und dem getrennten finalen GO. Eine Uhrzeit ist mit den offenen Nachweisen nicht belastbar. Im jetzigen lokalen Umfang wird keine weitere Nutzereingabe benötigt.

## Unabhängige Prüfung und Grenzen

DeepSeek Pro High prüfte den ursprünglichen DB-Rückweg; Flash High prüfte die getrennte Kostenrechnung und den Artefaktleser. Ein weiterer Pro-High-Endreview erreichte sein Ausgabelimit und lieferte keine Annahme; er wurde nicht automatisch wiederholt. Eine bereits vorhandene getrennte Sol-Agentinstanz hat das endgültige Produktdelta unabhängig abgenommen. Root/Sol hat anschließend ausschließlich die portable Testassertion geprüft. Keine offenen Codebefunde im abgenommenen Delta; die genannten Productionbelege bleiben offen.

Die vier DeepSeek-Entwicklungsanfragen sind von den verbotenen bezahlten Productionmodelltests getrennt. Kein Merge, Deployment, Production-SQL, Profilaktivierung oder neuer vollständiger lokaler 500er-Test in diesem Sprint. Nächster sicherheitskritischer Entscheidungsschritt: **Sehr hoch**, weil Runtime-Vertrauensanker und atomare Datenbankschutzgrenzen gemeinsam zu bewerten sind.
