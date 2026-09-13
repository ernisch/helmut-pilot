# Lokale Korrektur der Quellenwahl für den Lage Text

## 13.09.2026: Quellenfix unverändert, REST Vorbereitung teilweise abgeschlossen

Neuester Abschnitt: isolierte REST Prüfung vorbereitet, tatsächliche Ausführung blockiert. Details und Abnahmekriterien stehen im letzten Abschnitt. Ältere Aussagen zu nächsten Schritten sind historische Aufträge.

Ein reproduzierbarer Auswahlfehler ist lokal korrigiert. Aktuelle Quellen werden vor der Begrenzung auf zwölf Vorgänge berücksichtigt. Reviewvorbereitung ist abgeschlossen; Veröffentlichung und fachlicher Wirkungsnachweis stehen aus. Der abgeschlossene PR387 Merge bleibt ein eigener unveränderter Production Stand.

Der Betreiberauftrag Weiter wurde für die angekündigte Ursachenprüfung und eine belegte lokale Korrektur verwendet. Keine erneute Arbeit an der historischen privaten Textfassung aus dem vorigen Abschnitt. Keine Helmut Modellaufrufe, politischen Originalabrufe, Fachläufe, Datenbankänderungen, Importe, Profilwechsel, Workflows oder Deployments.

## Gesicherter Befund

Der natürliche Lageprozess vom13.09.,05:45UTC bearbeitete fünf Profile und speicherte zwei Lagen. Eine Ablehnung wegen Absatzanzahl, zwei wegen fehlendem Profilbezug sind in der vorhandenen Telemetrie belegt. Die verworfenen Antworten sind nicht gespeichert. Deshalb wird keine identische historische Modellantwort oder vollständige Erklärung beider Profilablehnungen behauptet.

Aktueller lesender Vergleich07:15bis07:27UTC auf demselben Produktcode: drei betroffene Profile,36 gespeicherte Treffer,535 Wissensobjekte einschließlich des unverändert begrenzten500er Fensters und35 ergänzter Treffer. Die Quellen und Profilkennungen bleiben privat. Der Zeitgleichstand am Rand des500er Fensters ist dokumentiert; die Diagnose ordnet Gleichstände nach Kennung. Das ist kein exakter historischer Laufmitschnitt.

Vor der Korrektur belegten elf Vorgänge ohne gültige aktuelle Quelle elf der zwölf Plätze eines betroffenen Profils. Nach der Quellenprüfung blieb eine einzelne Überschrift. Der Generator verlangt mindestens zwei eigenständige Absätze. Der neue Regressionstest reproduzierte die Verdrängung zuerst als Fehler.

| Betroffene Diagnose | Vorgänge vorher | Dokumente vorher | Vorgänge nachher | Dokumente nachher | Davon ohne Auszug |
|---|---:|---:|---:|---:|---:|
| Absatzanzahl | 1 | 1 | 12 | 23 | 18 |
| Profilbezug, Absatz0 | 6 | 15 | 12 | 25 | 15 |
| Profilbezug, Absatz1 | 6 | 9 | 12 | 17 | 15 |

Das sind technisch gebundene, datierte Quelleingaben aus dem aktuellen Lesestand. Sie sind keine fachlich bestandenen Texte. Die tatsächlichen Artikel wurden hier nicht neu abgerufen. Für die neue Auswahl wurden66 bestehende verknüpfte Dokumente gelesen; höchstens neun je Vorgang. Die Grenzen von sechs Quellen je Vorgang,16000 Eingabezeichen und250 Ausgabewörtern gelten weiter.

## Lokale Umsetzung

Der Lagepfad liest für bereits verstandene Kandidaten und die bekannten ergänzten Mandatstreffer zuerst Titel, Artikeladressen und Publikationsdatum ihrer Quellen. Der bestehende14 Tage Vertrag und die vorhandene Prüfung öffnender Artikeladressen gelten vor der Auswahl. Weder eine neue Analysezeit noch ein geratenes Datum macht eine Quelle aktuell.

Der zusätzliche Leser verwendet Stapel von höchstens100 Kennungen, Seiten von1000 Verknüpfungen und eine feste Leseobergrenze. Fehler, fremde oder doppelte Zeilen und ein Überlauf werden als Speicherstörung gemeldet. Der private Transportvergleich mit gespeicherten SQL Zeilen ergibt je Profil189 verstandene Kandidaten und zwei Metadatenanfragen, längste Adresse4240Zeichen. Das ist ein lokaler Transportnachweis ohne echten neuen REST Aufruf.

Gespeicherte persönliche Treffer behalten ihren verpflichtenden Mandatsfilter. Die Quellenprüfung liest bestehende globale Vorgangstabellen. Es gibt keine Migration und keinen neuen Schreibweg. Quellenqualität, fachlicher Profilbezug, Absatzvergleich, Kostenreservierung, Sperren und Speicherquittierung werden nicht gelockert. Der gebundene manuelle Briefingpfad bleibt unverändert. Der reine Zählmodus führt keinen zusätzlichen Quellenleser aus. Wenn keine aktuelle Quelle vorhanden ist, bleibt der historische Kartenpfad verfügbar; daraus entsteht kein neuer Quellenbeleg.

Der REST Entwurf folgt der dokumentierten Filterung eingebetteter Tabellen mit innerer Verknüpfung. [PostgREST Dokumentation](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#top-level-filtering). Der aktuelle [Supabase Änderungsverlauf](https://supabase.com/changelog) wurde auf einschlägige Änderungen geprüft; die Markdown Adresse war im Webleser nicht abrufbar, die HTML Fassung wurde gelesen.

## Prüfstand

PR CI34716196610 und automatische main CI34726446113 wurden nicht erneut gestartet. Für die neue lokale Änderung liefen ausschließlich geschützte Offline Prüfungen. Der neue Test bestand nach der Korrektur zehn von zehn Gruppen. Angrenzende Quellenbindung21, Reparatur8, gebundene Eingabe7, Mandantennarrativ92 und bestehende Auswahlgruppen bestanden. Ältere Testattrappen wurden um dieselben bereits vorhandenen Quellendaten an der neuen Lesenaht ergänzt; keine Erfolgserwartung wurde abgesenkt.

Vollständiger neuer lokaler Lauf:364von368 Suiten erfolgreich in667Sekunden. Vier Fehler stammen aus fehlenden Testabhängigkeiten:Kalenderbibliothek,Lambda Paketabhängigkeit und zwei Browserprüfungen. Der erhaltene ältere Arbeitsbaum besitzt die identische Lockdatei;alle28 Paketversionen wurden verglichen und ausschließlich dessen Abhängigkeiten lokal kopiert. Kalender134von134 und Lambda Paket43von43 danach erfolgreich. Keine Paket oder Lockdatei geändert.

Die zwei Oberflächenprüfungen admin-nutzer-loeschen und passwort-setzen-login-fix bleiben offen:Playwright findet Chromium1234 nicht. Der offizielle Download endete nach Zeitüberschreitungen erfolglos. Keine Prüfung entfernt oder als bestanden umgedeutet. Somit366 Suiten mit erfolgreichem Einzelnachweis,zwei Umgebungsblocker;kein vollständig grüner Gesamtlauf. Dieser Lauf gehört ausschließlich zur neuen lokalen Änderung.

Die erste Statusfassung überschritt die vorgegebene Zeichengrenze. Vor Abschluss gekürzt:CURRENT_STATE29856Zeichen,212Zeilen,Größenprüfung4von4 erfolgreich. Bestehende Historie erhalten und ausführliche neue Befunde in diesem Beleg gebündelt.

## Betrieb und Sicherung

Nachkontrolle13.09.,10:45:26 Türkei /09:45:26 Berlin /07:45:26UTC:main8d840d834f8ff312475d86e8c23509b75f63f91d und READYdpl_4JSVUt4v2ktF45Yt4XzLSWmW8fUn am Hauptalias unverändert. Keine laufende Action,nur historischer Draft345 offen. Fachautomation deaktiviert. Keine umfassende Sicht auf andere Chats vorausgesetzt.

504 Profile,505 Identitäten,fünf aktiv,495 synthetische Profile und Konten inaktiv. Geschützter PostgreSQL JSONB Hash96ae66918c06ed847f1673b47d60914bab814cdbd5833a345066db78f7ef45a1 unverändert. Jobs,Leases,Sperren,junge laufende Prozesse und andere aktive Datenbankclients jeweils0. Vier historische Admin Abweichungen bleiben offen.

UTC13.09.:39 Buchungen,0,234674USD,heutige Reserve0;im Abschnitt unverändert. Historische Reserven0,424USD am10.09. und0,212USD am11.09. bleiben dort. Grenze4USD für den gesamten Helmut Betrieb je UTC Tag. Kein Anbieterrechnungsnachweis.

Originalbericht296 war frei. Zuständigkeit bedingt als297 übernommen und als298 verlängert;beide Versionen anhand vollständiger erneut materialisierter Dateibytes bestätigt. Der private Abschlussbericht trägt den tatsächlichen finalen Sicherungs und Freigabestatus. Die ältere öffentliche Ersatzsteuerung bleibt ausschließlich historischer Mergebeleg.

## Fortsetzung und Grenzen

Die vollständige fachliche Production Abnahme für exakt500 gleichzeitig aktive Testprofile bleibt offen. Auch die zwei heutigen Ablehnungen wegen Profilbezug sind nicht durch diese Quellenkorrektur als gelöst bewiesen. Die Quelleingaben enthalten weiterhin viele bloße Überschriften und auch sachfremde Dokumente innerhalb einzelner Gruppen. Der unveränderte Quellenprüfer muss solche Aussagen weiter ablehnen.

Nächster Schritt: die neue Änderung mit vollständig verfügbarer Testumgebung prüfen und als eigenes Änderungspaket zum Review vorlegen. Erst nach einer eigenen Veröffentlichung gehört ein begrenzter gebundener Textnachweis zum neuen operativen Umfang. Keine weitere Veröffentlichung, Modellarbeit oder Aktivierung aus der abgeschlossenen PR387 Freigabe ableiten. Kein Erfolg für500 aus lokalen Tests oder größerer Quellenzahl.

Lokaler Branch `codex/500-lage-quellenfenster-20260913`, aus dem erhaltenen Dokumentationsstand `6e52a5336325086888ba2b39e049b33be632e92a`. Noch kein PR und keine Veröffentlichung. Der private Beleg enthält SQL Abfragen, die drei Zuordnungen, Vorher und Nachher Eingaben, Transportvergleich und Testprotokolle. Gleicher Thread, Astra Max.

## Begrenzter Reviewabschluss am 13.09.2026

Neuer Auftrag ausschließlich für zwei offene Browserprüfungen und Reviewvorbereitung. Vorhandener Branch `codex/500-lage-quellenfenster-20260913`, Commit `0d53cf9dca61b0a40cd12066612ad523210568ea`, Baum `3bce39ad528da7e8002e748451b9ecc0f78d2498` und sauberer Arbeitsbaum selbst bestätigt. Gegen Elterncommit `6e52a5336325086888ba2b39e049b33be632e92a` umfasst die Quellenkorrektur13 Dateien,295 Ergänzungen,16 Entfernungen. Produktcode und Tests bleiben in diesem Nachtrag unverändert.

Gegen aktuellen main Baum `78d62fb947cde91efccf05224e4ce56839fed7c9` enthält der übernommene Branch17 Dateien. Die vier zusätzlichen Dateien sind vorhandene Dokumentation zu PR387,Ersatzsteuerung,Fachinventur und Schwerpunktfrische. Keine weitere Produktänderung außerhalb der zwei Quelldateien und ihrer Tests festgestellt. Historie erhalten;der tatsächliche Gesamtumfang gehört in die Reviewbeschreibung. Der lokale Dokumentationsnachtrag erhält einen eigenen Commit,dessen exakte Kennung in der gesicherten Reviewbeschreibung steht.

### Browserbefund

Tests nacheinander über `node scripts/lokal.js -- node scripts/admin-nutzer-loeschen-test.js` und `node scripts/lokal.js -- node scripts/passwort-setzen-login-fix-test.js`. Starter entfernt Production Kennungen,erzwingt lokalen Speicher und lädt Netzschutz. Testserver binden an127.0.0.1;Renderprüfung verwendet lokale HTML und CSS Dateien. Beide Tests sichern den lokalen Datenbestand und stellen ihn wieder her;Dateihashes vor und nach beiden Läufen sind identisch.

13.09.,11:12:16 bis11:12:18 Türkei /10:12:16 bis10:12:18 Berlin /08:12:16 bis08:12:18UTC:admin61 Vorprüfungen erfolgreich,Passwort29 erfolgreich,keine fehlgeschlagene Assertion vor Browserstart. Beide Suiten enden mit Exit1:Programm `/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` fehlt. Installiertes Playwright erwartet Chrome Headless Shell151.0.7922.34,Revision1234. Kein geeignetes Browserprogramm in geprüften Laufzeit,Cache und Arbeitsverzeichnissen gefunden.

Eine einzelne HEAD Anfrage an die vom installierten Playwright genannte offizielle Downloadadresse endet mit `The read operation timed out`. Keine erneute Installationsschleife. Keine Browserprüfung übersprungen,simuliert oder als bestanden gewertet. Die90 erfolgreichen Vorprüfungen sind keine90 Browserprüfungen. Gesamtlauf bleibt364von368 in667Sekunden;mit früheren Kalender134von134 und Lambda43von43 weiterhin366von368 erfolgreiche Einzelnachweise. Kein vollständig grüner Gesamtlauf.

### Review der Quellenwahl

Problem:Veraltete Quellen konnten die zwölf Plätze belegen,bevor ihre fehlende Aktualität erkennbar wurde. Ein Profil erhielt im belegten Vergleich nur einen Vorgang mit einer Überschrift. Änderung:vorhandene Quellenmetadaten vor dem Limit mit demselben Datums,Titel und Artikeladressvertrag prüfen. Zwölf Vorgänge mit23 Dokumenten danach belegen eine bessere Auswahl,keinen bestandenen generierten Text. Die Artikeladressprüfung ruft keine Originalseite auf.

Ohne aktuelle Belege bleibt die historische Kartenauswahl erhalten. Bei leerem `koLite` liefert `buildLageBriefing` weiterhin `no-current-sources`,bevor ein Modellaufruf stattfinden kann. Neue Lesefehler werden `StorageReadError`,danach `store-error`;kein stiller ruhiger Leerzustand. Gebundene Eingabe und `countOnly` nutzen den neuen Leser nicht. `cacheOnly` nutzt ihn dagegen vor der Cacheprüfung:zusätzliche Leselatenz ist möglich und nicht unter Production Last gemessen.

Kennungen werden dedupliziert und sortiert,in höchstens100er Gruppen gelesen. Jede Seite fordert1000 Verknüpfungen mit stabiler Ordnung nach Wissensobjekt und Dokumentkennung an. Eine volle Seite führt zu einer weiteren Anfrage,auch am exakten Grenzfall. Höchstens4000 Zeilen pro Stapel:keine einzeln erzwungene40er Grenze je Kennung. Fremde Kennungen,doppelte Verknüpfungen,unlesbare Antworten und Überlauf werden verworfen. Die zehn Testgruppen decken Verdrängung,fehlende oder ungeeignete Quellen,Lesefehler,Scoring,Seitennavigation,Dubletten,Überlauf und201 Kennungen in100/100/1 ab. Roter und späterer grüner Beleg wurden gelesen,nicht wiederholt.

Der tatsächliche neue REST Pfad wurde weiterhin nicht aufgerufen. Vorhandener Transportbeleg verwendet aus SQL gelesene Daten und eingespeiste Antworten. Seitenvollständigkeit setzt vollständige1000er Seiten bis zum Ende voraus;ein kleineres serverseitiges Seitenlimit und Änderungen zwischen Seiten sind nicht unabhängig abgesichert. Keine neue Integration,Lastprüfung oder Datenbankänderung in diesem Sprint.

Zusätzliche statische Grenze außerhalb des Auftrags:`getSourcesForVorgang` liest weiterhin höchstens40 Verknüpfungen ohne serverseitige Sortierung und sortiert erst danach lokal. Bei mehr als40 Dokumenten kann die neue Metadatenwahl einen aktuellen Beleg finden,der im anschließenden begrenzten Abruf fehlt. Durchgehend gleiche Quellenmengen zwischen Vorauswahl und Texteingabe sind damit nicht allgemein bewiesen. Aus beiden Lesepfaden abgeleitet,kein neu reproduzierter Production Fehler. Der bestehende Vergleich mit höchstens neun Dokumenten je Vorgang deckt diesen Fall nicht ab. Dokumentiert und nicht repariert;keine uneingeschränkte Freigabeempfehlung.

Fixtures ergänzen dieselben bereits verwendeten Quellen an der neuen Lesenaht. Ein Cachefixture datiert eine Testquelle eine Stunde zurück,damit sie nicht erst nach dem nun früher erfassten Prüfzeitpunkt liegt. Keine Erfolgserwartung entfernt oder abgesenkt. Prompts,Modelle,Qualitätsregeln,Mandantentrennung,Kostenschutz und Datenbankschema unverändert. Keine Migration.

### Abschluss und nächster möglicher Auftrag

Teilweise abgeschlossen:Reviewbeschreibung und technische Grenzen vorbereitet,zwei Browsernachweise fehlen. GitHub main08:09UTC bestätigt,nur historischer PR345 offen,keine laufende Action. Fachautomation deaktiviert,keine fremden lokalen Fachprozesse sichtbar. Keine umfassende Sicht auf andere Chats. Vercel und Datenbank nicht erneut inventarisiert;Betriebsstand07:45UTC oben bleibt datierter Vorbeleg.

Originalbericht299 unmittelbar vor Übernahme erneut gelesen,bedingt als300 gespeichert und vollständige gespeicherte Bytes identisch rückgelesen. Nach Sicherung nur eigene Steuerung gegen unmittelbar vorher bestätigte Version freigeben und erneut rücklesen;endgültige Kennung im privaten Originalbericht.

Kein Push,PR,Merge,Deployment,Modellaufruf,politischer Originalabruf,Fachlauf,Import oder Profilwechsel. Kein neuer Produktfix. Zwei fachliche Profilfehler und vollständige Abnahme exakt500 gleichzeitig aktiver Testprofile außerhalb des Sprints. Rückweg vor Veröffentlichung:lokalen Kandidaten nicht übernehmen;keine Production Rücknahme nötig. Jede spätere Veröffentlichung oder Production Rücknahme braucht eigene passende Freigaben.

Nächster möglicher kleiner Auftrag:passende Browserumgebung bereitstellen und dokumentierte Reviewgrenzen bewerten. Keine Wiederholung erfolgreicher Suiten ohne konkrete Änderung. Hier endet der Sprint;Astra Hoch passt zur möglichen Fortsetzung.


## Browser und 40er Grenze: abschließende lokale Klärung am 13.09.2026

Der begrenzte Diagnose und Reviewsprint ist erfolgreich abgeschlossen. Das bedeutet erfüllte Diagnosekriterien und eine nachvollziehbare Reviewvorlage, keine bestandene Browserprüfung und keine Veröffentlichungsempfehlung. Alle früheren Abschnitte bleiben datierte Vorbelege. Einstieg war der unveränderte lokale Commit `bf0254afb415d5f84adc3cacab9ac186caa8ccd4`, Baum `a948bf136a635316d62bbde644fdc17e8bf67937`.

### Browserdiagnose abgeschlossen, Browserabnahme weiterhin blockiert

Frisch geprüft: keine Browserprogramme in `/opt`, `/root/.cache`, den üblichen Systempfaden oder dem erwarteten Playwright Cache. Die Cacheablage enthält nur Installationsreferenzen. Der vorhandene Playwright Installationsplan nennt unverändert Chrome Headless Shell151.0.7922.34, Revision1234 und denselben fehlenden Programmpfad. Die CI verwendet Playwright1.56.1; ein dazu passender Chromium1194 ist in den geprüften Orten ebenfalls nicht vorhanden. Der historische erfolgreiche Browserlauf mit1194 beweist keine heutige lokale Verfügbarkeit.

Der konkrete Vorbeleg der einzelnen HEAD Zeitüberschreitung vom13.09.,08:11UTC ist im neuen Beleg erhalten; keine neue Netzverfügbarkeit daraus behauptet. Wegen unveränderter Umgebung kein weiterer Downloadversuch und keine erneute Ausführung der zwei Suiten. Keine Sperre umgangen. Der geschützte Starter und die lokalen Testpfade wurden gelesen: lokale Datenwiederherstellung, Loopbackserver, echte Browserabschnitte unverändert.90 Vorprüfungen08:12UTC bleiben historisch;keine neue Browserabnahme oder neue Testzustandsänderung. Browserdiagnose mit geprüften Pfaden und Installationsplan: `Browserumgebung.json` im privaten Beleg.

### Synthetischer Nachweis der40er Grenze

Diagnosewerkzeug `scripts/lage-quellen40-diagnose.js`: sieben Diagnosegruppen erfolgreich am13.09.2026,11:30:50 Türkei /10:30:50 Berlin /08:30:50UTC. Zuerst sechs Gruppen, danach ausschließlich um den konkreten Elternvergleich ergänzt und nochmals sieben geprüft. Vorhandene366 erfolgreiche Suiten nicht wiederholt. Der Diagnosecode wurde nach diesem Lauf ohne Funktionsänderung aus dem vorläufigen Testnamen umbenannt und um Aufrufhinweise ergänzt. Er wird nicht als neue grüne Produktsuite gezählt und nicht automatisch im Gesamtlauf eingesammelt.

Beide tatsächlichen Leser werden aus unverändertem Funktionsquelltext mit synthetischem Transport ausgeführt. Der Transport setzt die aus den tatsächlichen Anfragen gelesenen Filter und Limits auf lokalen Daten um; beim unbestimmten Dokumentabruf ist die gespeicherte Reihenfolge eine zulässige synthetische Antwortreihenfolge. Das beweist die Anwendungslücke, keine tatsächlich beobachtete REST oder Production Antwort. Der Metadatenpfad wird mit100/1000 wie im Produkt gestartet. Kein Netz, keine echten Profile, keine persistierten Daten, kein Modell.

| Synthetischer Fall | Vorauswahl | Geladene Texteingabe |
| --- | --- | --- |
|39 alte Dokumente und aktuelles Dokument an Position40 | aktuelle Quelle erkannt | aktuelle Quelle enthalten |
|40 alte Dokumente und aktuelles Dokument an Position41 | aktuelle Quelle erkannt | leer,obwohl Quelle existiert |
|Dieselben41 Dokumente,aktuelle Quelle zuerst | aktuelle Quelle erkannt | aktuelle Quelle enthalten |
|Zwei aktuelle Quellen,neueste an Position41 | beide aktuellen Quellen erkannt | nur die früher publizierte Quelle enthalten |

Der tatsächliche Lagehauptpfad liefert beim leeren Fall `available:false`, `reason:no-current-sources`,null Absätze und eine historische Karte. Weder Cacheabfrage,Modell,Budgetreservierung noch Schreibfunktion wurden erreicht. Eine Absatzreferenz auf den nicht geladenen Beleg wird weiterhin verworfen. Quellenpflicht und sicherer Leerzustand bleiben für diese Probe erhalten; historische Karten dürfen sichtbar bleiben. Der Fall mit nur einem geladenen aktuellen Beleg kann eine dünnere Eingabe liefern;ihre spätere Textqualität wurde ohne Modell nicht bewertet.

Der Dokumentenleser ist gegenüber Elterncommit `6e52a5336325086888ba2b39e049b33be632e92a` bytegleich. Zusätzlich läuft der tatsächliche Lagehauptpfad dieses Elternstands mit denselben41 Dokumenten und liefert denselben sicheren Leerzustand. Damit ist die40er Dokumentengrenze ein bestehendes Verhalten. Neu ist die Diskrepanz zwischen der erweiterten Metadatenvorauswahl und dem begrenzten Folgeleser. In den geprüften Fällen wurde keine neu eingeführte Verschlechterung der Texteingabe nachgewiesen; daraus folgt keine allgemeine Regressionsfreiheit. Der ursprüngliche Vergleich mit höchstens neun Dokumenten je Vorgang bleibt gültig und deckt diese Grenze weiterhin nicht ab.

### Reviewentscheidung und kleinster möglicher Folgeschritt

Die vorbereitete Quellenkorrektur ist reviewfertig, ihre Veröffentlichung wird zurückgestellt. Sie behebt die Verdrängung durch Altquellen bei den belegten kleinen Quellenmengen. Sie garantiert keine aktuelle Texteingabe für jeden durch die neue Vorauswahl zugelassenen Vorgang. Ausreichend für Review, unzureichend für eine uneingeschränkte Freigabeempfehlung.

Kleinster vorgeschlagener separater Produktauftrag:Die im Metadatenpfad belegten Dokumentkennungen für die ausgewählten Lagevorgänge bis zum anschließenden Dokumentlesen erhalten und diese Dokumente gezielt samt Auszug laden. Den bestehenden `getRawDocumentsByIds` Leser auf Eignung prüfen; erwartete Kennungen,Vorgangsbindung,fehlende und fremde Antworten ausdrücklich prüfen. Den allgemeinen40er Detailabruf nicht pauschal erweitern. Endgültige Quellenpflicht,Frische,sechs Belege je Vorgang und16000 Zeichen erneut auf tatsächlich geladenen Dokumenten anwenden. Eine bloße höhere Zahl oder lokale Sortierung nach dem Limit behebt den Fall nicht zuverlässig. Nur Vorschlag,kein Produktumbau in diesem Sprint.

Betroffene spätere Prüfungen:40/41er Grenze mit Quelle am Ende und umgekehrter Reihenfolge,gemischte aktuelle Quellen,fehlende oder fremde Dokumentantwort,unveränderte Quellenbindung und Leerzustände,gebundener Briefingpfad sowie Cachemodus. Die exakte Änderung wäre vor Umsetzung zu bewerten;kein automatischer Folgeauftrag. Echte REST Integration,1000er Seitenannahme,fehlender gemeinsamer Snapshot und Latenz vor Cache bleiben gesondert offene Grenzen. Kein Belastungs oder500er Nachweis.

### Exakter Umfang und sicherer Abschluss

Produktcode und bisherige Tests sind weiterhin identisch zu `0d53cf9dca61b0a40cd12066612ad523210568ea`. Dieser Sprint ergänzt ausschließlich das lokale Diagnosewerkzeug und aktualisiert CURRENT_STATE sowie diesen Beleg. Quellenkorrektur ursprünglich13 Dateien;mit dem Diagnosewerkzeug14 gegenüber dem Elternstand. Gesamter Branch jetzt18 statt17 Dateien gegenüber frisch bestätigtem main Baum `78d62fb947cde91efccf05224e4ce56839fed7c9`. Die vier zusätzlichen historischen Dokumentationsdateien bleiben erhalten. Der exakte finale Commit und Baum stehen in der gesicherten Reviewbeschreibung;kein selbstreferenzieller Commitwert in diesem Dokument.

GitHub main frisch unverändert `8d840d834f8ff312475d86e8c23509b75f63f91d`,nur historischer PR345 offen. Keine laufende Action;zwei seit06.08. wartende CI Aufträge auf anderen Branches ausdrücklich erkannt. Fachautomation `6aa2872e75ec81919d4c0abe7d304ddb` deaktiviert,next_run_time null. Keine lokalen fremden Node oder Browserprozesse sichtbar,keine umfassende Sicht auf andere Chats. Vercel und Datenbank bleiben datierte Vorbelege07:45UTC.

Original301 frei und identisch gelesen. Übernahme gegen unmittelbar frisch gelesene301 als302 bedingt gespeichert und vollständige tatsächliche Bytes identisch rückgelesen. Nach Sicherung der Reviewfassung und Diagnosebelege nur die eigene Steuerung gegen frisch bestätigte Version freigeben und tatsächlichen Abschluss vollständig rücklesen. Endgültige Version und Sicherungskennungen stehen im privaten Originalbericht.

CURRENT_STATE aktualisiert bei erhaltener Historie:29852 Zeichen,212 Zeilen. Größenprüfung4von4 erfolgreich;Diffkontrolle und Syntaxprüfung erfolgreich. Keine Architektur oder Regeländerung,keine Produktkorrektur,kein Push,PR,Merge,Deployment,Modell,Originalabruf,Import,Profilwechsel oder Production Änderung. Zwei Profilfehler und fachliche500er Abnahme bleiben außerhalb des Auftrags. Hier stoppen. Ein direkt anschließender kleiner Auftrag kann im selben Thread mit Astra Hoch erfolgen.


## Kleine Quellenbindungskorrektur nach Weiter am13.09.2026

Status:teilweise abgeschlossen. Lokale Umsetzung und gezielte Prüfungen fertig;echte REST Integration,Browserabnahme und Veröffentlichung bleiben offen. Weiter autorisierte die zuvor konkret vorgeschlagene kleine Quellenkorrektur. Keine Ausweitung auf Profilfehler,500er Fachnachweis,Production oder Veröffentlichung.

### Änderung und Grenzen

Der Aufruf von `loadRankedVorgaenge` erhält einen nur für diesen Aufruf bestehenden Metadatenspeicher. Nach der unveränderten Zwölferauswahl verwendet der Lagepfad denselben Quellenvertrag,um höchstens sechs zu ladende Dokumente je ausgewähltem Vorgang zu bestimmen. Die tatsächlich gewählte Wissensobjektkennung wird ausdrücklich mitgeführt,statt allein aus der Vorgangskennung abgeleitet zu werden.

Der allgemeine Aufruf `getSourcesForVorgang` bleibt bei40 Verknüpfungen und unverändertem Rückfallverhalten. Nur mit ausdrücklichen Lagebelegen verwendet er intern `getGebundeneLageQuellen`:bestehende Verknüpfungen nach Wissensobjekt und genau diesen Dokumentkennungen lesen. Antwort muss vollständig sein,darf keine fremden oder doppelten Kennungen enthalten und muss Titel,URL,kanonische URL und Publikationsdatum der Vorauswahl entsprechen. Fehlende,geänderte oder unlesbare Antworten führen zu `StorageReadError`,im Lagehauptpfad zu `store-error`,vor einem Modell oder Schreibaufruf. Sonderzeichen in Kennungen werden als JSON Zeichenkette und URL Bestandteil kodiert;keine zusätzlichen Filter durch Kennungsinhalt.

Der vorhandene `getRawDocumentsByIds` wurde auf Wiederverwendung geprüft. Er liest nur Dokumente,ohne die aktuelle Verknüpfung zum ausgewählten Wissensobjekt erneut zu bestätigen. Deshalb wird der engere bestehende Verknüpfungspfad verwendet,ohne den allgemeinen Rohdokumentleser zu verändern. Kein neues Schema,keine Migration und kein allgemeiner Umbau der Quellenarchitektur.

Die gebundenen Dokumente werden vor den historischen Dokumenten zusammengeführt. Historische Quellen bleiben bis auf ersetzte identische Kennungen erhalten. Die Reihenfolge ist notwendig,weil der unveränderte Quellenvertrag URL und Titeldubletten vor dem Sortieren entfernt. Ein gezielt geladener Beleg darf dadurch nicht wieder von einer älteren Dublette verdrängt werden. Dieser konkrete zweite Randfall wurde zuerst rot reproduziert,dann korrigiert.

Frischeprüfung,Quellenpflicht,Quellenschutz,sechs Belege je Vorgang und16000 Eingabezeichen bleiben unverändert. Die abschließende Eingabe wird weiterhin ausschließlich aus tatsächlich geladenen Dokumenten gebildet. Die Zeichenobergrenze darf dabei weiterhin spätere Belege ausschließen;keine unbeschränkte Vollständigkeitszusage. Bei keiner aktuellen Quelle bleibt der ehrliche Leerzustand erhalten. Zählmodus und gebundener manueller Briefingpfad starten keinen zusätzlichen Dokumentabruf.

Kosten der Änderung sind zusätzliche Leseanfragen,keine zusätzlichen Modellaufrufe durch diese Arbeit. Höchstens zwölf ausgewählte Vorgänge,je höchstens sechs gezielt geladene Dokumente. Je Vorgang kann eine zusätzliche Anfrage hinter dem bisherigen40er Abruf liegen;diese liegt auch vor der Cacheprüfung. Unter Production Last nicht gemessen. Keine Erhöhung von Modellbudgets oder Eingabegrenzen. Bereits vorhandene1000er Seitenannahme und fehlender gemeinsamer Snapshot bleiben offen. Die neue strenge Antwortkontrolle erkennt Änderungen der verglichenen Metadaten;der Auszug wird erst beim Dokumentabruf gelesen und ist nicht gegen einen früheren Auszugssnapshot geprüft.

Die PostgREST Primärdokumentation bestätigt die verwendeten [Spaltenfilter und IN Werte](https://docs.postgrest.org/en/stable/references/api/tables_views.html#horizontal-filtering). Der [Supabase Änderungsverlauf](https://supabase.com/changelog) wurde gezielt gesichtet;Markdownabruf scheiterte am Inhaltstyp,HTML war lesbar. Keine einschlägige Umstellung dieses bestehenden Tabellenpfades aus den gelesenen aktuellen Einträgen abgeleitet. Dokumentation ersetzt keinen Integrationstest.

### Echte lokale Prüfungen

Neue automatische Produktsuite `scripts/lage-quellenbindung40-test.js`. Vor Änderung erste Assertion rot:false statttrue bei aktueller Quelle an Position41. Nach Korrektur11von11 Gruppen erfolgreich,zuletzt13.09.,11:50:47 Türkei/10:50:47 Berlin/08:50:47UTC. Unveränderter Funktionsquelltext der tatsächlichen Leser mit synthetischem Transport und synthetischer Speicherbereitschaft. Metadatenantwort ohne Auszug,gezielter Dokumentabruf mit Auszug,echte Lageeingabe und Quellenprüfer. Kein echter REST Server,keine Datenbank und kein Modell. Verwendete technische Attrappen sind ausdrücklich Bestandteil des lokalen Nachweises.

Geprüft:Quelle an Position41 erreicht die echte Texteingabe samt Auszug;Antwortreihenfolge;zwei aktuelle Belege einschließlich neuestem außerhalb der40er Teilmenge;ältere URL und Titeldublette;fehlende,fremde,doppelte oder geänderte Antwort;ungültige oder übergroße Bindung;Sonderzeichen ohne Filteränderung;kein stiller Leerzustand bei verlorenem Beleg;ehrlicher Leerzustand ohne aktuelle Quellen;unveränderter Zählmodus und40er Detailabruf;höchstens sechs gezielte Belege. Der neue Test zeigt ausdrücklich null erreichte Modell oder Schreibfunktionen.

| Betroffene Suite | Erfolgreiche Gruppen beziehungsweise Assertions |
| --- | ---: |
|lage-quellenbindung40 |11 |
|lage-quellenfenster |10 |
|lage-quellenbeleg |21 |
|lage-reparatur |8 |
|briefing-lagebindung |7 |
|lage-cacheonly |9 |
|lage-quellenauswahl |5 |
|lage-dokumentbindung |8 |
|tenant-narrativ |92 |
|scoring-integration |24 |
|radar-scan-limit |3 |

Alle elf betroffenen Suiten über `scripts/lokal.js` und nacheinander ausgeführt. Nach der konkreten Dublettenkorrektur nur unmittelbar betroffene Quellenbindung,Cache,Briefingbindung,Mandatstrennung und neue Regression nochmals geprüft. Historische366von368 erfolgreiche Suiten nicht als vollständige neue Abnahme ausgegeben. Neue Suite erhöht den Sollbestand auf369;kein neuer Gesamtlauf und keine neue CI. Beide Browserprüfungen weiterhin blockiert,keine erneute Installation oder Wiederholung ihrer90 historischen Vorprüfungen. Historisches Diagnosewerkzeug `lage-quellen40-diagnose.js` bleibt Beleg für Stand6dc57ed;seine damaligen erwarteten Mängel sind keine Erfolgskriterien für diesen neuen Kandidaten.

### Review und Abschluss

Fünf Dateien in diesem lokalen Folgecommit:zwei Produktdateien,eine neue Regression,CURRENT_STATE und dieser Betriebsbeleg. Bestehende Tests oder Fixtures nicht geändert;keine Erwartungen abgesenkt. Ursprüngliches Quellenpaket13 Dateien,mit vorheriger Diagnose und neuer Regression jetzt15 gegenüber Eltern6e52a5336325086888ba2b39e049b33be632e92a. Gesamter Branch19 Dateien gegen main Baum78d62fb947cde91efccf05224e4ce56839fed7c9,einschließlich vier unveränderter historischer Dokumentationsdateien. Finale Commit und Baumkennung in gesicherter Reviewfassung.

Original303 frisch frei. Eigene Übernahme304 bedingt gespeichert und vollständige gespeicherte Bytes identisch rückgelesen. GitHub main frisch unverändert8d840d8,nur historischer PR345 offen,keine laufende Action,Fachautomation aus,keine sichtbaren lokalen Fachprozesse. Keine umfassende Sicht auf andere Chats. Vercel und Datenbank nicht erneut geprüft. Review und neue Belege vor abschließender bedingter Freigabe sichern;endgültigen gespeicherten Originalbericht vollständig rücklesen.

Veröffentlichung weiter zurückgestellt,bis die echten Lesewege und noch fehlenden Browsernachweise bewertbar sind. Rein lesende Werkzeugverfügbarkeit am Abschluss:psql,postgres undpostgrest nicht im aktuellen PATH gefunden. Daraus folgt keine umfassende Aussage über mögliche Installationen außerhalb des PATH. Keine Installation oder neue Integrationsumgebung begonnen.

Nächster sinnvoller kleiner Auftrag in neuem Thread:Ausschließlich einen isolierten REST Nachweis für Metadatenleser und gebundenen Dokumentenleser auf vorhandener Testinfrastruktur vorbereiten und,wenn sicher möglich,ausführen. Fehlende Werkzeuge als konkreten Umgebungsblocker behandeln,keine Schleifen und keine Production Ersatzprobe. Browserblocker nicht ohne geänderte Umgebung erneut reproduzieren. Kein Push,PR,Merge,Deployment,Profilwechsel oder Modell. Astra Hoch. Dieser lokale Umsetzungssprint endet hier.

## Isolierter REST Sprint am 13.09.2026

Status: teilweise abgeschlossen. Die Prüfung ist als separat ausführbare Suite vorbereitet und der tatsächliche Umgebungsblocker belegt. Keine einzige REST Integrationsgruppe ist bestanden. Der Quellenfix bleibt unverändert auf dem Produktstand `c3b08e37108f4ceb1afe5a749fcc442b26dd9382`. Kein neuer Produktfehler durch den abgebrochenen Vorflug belegt.

### Vorflug und Umgebung

Pflichtdateien vollständig in Reihenfolge gelesen, keine geltende AGENTS.md gefunden. Lokaler Kandidat und Baum `ae21201c8a3f656e12e69d4715dd4e576af1761d` sauber vorhanden. GitHub main und Baum am 13.09. gegen 12:09 Türkei / 11:09 Berlin / 09:09 UTC frisch unverändert. Nur historischer PR345 offen, null laufende Actions. Zwei alte wartende Aufträge `31128435980` und `31126446647` auf anderen Branches bleiben unverändert. Fachautomation `6aa2872e75ec81919d4c0abe7d304ddb` deaktiviert, nächster Lauf null. Keine sichtbaren lokalen Fachprozesse; keine umfassende Sicht auf andere Chats. Keine neue Production Inventur.

`psql`, `postgres`, `postgrest`, Docker, Podman und Supabase CLI nicht im PATH. Keine PostgreSQL Installation in `/usr/lib/postgresql` oder `/usr/local/pgsql`, kein `/tmp/postgrest`, kein Docker Socket. Gezielte Dateisuche in `/opt`, `/tmp`, `/usr/local/bin` und dem vorhandenen Arbeitsverzeichnis ergab kein solches Programm. Keine PostgreSQL Pakete im lokalen APT Archiv. Das ist eine begrenzte Standortprüfung, keine vollständige Inventur des Rechners.

Die vorhandene `.github/workflows/ci.yml` stellt PostgreSQL17 und PostgREST12.2.3 bereit. Der dortige Release Download ist per SHA256 `9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c` gepinnt. GitHub Release Downloads liegen außerhalb der erlaubten Netzwerkziele dieser Work Umgebung. Kein Download versucht, keine Sperre umgangen und kein neuer Timeout behauptet. Keine Installation, Containeranlage oder neue CI ausgelöst. Die bestehende Kontenschutzsuite wäre wegen ihrer zusätzlichen Profil und Kontenprüfungen kein geeigneter Ersatzlauf für diesen Auftrag.

Tatsächlicher Vorflug um 12:13:31 Türkei / 11:13:31 Berlin / 09:13:31 UTC:

```text
node scripts/lokal.js -- node scripts/lage-quellen-rest-datenbank-test.js
Exit 2
HELMUT_TEST_PG_HOST/PORT fehlen als ausdrücklicher isolierter Anschluss.
psql: ENOENT
PostgREST: ENOENT
REST_ERGEBNIS: nicht ausgefuehrt; null Integrationsgruppen bestaetigt
```

Keine Datenbankverbindung, kein angelegter Testbestand, kein gestarteter PostgREST Dienst. Keine Wiederholung dieses unveränderten Blockers. Browser unverändert offen; keine neue Diagnose, Installation oder Suite ausgeführt.

### Vorbereitete Prüfung und Isolation

Neue Datei `scripts/lage-quellen-rest-datenbank-test.js`. Vorbild ist der vorhandene isolierte PostgreSQL und PostgREST Aufbau aus `auth-store-cas-datenbank-test.js`; das unveränderte `fixtures/z3-plattform.js` liefert ausschließlich das lokale HTTP Tor. Es entfernt den Supabase Pfadpräfix und reicht echte Antworten unverändert weiter. Keine Attrappe für REST Antworten und keine Funktionskopie der Quellenleser.

Die Suite verlangt den lokalen Starter, explizit `127.0.0.1`, einen expliziten Port, PostgreSQL17 und PostgREST12.2.3. Voraussetzung für eine spätere Ausführung ist ein unabhängig als synthetisch und isoliert bestätigter Cluster; eine bloße Loopback Adresse beweist das nicht. Der Test selbst provisioniert keine Cluster oder Ressourcen. Er legt ausschließlich eine zufällig benannte eigene Testdatenbank an und löscht nur diese anschließend mit lesender Bestätigung. Keine Rolle, kein Konto und kein Profil wird angelegt oder verändert. Native psql Aufrufe verwenden eine eigene minimale Umgebung und keine Startdatei oder geerbte libpq Servicekonfiguration. Prozessfristen sind begrenzt.

Die synthetischen Tabellen enthalten die notwendigen Spalten und Typen aus `supabase/schema.sql`: Textkennungen, Publikationsdatum als timestamptz, Fremdschlüssel und zusammengesetzter Primärschlüssel. Keine vollständige Schema oder Migrationsabnahme. RLS ist eingeschaltet; der bestehende lokale Eigentümer liest diese ausschließlich lokale Testprojektion. Das beweist keine Supabase Auth oder Mandantentrennung. Die drei Tabellen enthalten keine Mandatsdaten.

Nur innerhalb des geschützten Testprozesses werden die generierte lokale URL, das kurzlebige synthetische Token und der V3 Lesemodus gesetzt; vor Abschluss wiederhergestellt. Keine Sitzungsdatei oder persistente Umgebungsvariable verändert. Beide echten exportierten Funktionen aus `storage.js` verwenden ihren unveränderten Transport. Das Tor zählt die Anfragen. Zulässig sind ausschließlich GET Zugriffe auf `ko_document_links`; kein Modellmodul und keine Fachlauf oder Kontenfunktion wird aufgerufen.

| Vorbereitete Gruppen | Erwartung vor Ausführung |
| --- | --- |
| 1 Zeitfilter | Beide Grenzen inklusive, alte und zukünftige sowie undatierte Quellen ausgeschlossen; Metadaten ohne Auszug |
| 2 Innere Verknüpfung | Ausschließlich alte oder fehlende Quellen ergeben keine Kante |
| 3 Mehr als 40 | Aktueller Beleg bei 41 vorhandenen Dokumenten gezielt samt Auszug geladen; allgemeiner Leser liefert weiterhin höchstens 40 |
| 4 Sechs Belege | Nur ausgewählte Dokumente, Ergebnis in erwarteter Reihenfolge |
| 5 Sonderzeichen | Unicode und reservierte Zeichen werden als Kennungswerte verarbeitet |
| 6 Seitengrenze | 1001 Verknüpfungen vollständig in zwei tatsächlichen REST Anfragen |
| 7 Stapelgrenze | 101 Wissensobjekte vollständig in zwei Anfragen |
| 8 bis 11 Metadatenänderung | Titel, URL, kanonische URL und Publikationsdatum jeweils als Lesefehler abgelehnt |
| 12 Bindungsverlust | Fremdes Wissensobjekt oder entfernte Kante führt zu StorageReadError |
| 13 Ungültige Auswahl | Doppelte oder mehr als sechs erwartete Kennungen vor REST verweigert |

Der zusammengesetzte Primärschlüssel verhindert doppelte gespeicherte Kanten. Manipulierte doppelte Serverantworten werden weiterhin nur durch den historischen synthetischen Test geprüft; kein solcher tatsächlicher REST Fehler wird vorgetäuscht. Der neue Nachweis prüft beide Leser, keinen vollständigen Lage oder Modelllauf. Die Zeichenbegrenzung, 4000er Gesamtgrenze, Snapshotfrage, kleinere serverseitige Seitenlimits und Production Last werden nicht zu neuen Aufgaben ausgeweitet.

Aufruf ausschließlich nach bestätigter Isolation, mit den bekannten lokalen CI Testwerten oder entsprechend belegten Werten des eigenen Testclusters:

```sh
HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 \
HELMUT_TEST_PG_USER=helmut PGPASSWORD=helmut \
HELMUT_TEST_POSTGREST_BIN=/tmp/postgrest \
node scripts/lokal.js -- node scripts/lage-quellen-rest-datenbank-test.js
```

Dies sind ausschließlich synthetische lokale Beispielwerte. Keine Production Kennung einsetzen. Ohne Voraussetzungen Exit2, bei fachlichem oder technischem Testfehler Exit1. Erfolg erst bei 13 bestandenen Gruppen und bestätigter Bereinigung. Bei unerwartetem Produktbefund: Fehlermeldung und betroffenen Fall sichern, kleinste Korrektur und betroffene Prüfungen dokumentieren; keine allgemeine Überarbeitung.

### Prüfstand und Abschlussgrenzen

Syntax beider angefassten JS Dateien erfolgreich. Der reine Listenmodus des kanonischen Runners bestätigt weiterhin369 Offline Suiten. Nur der neue, ausdrücklich datenbankabhängige Test ist zusätzlich ausgeschlossen; keine bestehende Suite entfernt oder Erwartung geändert. Der neue Nachweis ist noch nicht in CI verdrahtet. Fehlende Infrastruktur wird nicht als grüner Skip gezählt. Kein vollständiger Gesamtlauf und keine Wiederholung der elf erfolgreichen Produktsuiten bei unverändertem Produktcode.

Versionsgebundene Referenz für die vorbereiteten Erwartungen: [PostgREST12.2 Verknüpfungen](https://docs.postgrest.org/en/v12/references/api/resource_embedding.html#top-level-filtering) und [Filter](https://docs.postgrest.org/en/v12/references/api/tables_views.html). [Supabase Änderungsverlauf](https://supabase.com/changelog) gelesen; Markdownabruf scheiterte am Inhaltstyp. Dokumentation ersetzt weiterhin keinen Lauf des Kandidaten. Keine Supabase Plattformfunktion geändert.

Review und CURRENT_STATE sind auf diesen Vorbereitungsstand zu beziehen. Der genaue neue Commit und Baum sowie die dauerhafte Sicherung stehen im privaten Review und Originalbericht. Original305 vollständig bestätigt, Übernahme306 gegen305 bedingt gespeichert und vollständig bytegleich rückgelesen. Abschluss nur gegen unmittelbar bestätigte eigene Version speichern und vollständig rücklesen.

Veröffentlichung weiterhin zurückgestellt. Browserabnahme, REST Abnahme, zwei Profilfehler und fachlicher Nachweis für500 bleiben offen. Keine Production Wirkung, neue CI, Profile, Konten, Modellaufrufe oder Quellenabrufe. Nächster Schritt erst bei nachgewiesen verfügbarer isolierter Umgebung: genau diese Suite ausführen. Derselbe Thread mit Astra Hoch genügt für diesen kleinen direkten Anschluss; ein neuer Thread allein beseitigt den Umgebungsblocker nicht. Dieser Sprint endet hier ohne automatischen Folgeauftrag.
