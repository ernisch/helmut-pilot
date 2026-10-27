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

Naechste kleinste Korrektur ist ausschliesslich der fehlende lokale
`AZURE_OPENAI_DEPLOYMENT`-Wert entsprechend dem signierten Modell, gefolgt vom
vollstaendigen aufgeloesten Routentupelvergleich. **Noch nicht umgesetzt**,
weil nach dem ersten Fehler gestoppt wurde. Ein erneuter einzelner Funktionslauf
braucht ein **neues separates GO**, neue DB/Operation/Signaturen und denselben
Rueckweg auf0. Keine Wiederverwendung dieser Operation. Voll500/1500, voll
gewachsenes Authledger, technisch erzwungene gemeinsame RAM-Grenze und echte
Quellenversorgung vor Production bleiben offen. PR969/971/972 ungemergt.
