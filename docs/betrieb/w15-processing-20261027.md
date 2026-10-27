# W15-Verarbeitung: gezielter Nachweis vom27.10.2026

Der Betreiber priorisiert Verarbeitung, Unit60, Auth30 und gemeinsame RAM-Reserve.
Historische Nachrichten werden fuer diesen isolierten Leistungsnachweis nicht
repariert. Echte Quellenversorgung bleibt ein eigener Schritt vor Production.
W15 bleibt der einzige Motorpfad. PR972/971/969 bleiben ungemergt.

## Eingaben und Verarbeitung

500/500 echte D-Vorbereitungen mit nichtleeren Kontexten bestanden. Verwendet wird
der urspruengliche gepinnte W15-Preparer, ohne Modellaufruf. Anders als beim
vorherigen reinen Protokollbeleg stimmen Datum und Hashes von Kontext und
tatsaechlichem Request nun ueberein; keine499 unqualifizierten Requestfixtures.
Der vollstaendige Command umfasst105.764.857B entpackt; die private codierte
Commanddatei1.148.089B. Es wird kein kleiner Einzelprofil-Command als500er-
Eingabegleichheit ausgegeben.

Die kleinste klar als **synthetische Leistungsfixture** gekennzeichnete Ableitung
veraendert genau eine ausgewaehlte Quellenzeit:13.10.,11:02:48UTC wird im
Testbestand zu25.10.,11:02:48UTC. Alle Texte,7Quellen/6KOs, Profile und der
gebundene PDF-Beleg bleiben erhalten; Originaldateien und Originalrestore werden
nicht geaendert. Das ist keine aktuelle Nachricht und kein neues fachliches
Qualitaetsurteil. Keine zusaetzlichen Quellenimporte.

Der vorhandene Eingabe-/Quellenvertrag wird mit den echten A/F/B-Pruefern neu
gebunden. Dokument-, Cluster- und Kostenplanschluessel entstehen durch die
vorhandenen K-/V-Generatoren. Enger Pfadvergleich verbietet andere Aenderungen;
Originalhashes bleiben gleich. In der neuen isolierten Datenbankkopie wurde
genau eine Quellenzeile geaendert (`UPDATE RETURNING`/count1). Anschliessend
bestaetigte der echte Storage-Pruefweg die vollstaendigen Source23-/KO60-
Postimages gegen alle abgeleiteten7/6 Eingaben. Kein Pruefer ausgetauscht.

## Vorheriger Vorbereitungsnachweis (ohne Unit)

Vorhandener netzloser PG17.6-Container; kein neuer Container oder Server.
Der vorhandene Node24.19-Binaerstand und benoetigte Repositorydateien wurden nur
innerhalb derselben Codex Cloud bereitgestellt. Die vorgelagerte Zusammenstellung
der90MB Originaleingaben liegt ausserhalb der Anwendungsmessgruppe. Nur der
kompakte gespeicherte Command und Metadaten werden dort benoetigt, kein Archiv.

Tatsaechliche Anwendung mit Workerthreads, PostgREST, Gateway und PostgreSQL
laufen in derselben Kernel-Cgroup. Neue Ed25519-Schluessel bleiben in ihrem
geschuetzten Verzeichnis im Container; exportiert wurden nur oeffentliche Daten.
Signaturen, Systemuhr, Kostenkontrollen und Production-Schutzregeln bleiben echt.

| Gezielter realer Fall | Gemessen | Unveraenderte Grenze |
|---|---:|---:|
| Signierte Vorbereitung inkl. vollstaendigem C |12,560s|90s|
| Kaltes Prepared-Open nur mit oeffentlichem Schluessel |3,116s|60s|
| Quittierter Auth-CAS bei Installation |0,667s|30s|
| Quittierter Auth-CAS bei Claim |0,506s|30s|
| Quittierter Auth-CAS bei Stop |0,604s|30s|

Alle Authfaelle umfassen Lesen, Callback und bestaetigten Schreibabschluss;
jeweils genau ein Callback. Der Eingangsbestand enthaelt500Units/1000Intents und
5000 erhaltene historische Usagezeilen. Die Buecher und Usage bleiben unveraendert.
Diese drei Faelle ersetzen keine Auth30-Abnahme des spaeteren voll gewachsenen
500er-Ledgers.

**Gemeinsamer Kernel-Lebenszeitpeak:1.122.721.792B.** Keine Baseline subtrahiert,
keine Addition einzelner RSS-Maxima. Gegen2.048.000.000B Vergleichsbudget bleiben
925.278.208B rechnerische Reserve, also mehr als500.000.000B. `memory.max=max`:
das Vergleichslimit war nicht erzwungen; der Peak wurde nicht zurueckgesetzt und
ist kein nur fuer diese Phase isolierter neuer Peak. Der konservative Lebenszeit-
hoechstwert umfasst auch fruehere Aktivitaet dieses Containers. Dies belegt den
gedeckten Vorbereitungs-/Authumfang, keine aktive Unit- oder Production-Abnahme.

Die echte native Runtime bestaetigt `vorbereitet`,500Mandate/501Identitaeten/
0aktiv. HTTP liefert1500 ausstehende Positionen. Der echte Adapter weist den
aktiven Einstieg mit `direct-exact500-active-runtime-required` ab. Einmalclaim
und Stop wurden ohne Unit-Eintritt ausgefuehrt; die Operation ist verbraucht.
0Profilaktivierungen,0Units,0Anbieteraufrufe,0Productionaktionen.

## Belege und erhaltener Erstfehler

[Bereinigter Messbeleg](belege/w15-processing-20261027/PROCESSING.SAFE.json)
enthaelt Einzelwerte und SHA256/Bytezahlen der privaten Rohberichte.
V8-Coverage wurde beim ohnehin erforderlichen Eingabevorbereitungslauf erfasst;
die Leistungsphasen laufen ohne Profiler/Coverage-Overhead. Keine Vollserie
allein fuer Coverage und keine Wiederholung der bisherigen12 Sicherheitsfaelle.

Zwei klar begrenzte Erstfehler bleiben erhalten: der neue Dokumentversionskey
brauchte auch seinen kanonischen Clusterverweis; beim kalten Serverstart fehlte
eine vorhandene Repository-Skriptabhaengigkeit. Nur diese Luecken wurden behoben.
Fehlgeschlagene Datenbankkopie und Rohberichte wurden nicht geloescht.

Zwei getrennte Agenten haben Funktions-/Kontrollbindung bzw. RAM-/Auth-Aussagen
rein lesend geprueft, ohne Blocker fuer den benannten Umfang. Threadpraeferenz:
mehrere Agenten, wenn getrennte Aufgaben Zeit sparen; keine konkurrierenden
Schreibzugriffe. Der Anwendungscode ist bytegleich zum gruenen
[CI40534410137 aufda63309c](https://github.com/ernisch/helmut-pilot/actions/runs/40534410137).
Danach aendern sich nur private Testharnesse und Dokumentation; `[skip ci]`
verhindert die erneute identische Vollserie. Kein neuer Kopf-CI-Erfolg behauptet.

## Freigegebener einzelner DR-Versuch: gestoppt, sicher beendet

**Sprintzustand: gescheitert oder abgebrochen.** Der Betreiber gab genau eine
neue isolierte Aktivierung mit einer DR-Mock-Unit frei. Der Lauf ist verbraucht;
keine Reparatur, automatische Wiederholung oder weitere Unit wurde ausgefuehrt.
[Sanierter vollstaendiger Empfangs-/Messbeleg](belege/w15-processing-20261027/UNIT0_RESULT.SAFE.json)
verweist mit Bytezahl/SHA256 auf die erhaltenen privaten Einzelberichte.

Die neue DB `helmut_w15_unit0_20261027` entstand ausschliesslich aus dem bereits
geprueften Originalrestore im vorhandenen netzlosen Container. Ihre anfaenglichen
Aktivflags wurden auf0 gesetzt; der Fachhashvergleich prueft alle anderen
Mandatsfelder sowie Storehash/Bestandszahlen gegen die unveraenderte Quelle.
500/500 echte D-Eingaben wurden fuer die neue Operation gebunden. Originaldateien
und Source23-/KO60-Inhalte bleiben erhalten; nur die bereits gepruefte synthetische
Zeit-Ableitung lebt in der neuen Kopie. Kein neuer Import, Container oder Download.

Frische Operatorfreigabe, native Original-Vorbereitung und Aktivierung liefen
innerhalb der unveraenderten Zeitbindungen vor der Auth-veraendernden Installation.
Nativ bestaetigt:500synthetische aktiv/500Mandate/501Identitaeten. Neuer geschuetzter
Ed25519-Schluessel und frische Signaturen; der kalte HTTP-Einstieg hat nur den
Publickey. Private Schluessel und Transportkennungen wurden nicht exportiert.
Der vorhandene externe Endwaechterbeleg ist eine gekennzeichnete lokale
Testannahme; daraus entsteht kein Production-Endwaechternachweis.

| Tatsaechliche Messung dieses einen Versuchs | Ergebnis |
|---|---:|
| Signierte Vorbereitung inkl. vollstaendigem C |12,775s <90s|
| Kaltes Prepared-Open innerhalb des HTTP-Einstiegs |2,738s <60s|
| Quittierter Auth-CAS Installation / Claim / Stop |675,454 /634,047 /626,569ms|
| Fehlgeschlagene Reservierung: Gesamt / Callback |185,995 /54,980ms, **kein ACK**|
| HTTP-Einstieg bis Fehlerantwort |12,192s, HTTP409|
| Vollstaendige Unit bis persistentem Finish-ACK |**nicht erreicht, nicht messbar**|

Die Unit wurde genau einmal betreten. Noch vor dem ersten HTTPS-Mockaufruf
schloss die echte Kosten-/Routenpruefung mit
`synthetik500-admission-reservation-route-drift`. Die lokale Testkonfiguration
setzt `HELMUT_UNDERSTANDING_MODEL=gpt-5-mini-eu`, laesst aber
`AZURE_OPENAI_DEPLOYMENT` aus. Bei Azure verwendet
`provider-runtime-attestation.resolveModels` ausschliesslich dieses Deployment
oder den Default `gpt-5-mini`; der signierte Plan bindet `gpt-5-mini-eu`.
Die exakte Routenpruefung stoppt daher korrekt. URL-Normalisierung passt.
Diese Diagnose stammt aus vorhandenen Rohberichten und Quellvergleich, ohne
zweiten Test. Kein Kostenlimit oder Sicherheitspruefer ist abzuschwaechen.

**Drei erwartete Ergebnisse: Mandatsbriefing, Morgenbriefing, Lage — alle0.**
0Mockantworten/0echte Modellaufrufe, kein gespeicherter Unitoutput/Finish-ACK.
Unit60 sowie die zwei19,9s-Verzoegerungen sind unbewiesen. Quittierte Authfaelle
liegen unter30s; der abgewiesene Reservierungsfall und das spaetere finale500er-
Ledger sind damit nicht als bestanden erklaert.

Gemeinsamer Kernel-Lebenszeitpeak einschliesslich DB, PGRST, Gateway, Node,
Worker und zugerechnetem Cache: **1.378.390.016B**. Gegen2.048.000.000B bleiben
**669.609.984B** rechnerische Reserve, ueber500.000.000B. Kein Peakreset,
keine Baselinesubtraktion, Host-Eingabeassemblierung ausserhalb. `memory.max=max`
und Ressourcen des vorhandenen Containers unveraendert: kein technisch
erzwungenes Limit und keine RAM-Abnahme einer vollstaendigen DR-Verarbeitung.
Swap an den Messpunkten0; alle gemessenen Memory-/OOM-Ereigniszaehler0.

Nach dem Fehler wurden die eigenen Unitprozesse beendet/geprueft. Genau ein
gebundener nativer End-RPC fuehrte500→0; Antwort, SQL-Zaehlung und separater
nativer Readback bestaetigen **beendet/aktiv0**. Zugehoerige PGRST-/Gatewayprozesse
sind beendet. Die Journaloperation bleibt `unknown`/einmal betreten/0Outputs
und darf nicht fortgesetzt werden. Quelldatenbank vor/nach mit Profil-/Store-/
Raw-Dokumenthashes und Zaehlern unveraendert. Keine bestehenden Datenbanken,
Budgets, Production, Hetzner oder Merges geaendert.

Zwei unabhaengige Agenten prueften vorab Kontroll-/Requestbindungen und
RAM/Auth/Abbruchwege. Dabei gefundene Harnessluecken wurden **vor dem ersten
Lauf** geschlossen: echte innere Prozesszeitlimits/Exitpruefung, serverseitige
End-RPC-Timeouts und readonly Gegenlesung bei unbekanntem Schreibausgang.
Nach dem Lauf bestaetigten sie rein lesend Ursache und Berichtsumfang.
V8-Coverage wurde im erforderlichen Eingabevorbereitungslauf erfasst;
keine Coverage/Profiler in den Leistungsphasen und keine weitere Testserie.
Anwendungscode unveraendert zum oben belegten gruenen CI-Stand; neuer
Kopf-CI-Erfolg wird nicht behauptet.

Beim Abschluss des abgebrochenen Versuchs war die kleinste Korrektur der fehlende lokale
`AZURE_OPENAI_DEPLOYMENT`-Wert entsprechend dem signierten Modell, gefolgt vom
vollstaendigen aufgeloesten Routentupelvergleich. Damals noch nicht umgesetzt,
weil nach dem ersten Fehler gestoppt wurde; der folgende Abschnitt fuehrt das neue Korrektur-GO aus. Ein erneuter einzelner Funktionslauf
braucht ein **neues separates GO**, neue DB/Operation/Signaturen und denselben
Rueckweg auf0. Keine Wiederverwendung dieser Operation. Voll500/1500, voll
gewachsenes Authledger, technisch erzwungene gemeinsame RAM-Grenze und echte
Quellenversorgung vor Production bleiben offen. PR969/971/972 ungemergt.


## Lokale Routen-Korrektur und ungestarteter Folgelauf

**Korrekturschritt abgeschlossen; neuer Unitlauf ungestartet.** Mit separatem GO
wurde ausschliesslich im privaten Testaufbau `AZURE_OPENAI_DEPLOYMENT=gpt-5-mini-eu`
gesetzt und im lokalen Cleanup entfernt: beide Runtime-Konfigurationsstellen und
die Eingabenvorbereitung. Production-Env, Anwendungscode und Kontrollen bleiben gleich.

Die einzige gezielte Pruefung verwendet `ai.runtimeProviderConfiguration()` und
`understandingModelName()`. Sie fuehrt exakt die korrigierten Konfigurationszeilen
des Testharness aus, ohne dessen Dispatcher zu importieren. Alle sieben Senderfelder
stimmen per Deep-Equal und kanonischem `pruefeRouteSnapshot`-Hash mit dem signierten
Referenzplan ueberein: Azure, Responses-URL, gpt-5-mini-eu, Commit, Deploymenthost/-ID,
API-Key-Modus. Nur lokaler Dummykey; keine Azure-Konto-/SKU-/Tarifaussage.

Echte Ed25519-Pruefung des erhaltenen Contentproofs sowie kanonischer Hashvergleich
von vollstaendig dekodiertem Command und Plan belegen den historisch signierten
Inhalt. Keine Laufrechts-/Frischeerneuerung oder Wiederverwendung alter Freigaben.
Nur readonly SQL in der alten TestDB; kein Prepare/Install/Admission/Claim/Reserve/Start.
[Sanierter Routenbeleg](belege/w15-processing-20261027/ROUTE_CHECK.SAFE.json).
**PASS fuer lokale Konfigurationsgleichheit**,0DBwrites/0Aktivierungen/0Units/
0Modell- oder Mockaufrufe. Vorher/nachher0aktive Profile, alte Operation unveraendert
unknown/gesperrt. Unabhaengiger Agent hat Scope und Beleg rein lesend bestaetigt.
Keine Voll-CI oder Leistungsmessung wiederholt; Anwendungscode-CI weiterhin gruen.
Historische Harness-Pins/Rohberichte gehoeren zum erhaltenen Commit ed73fee8.

[Inerter neuer Freigabeentwurf](belege/w15-processing-20261027/UNIT0B_GO_PROPOSAL.SAFE.json):
Alle drei Harnesse verwenden konsistent die unbenutzte neue DB
`helmut_w15_unit0b_20261027`, neue Verzeichnisse und Operationprefix
`synthetik500-w15-unit0b-`. Ausfuehrung nicht aufgerufen. Noch keine DB, Operation,
Schluessel oder Signatur erzeugt: diese entstehen erst nach separatem Start-GO
unmittelbar vor dem Lauf, damit echte <=60s-Beobachtungen und Startbindungen
frisch bleiben. Keine Berechtigungsbelege vor der Betreiberentscheidung voraltern.

Freigabereif ist genau derselbe einzelne DR-Mocklauf: neue netzlose TestDB,
500synthetische Profile temporaer aktiv,1Unit/2lokale19,9s-Simulationen,
Unit60/Auth30/gemeinsames RAM messen, gebundener Rueckweg auf0 mit Gegenlesung.
Erster Fehler/Unbekannt beendet den Versuch, kein Next/Retry. Speicherbudget
2.048.000.000B/Reserve500.000.000B unveraendert; max=max ist weiterhin kein
erzwungener Cap. Kein500er-/Productionnachweis aus dieser Vorbereitung.


## UNIT0B: eine vollstaendige DR-Unit, gemeinsame Reserve verfehlt

**Gesamtzustand: gescheitert oder abgebrochen an der RAM-Abnahme.** Der genau
freigegebene Einzellauf wurde einmal mit frischer DB, Operation und Ed25519-
Signaturen ausgefuehrt. Die gepinnten Harnesse und korrigierte lokale Azure-
Konfiguration blieben unveraendert. Genau500synthetische Profile waren nativ
aktiv;1Unit wurde betreten und dauerhaft abgeschlossen.2lokale Mockantworten,
0echte Modellaufrufe, kein Next/Retry und kein500er-Gesamtnachweis.

| Tatsaechliche Messung | Ergebnis |
|---|---:|
| Unit: unmittelbar vor J.enter bis ACK der J.finish-Mutation |55,924351s <60s|
| Zeitreserve dieser Unit |4,075649s|
| D-/R-Mockverzoegerung, echte monotone Uhr |19,901801 /19,904913s|
| Neun quittierte Authmutationen inklusive Installation |max662,958ms <30s|
| Signierte Vorbereitung / kaltes Prepared-Open |12,371s /2,672s|
| Gesamter HTTP-Aufruf inklusive Cold-Open und Claim |60,737s, HTTP200|

HTTP-Gesamtzeit und Unit60 haben unterschiedliche Startpunkte. Alle acht
Runtime-Authmutationen und die Installation hatten genau einen Callback und
bestaetigten ACK. Dies ist der Auth30-Nachweis fuer diesen abgedeckten Einzellauf,
kein Nachweis fuer das spaeter voll gewachsene500er-Ledger.

**Drei erwartete Ergebnisse wirklich gespeichert:** Mandatsbriefing,
Morgenbriefing (DBslot morgenlage) und Lage. Der unabhaengige Auditor bestaetigte
34Kontrollen: volle echte Zeilen stimmen mit Evidence und kanonischen Hashes
ueberein, Journal-resultHash stimmt, Nutzer/Tag/Zeitfenster passen, Morgenquittung
bindet Mandatsbriefing, Lageeingabe sowie beide D/R-Runbelege stimmen, vorhandene
pure Validatoren reproduzieren die gespeicherten Inhalte. Technisch vollstaendig;
fachstatus weiterhin ausstehend, lokale Mocktexte statt Production-Modellqualitaet.
Sein erster zusaetzlicher Eingabehashvergleich enthielt einen Auditpfadfehler
(eingabeHash liegt unter basis.eingabe); Erstbericht blieb erhalten. Nur privater
Auditpfad korrigiert, rein lesend abgeschlossen; keine Anwendungsaenderung oder Unitwiederholung.

[Sanierter Gesamtbeleg](belege/w15-processing-20261027/UNIT0B_RESULT.SAFE.json) und
[unabhaengige Ergebnisnachlesung](belege/w15-processing-20261027/UNIT0B_RESULTS_INDEPENDENT.SAFE.json).
Bytezahlen/SHA256 verweisen auf erhaltene private Originalberichte.

Der gemeinsame Kernel-Lebenszeitpeak stieg auf **1.558.614.016B**. Gegen das
unveraenderte2.048.000.000B-Budget bleiben **489.385.984B**: die geforderten
500.000.000B werden um **10.614.016B verfehlt**. Deshalb trotz erfolgreicher
Verarbeitung GesamtFAIL. `memory.max=max`, kein technisch erzwungener Cap,
kein Peakreset/Baselineabzug. PostgreSQL, PostgREST, Gateway, Node, Worker und
zugerechneter Cache liegen in derselben Cgroup; Host-Eingabeassemblierung ausserhalb.
Swap an Messpunkten0, alle gemessenen Memory-/OOM-Ereigniszaehler0.

Genau ein gebundener Original-End-RPC fuehrte500→0. Antwort, separate SQL-Zaehlung,
nativer Readback und unabhaengige Nachlesung bestaetigen beendet/aktiv0. Eigene
Unit-/Gateway-/PGRST-Prozesse sind beendet. Journal bleibt korrekt running/index1/
inFlightnull/2accounted; kein falsches500er-close und keine weitere Ausfuehrung.
Quelldatenbank mit Profil-/Store-/Raw-Dokumenthashes unveraendert; Originaldateien,
Kostenbudgets, Production und bestehende Datenbestaende unangetastet. PR969/971/972
weiter ungemergt. V8-Coverage nur im erforderlichen Eingabelauf; Leistungsphasen
ohne Profiler/Coverage. Appcode gleich zum bestehenden gruenen CI-Stand.

Unabhaengige RAM-Nachlesung bestaetigt die Rechnung. Nachlaufstatistik zeigt
viel zugerechneten Dateicache; drei erhaltene Stages belegen zusammen442.847.232B
auf Disk, unter anderem mehrfache Node-/PGRST-Kopien. **Diskbelegung ist keine
RAM-Zerlegung.** Weder genaue Peakursache noch erreichbare Einsparung sind belegt.
Keine Caches entfernt, keine Limits/Budgets geaendert, keine Reparatur/Wiederholung.

Naechster gezielter Schritt ist eine saubere Vorbereitung des fehlenden RAM-
Nachweises. Der Lebenszeitpeak dieser bestehenden Cgroup kann nicht sinken;
eine reine spaetere Codeoptimierung kann damit die Reserve nicht mehr gruen
machen. Ein moeglicher kleiner Entwurf ist eine frische lokale netzlose
Messgruppe mit vorhandenen gecachten Binaries/PG-Image, ohne Downloads, und
technisch2.048.000.000B gemeinsamem Cap (inkl.DB, ohne Swap). Bestehende DBs/
Originalquelle/Belege bleiben erhalten; keine neue Server- oder Hetzner-Einrichtung.
Dieser Entwurf wurde **nicht umgesetzt oder gestartet** und ist keine Behauptung,
dass die Reserve dann besteht. Weitere Unit oder neue Messgruppe nur nach
passender separater Freigabe. Voll500/1500, finalesLedgerAuth30, harte RAM-Abnahme
sowie echte Quellenversorgung/fachliche Abnahme vor Production bleiben offen.
