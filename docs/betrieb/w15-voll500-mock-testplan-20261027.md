# W15: Freigabeplan fuer genau einen lokalen Mockvollauf

**Stand27.10.2026: Voraussetzungen rein lesend geprueft; Plan vorgelegt,
Ausfuehrung nicht freigegeben.** Kein Container/keine Datenbank angelegt,
keine Profilaktivierung, Unit oder Leistungsmessung ausgefuehrt. W15 bleibt
der ausgewaehlte Motor; keine neue Architektur. PR969/971/972 bleiben ungemergt.

## Umfang und vorhandene Belege

Der geplante Lauf soll auf dem Entwicklungsstand aus PR972 einmal exakt500
synthetische Profile gleichzeitig aktiv halten und500 DR-Units mit1000 lokalen
Mockantworten und1500 technisch vollstaendigen Ergebnissen verarbeiten.
[Maschinenlesbarer Freigabeentwurf](belege/w15-processing-20261027/FULL500_MOCK_GO_PROPOSAL.SAFE.json).

| Voraussetzung | Bestaetigter Bestand / Grenze |
|---|---|
| Originaldaten |11Dateien/96.530.256B empfangen und hashgeprueft; weiterhin vorhanden |
| Isolierte DB-Grundlage |Dump4.981.565B, Rollen658B, Capture3170B; bereits erfolgreich restauriert |
| Kohorte |500 eindeutige Owner:330BT/120BE/50BB;501Identitaeten |
| Lokale Mockinhalte |500Owner-Mappings,7gepruefte D-Varianten und7zugeordnete R-Templates |
| Fachlicher Testbestand |Vorhandene explizit synthetische W15-Zeit-/Hashableitung; Texte/Originale erhalten |
| Vorhandene Sicherheitsbelege |12Signatur-/HTTP-/Bindungsfaelle, Vertrags-/Auswahl-/nativeDB-CI bereits gruen |
| Aktueller Funktionsbeleg |UNIT0B:55,924s,9AuthACKs maximal0,663s,3gespeicherte Resultate/34unabhaengige Nachlesen,500→0 |
| RAM-Vertrag |2.048.000.000B Limit;20% Reserve=409.600.000B; Maxverbrauch1.638.400.000B |
| Nachrechnung UNIT0B |Peak1.558.614.016B/Reserve23,8958% besteht neues Rechenkriterium; bisher kein technischer Cap |
| Lokale Ressourcen |Docker Cgroupv2/RAM-/Swaplimits; PG17.6/Node/PGRST gecacht; rund26,4GB Platz |

Belege: [UNIT0B](belege/w15-processing-20261027/UNIT0B_RESULT.SAFE.json),
[unabhaengige Nachlesung](belege/w15-processing-20261027/UNIT0B_RESULTS_INDEPENDENT.SAFE.json),
[RAM-Neubewertung](belege/w15-processing-20261027/UNIT0B_MEMORY_REASSESSMENT_V2.SAFE.json).
Der historische500MB-Fehler bleibt unveraendert. Keine erneute Uebertragung,
kein erneuter isolierter Ein-Unit-Lauf, keine pauschale CI-/Browserserie erforderlich.
Vorhandene Content-/Reviewbelege werden uebernommen; frische Ausfuehrungsrechte nicht.

## Noch notwendige, eng begrenzte Harness-Verbindungen

Der aktuelle Ein-Unit-Controller ist **kein fertiger Voll500-Runner**. Vor einer
Ausfuehrung muessen ausschliesslich diese bestehenden Testbausteine verbunden und
rein statisch/mit reinen Bindungspruefungen kontrolliert werden:

1. Frischer gemeinsamer Cap-Messrahmen samt aeusserem Abbruch-/Cleanupcontroller.
2. Alle500 Mockfixtures aus den vorhandenen7Varianten exakt auf Owner und neuen
   Selector/Run binden. D-Bodyhash und erwarteter R-Bodyhash entstehen mit den
   vorhandenen echten Konstruktoren; die tatsaechliche gespeicherte D-Provenienz
   und opake R-Freigabe entstehen weiterhin im echten Motor, nicht im Mock.
   Aktuell wird nur rows[0] gebunden; STATIC_UNBOUND-Templates allein genuegen nicht.
3. Vorhandenen sequentiellen500er-Driver/Observer/Assessor aus dem lokal erhaltenen
   W15-Handoff an den aktuellen echten HTTP-Einstieg anbinden:500Units statt
   Unit0-Assertions, jeweils genau2Calls, aktuelle Quellen/Signaturen unveraendert.
4. Per-Unit-Checkpointgrenzen, alle Authzeiten **einschliesslich interner Usage-
   Sink-CAS** und vollstaendige unabhaengige Nachlesung verbinden. Bestehende
   Full-C90s/Prepared-Open60s ebenfalls erfassen. Keine neuen fachlichen Pruefer
   oder Motorumbauten.
5.30min Materialsfenster/150s Gesamtprozess-Timeout durch explizite3h-
   Laufbindung plus30min Abschlussgrenze ersetzen. Originale Unit-/Auth-/Provider-
   Deadlines bleiben60s/30s/20s. Neuer eigener500er-GO; alten Ein-Unit-GO nicht umetikettieren.

Historische Driverdateien enthalten alte Pfade/GO-/DB-Hardcodes und werden nicht
blind ausgefuehrt oder vollstaendig uebernommen. Die bewiesene Einzelunit wird
nicht als Vorstufe wiederholt. Historische Annahmen zur Production bleiben lokale
Testannahmen; ein realer aeusserer Cleanupwaechter ist fuer diesen Lauf erforderlich.
**Planfreigabe und ein positiver Abschluss dieser Verbindungen sind Voraussetzungen
fuer den spaeteren einmaligen Start, kein bereits behauptetes Execution-ready.**

## Einmaliger Ablauf nach passender Freigabe

**1. Inaktiv vorbereiten.** Neue eindeutige Container-/DB-/Verzeichnisnamen,
neuer Run/Operation und Ed25519-Key; ausschliesslich neue Test-PG-Daten.
Originaldump/Rollen und bereits gepruefte synthetische Ableitung verwenden.
Vorhandene Originaldateien, Quellcloud und bestehende Testdatenbanken erhalten.
500D-/R-Requestbindungen vor Aktivierung fertigstellen. Offline-Fixturezusammenstellung
ist ausserhalb der Laufmessung; die echte gespeicherte vollstaendige Command-
Vorbereitung und der Motor einschliesslich Worker liegen innerhalb des Caps.
Keine aktive Anwendungsarbeit in den aeusseren Supervisor auslagern.

**2. Gemeinsames echtes Limit.** Genau ein frischer lokaler Testcontainer aus dem
gecachten PG17.6-Image, ohne Netzwerk/Ports oder alte PG-Datenmounts:
`--pull=never --network=none --restart=no --memory=2048000000 --memory-swap=2048000000`.
PostgreSQL, PostgREST, Gateway, HTTP-Driver/Mock, Node und Worker laufen in derselben
Cgroup. Binaries einmal fuer diesen Lauf bereitstellen. Vor Aktivierung Image-ID,
neue ausschliessliche Schreibziele, alle PIDs/Cgroupmitgliedschaften und Kernelwerte
`memory.max=2048000000`, `memory.swap.max=0` gegenlesen; sonst kein Start.
Kein Cache-Drop, Vorwaermen, Peakreset oder Baselineabzug. Der gesamte frische
Lebenszeitpeak einschliesslich Vorbereitung, Verarbeitung und Abschluss zaehlt.
Der aeussere Supervisor liest die Cgroupdateien direkt, ohne fortlaufend
Messprozesse in der Testcgroup zu starten. Peak ueber1.638.400.000B oder OOM beendet
sofort weitere Dispatches; das20%-Kriterium wird nicht erst bei2GB geprueft.

**3. Frisch signiert auf exakt500.** Erst nach schwerer inaktiver Vorbereitung
die tatsaechlichen Main/Auth-/Kosten-/Profil-/Quellenbelege und den Snapshot frisch
lesen. Unveraenderte <=60s-Frische und startBis-Bindungen beachten. Originales
prepare→activate vor Auth-veraendernder Commandinstallation; lokaler realer
Cleanupcontroller muss bereit und operationgebunden sein. Signierte Full-C-
Vorbereitung, echte native Source23-/KO60-Gleichheit, lokale Azure-Route
`gpt-5-mini-eu` und alle sieben Routenfelder bestaetigen. Nativ500aktiv,
500Mandate/501Identitaeten; keine zusaetzlichen Profile oder Profile im Quellbestand.
Keine alten Freigaben oder verbrauchten Operationen wiederverwenden.

**4. Genau eine Sequenz.** Echter server.js-HTTP-Einstieg: einmal `start`, danach
hoechstens499 `next` derselben permanenten Claim/Operation. Der Server waehlt
jeweils genau den naechsten Index; kein Clientprofil/Index als Ausfuehrungsrecht.
Nur nach HTTP200/ok, passender completedUnits-Zahl, dauerhaftem Final-ACK,
2accountedCalls,16Pruefpunkten und eingehaltenen Grenzen darf der naechste Request
folgen. Bei erstem Fehler, fehlender Quittung, falschem Zaehler, Reserveverletzung
oder unbekanntem Ausgang: kein Next/Retry/Resume und kein zweiter Gesamtversuch.

Mockregel wie beim erfolgreichen historischen500er-Nachweis: nur in Units0 und499
je zwei echte monotone19,9s-Verzoegerungen; die uebrigen498Units ohne kuenstliche
Wartezeit. Insgesamt exakt1000lokale Antworten(500D/500R),0echte KI-Aufrufe.
Alle HTTPS-Ziele ausser der exakt abgefangenen Dummy-Azure-Route abweisen;
kein Netzfallback. Je Antwort echte gespeicherte Sendclaim-/Kostenreservierung
und exakter Senderbody pruefen. Keine Securityattrappen oder erfundenen R-Receipts.

**5.0 und unabhaengig nachlesen.** Nach dem letzten ACK ebenso wie bei Fehler
eigene Dispatchprozesse beenden/Exit pruefen, gebundenen Original-End-RPC aufrufen,
SQL-Nullzaehlung plus native Lesung pruefen. Profile0 unabhaengig bestaetigen.
Danach alle1500tatsaechlichen Resultate in separatem nur lesendem Auditorprozess
im gedeckelten Testcontainer pruefen; begrenzt pro Unit lesen statt500volle
Evidenceobjekte im Speicher sammeln. Quelle/Businessfelder/Identitaeten vergleichen.
Belege behalten, nichts loeschen. Abschluss-Peak/Cgroupereignisse noch einmal lesen.

Der aeussere Controller bleibt ausserhalb des Caps handlungsfaehig. Faellt PG
selbst aus, ist DB-aktiv0 zunaechst **UNKNOWN**. Als ausdruecklicher Cleanupteil
ist genau ein kontrollierter Wiederanlauf ausschliesslich von PG mit derselben
neuen persistenten Test-PGDATA und gleichem Cap vorzusehen: keine App/PGRST/Gateway,
kein Dispatch, keine Unitwiederholung. Wurde noch kein Endwrite versucht, dann
gebundener End-RPC und Nullnachweis; nach bereits unbekanntem Endwrite nur
Gegenlesung, kein blinder Write-Retry. Nicht bestaetigtes0 bedeutet GesamtFAIL/
UNKNOWN und manuellen gebundenen Rueckweg, niemals einen erfundenen Nullnachweis.
Ein Containerneustart kann die Cgroup und ihren Lebenszeitpeak neu erzeugen.
Der aeussere Supervisor muss urspruengliche Peak-/Ereigniswerte sichern;
Recoverywerte ersetzen sie nicht. Fehlende finale Ursprungswerte bleiben UNKNOWN,
und der Recoverypfad wird kein PASS. PG-only-Neustart in fortlebender Cgroup
vermeidet diesen Wechsel, ist bei vollstaendigem Containerende aber nicht garantiert.
Dieser Recovery-/Abbruchweg muss vor Aktivierung konkret im Controller stehen.

## Mess- und Abnahmematrix

| Merkmal | Fuer diesen einen Lauf erforderlicher Beleg |
|---|---|
| Profilzahl |Nativ exakt500 aktiv bei Start und jeUnit, letzter Aktivbestand500, danach0;330/120/50 |
| Vollstaendigkeit |500entered/500FinalACK/500Outputs/1000accounted; Index500,stateclosed,inFlightnull |
| Ergebnisse |Exakt1500eindeutige echte Zeilen, proOwner Mandatsbriefing/Morgenbriefing/Lage; kein missing/empty/duplicate/invalid |
| Vorbereitung |Full-C/offline <90s; alle500Prepared-Scopes/Open <60s; innerhalb desselben einen Laufs |
| Unit60 |Alle500 Zeiten unmittelbar vor J.enter bis ACK der J.finish-Mutation <60s; keine Mittelwerte als Abnahme |
| Auth30 |Saemtliche Mutationen inkl.Queue/Read/Callback/WriteACK <30s;500eindeutige Finish-ACKs; besonders Unit499/gewachsener Bestand |
| Kontrollzahl |JeUnit genau16im Unitintervall:10load+6admission, insgesamt8000; keine Entry-/Vorbereitungspruefungen hinzurechnen |
| Speicher |Kernelcap2.048.000.000B/Swap0; gemeinsamer Peak <=1.638.400.000B, Reserve >=409.600.000B; OOM/Ungeklaert kein PASS |
| Nachlesung |Alle500Evidence-/Journalhashes und1500volle Zeilen; Nutzer/Slot/Tag/Fenster/hash, Morgenbindung, D/R-Provenienz und2accountedIntents |
| Sicheres Ende |NativeAntwort +SQL-Zaehler +separate native/unabhaengige Lesung beendet/aktiv0; Ursprung unveraendert |

Auth wird nicht als genau500Mutationen fehlgezaehlt: historisch4000Runtime-CAS
plus Installation wurden im Exportwrapper beobachtet. **Dies ist kein Beleg
aller internen CAS.** `storage.recordLlmUsage` ruft den lexikalischen
`mutateAuthStore` direkt auf und wird vom Exportwrapper nicht automatisch erfasst
(storage.js807/1991). Fuer diesen Pfad muss zusaetzlich die echte Usage-Sink-
Gesamtzeit als konservative obere Schranke der internen Mutation erfasst werden,
mit positivem originalem `_ablage.blob`-ACK; auch diese Schranke muss <30s sein.
Alle tatsaechlichen Auth-CAS muessen einer vollstaendigen Mutationsmessung oder
solcher quittierten oberen Schranke zugeordnet sein; eine beobachtende Zaehler-
Abstimmung am bestehenden CAS-Schreiber darf keine unzugeordnete Schreibung
uebersehen. Keine Geschaefts-/CAS-/Fristlogik aendern. Erwartet sind zudem1000
bestaetigte Usage-Speicherungen; nicht blind4000 als Gesamtzahl aller CAS annehmen.
Mindestens
500unterschiedliche persistente Unit-FinalACKs muessen zuordenbar sein. Erhaltene
5000Usagezeilen wachsen lokal um1000simulierte Calls; keine Historie abschneiden.
Der Auditor muss mehr als1000Resultate vollstaendig erfassen: begrenzte nativeSQL-
Nachlesung oder Pagination, keinen PostgREST1000-Rowdeckel als1500ausgeben.

Die8000Kontrollen sind16echte Sicherheitspruefpunkte jeUnit, keine16neuen Tests:

| Nr. | Art | Bestehender Pfad |
|---:|---|---|
|1|load|Adapter: Review-Storagevertrag auswaehlen|
|2|load|Review-Storagevertrag: Context laden|
|3|admission|Review-Storagevertrag: Context zulassen|
|4|load|D-beforeSend: Command laden|
|5|admission|D-beforeSend: zulassen|
|6|load|R: Storagevertrag auswaehlen|
|7|load|R: Context laden|
|8|admission|R: Context zulassen|
|9|load|Immutable-D.store: Storage auswaehlen|
|10|load|Immutable-D.store: Context laden|
|11|admission|Immutable-D.store: zulassen|
|12|load|Immutable-D.read: Storage auswaehlen|
|13|load|Immutable-D.read: Context laden|
|14|admission|Immutable-D.read: zulassen|
|15|load|R-beforeSend: Command laden|
|16|admission|R-beforeSend: zulassen|

Jedes load bindet neu per Nonce/native Zeilenidentitaet/Sourcepins/Signatur/
Expiry/Target. Jede admission liest erneut nativ, verbraucht ein opakes einmaliges
Proof und prueft Plan/Zeit/Commit/Gates. Weitere echte Profil-/Aktiv500-/Quellen-/
Journal-/Kosten-/Sender-/Speicherschutzpruefungen bleiben erhalten. Vor J.enter
liegende Entry-/Load-/Admissionpunkte zaehlen nicht zu8000. Der vorhandene **historische Observer** (`observe-app.js`) zeichnet
startCheckpointCount unmittelbar vor Eintritt und endCheckpointCount beim echten
finalen ACK auf. Diese Anbindung fehlt im aktuellen Einzelharness noch; sie ist
vor dem Vollauf umzusetzen. Erst diesen Ausschnitt abnehmen.

## Zeitfenster und Freigabeumfang

Historisch bereits belegt: Unit-CSV-Summe2h07m08s; Runtime-Prozess2h14m03,674s;
Gesamtworkflow inkl.Aufbau rund2h15m18s. Diese Werte stammen aus dem gepinnten
lokalen Handoff; sie sind weder neue Messung noch Garantie fuer den aktuellen
Lauf. Die exakte Summe der500HTTPzeiten ist daraus nicht belegt.

Vorgeschlagen: einmal festes3h-Aktivfenster plus maximal30min fuer sichere
Rueckfuehrung/Abschluss. Rund45min Planungspuffer zum historischen Workflow,
unveraendert unter den vorhandenen9h des EU-Vertrags. Keine Fristverlaengerung
im Lauf. Vollstaendige3h30 muessen vor UTC- **und** Berliner Tagesgrenze passen;
sonst kein Start/Aktivierung an diesem Tag. Belege muessen innerhalb der bis31.10.
gebundenen Auftrags-/Preisregeln liegen. Startzeit und Ende nach frischen realen
Uhren festschreiben; weder Uhr noch historische Freigaben manipulieren.

Die erbetene **Planfreigabe** umfasst die oben benannten engen Harnessverbindungen
und danach genau diesen einen lokalen Mockvollauf, erst wenn alle Vorbedingungen
und der statische Review positiv sind. Sie umfasst einen frischen lokalen
Testcontainer/DB samt Cap und den beschriebenen Cleanup-only-Rueckweg; keine
neuen Server, Hetzner-, Production-, Budget-, Merge- oder echten Modellaktionen.
Kein zusaetzlicher erfolgreicher Ein-Unit-Lauf als Voraussetzung. Fehler/UNKNOWN
beendet diese eine Sequenz; ein zweiter Versuch braucht neues GO.

## Lokaler Mocknachweis und spaetere Production

Ein erfolgreicher Abschluss belegt nur den lokalen synthetischen Mocknachweis
auf dem gepinnten Entwicklungsstand: Verarbeitung/Bindungen/Persistenz/Zeiten/
gemeinsames RAM im definierten Cloud-Testcontainer. Er nutzt die bereits
vorhandenen7Dokumente/6KOs; neue Understanding-/Quellenbeschaffung wird dabei
nicht ausgefuehrt. Drei gespeicherte Ergebnissichten jeProfil bedeuten keine
drei unabhaengigen Modelltexte. Kein Production500-PASS.

Spaetere Production braucht eigene ausdrueckliche Freigabe und frische Belege
fuer den tatsaechlich freigegebenen/deployten Release, echte Quellenversorgung,
Provider-/Netz-/SKU-/Preis-/Budgetbindung, reale Modellantworten/fachliche Abnahme,
Production-Ressourcen und echten Endwaechter/Rueckweg. Lokale Dummy-Deployments,
Mockzeiten oder synthetische Nachrichten werden nicht dafuer ausgegeben.
