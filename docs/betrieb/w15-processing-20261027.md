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

## Gemessener Umfang

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

## Genau naechster Schritt und Freigabegrenze

Die noch ausstehende echte Unit60 benoetigt laut unveraendertem Motor500 aktive
Profile. Die bisher ausdruecklich gesperrte Profilaktivierung ist nicht durch
die neue Priorisierung stillschweigend freigegeben.

Der [inerte Freigabeentwurf](belege/w15-processing-20261027/UNIT0_GO_PROPOSAL.SAFE.json)
beschreibt nur eine neue isolierte Testdatenbank im vorhandenen Container:
500synthetische Profile voruebergehend aktivieren, genau eine DR-Unit0/BB001
mit zwei lokalen19,9s-KI-Simulationen ausfuehren, echte Unit60/Auth30 messen und
gebunden auf0 beenden. Kein `next`, keine Schleife, kein500erDurchlauf, kein
externer Anbieter und keine Production. Der Original-SQL-Startgenerator braucht
keinen neuen Scheduler; rein lesend keine zusaetzlichen end500-/Profiltrigger
im Originalrestore gefunden. Keine Behauptung eines Production-Endwaechters.

Dafuer neue Operation, frische Signaturen und Main/Auth-/Kosten-/Startbelege
erzeugen. Die verbrauchte Operation und abgelaufene Startbindung sind unbrauchbar.
Originale Vorbereitung/Aktivierung muessen vor der Auth-veraendernden
Commandinstallation und innerhalb der bestehenden Frischegrenzen erfolgen.
Erst separate ausdrueckliche Freigabe fuer diese isolierte Aktivierung plus
eine Unit einholen; die bereits gruene Daten-/Vertragspruefung uebernehmen.
