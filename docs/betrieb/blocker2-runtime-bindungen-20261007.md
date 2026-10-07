# Blocker 2: Runtime-Nachweis und Eingabeabhaengigkeiten

Stand: 07.10.2026. Ausschliesslich Blocker 2; keine Production-Datenaenderung,
kein kostenpflichtiger Helmut-Production-Modellaufruf und kein 500er Start.

## Beobachteter Production-Stand

PR845 wurde mit dem freigegebenen Kopf
`9416c041eaddb553462856d10bf058b7092b687c` als
`a85834c600a10f4fd324ae21488ed22dc44da39f` gemergt. Das reguläre Deployment war
READY. Der separat gemergte Nachfolger PR846 steht auf
`5cada0342b3c2218b9dd2f8ac50bdf1ee57db63a`, dessen unmittelbarer Elterncommit
der PR845-Merge ist. Production-Deployment `dpl_P4Ue8vNRWR3Mz7ZCJFYsTeLv5QTU`
ist READY. Der Betreiber hat nach Klaerung dieses Nachfolgers die Fortsetzung
von Blocker 2 autorisiert. Daraus folgt keine Daten- oder neue Mergefreigabe.

Die Abschlussaufnahme vom07.10.13:19 UTC zeigt den separat gemergten PR847-
Nachfolger `53e1e369696fc52b69a5378f749a47cfa607ea2b`, unmittelbar auf `5cada034`
aufbauend. Production-Deployment `dpl_CoPUDLjaD8NKRNTRMvDyeycFVpsD` ist READY und
dem Alias zugeordnet. Auch an diesem Nachfolger sind die drei DIP-/Identitaets-
dateien bytegleich. Alle52 geschuetzten Datenrelationen samt Vollzeilen und xmin
sowie der Kataloghash sind seit12:33 UTC unveraendert. Der Nachweis deckt dieses
beobachtete Intervall ab; er behauptet keine neue Laufzeitprobe.

Die drei DIP-/Identitaetsdateien sind am Nachfolger bytegleich zum freigegebenen
Kopf. Deployment-/Git-Bindung ersetzt keine direkt ausgefuehrte Laufzeitprobe.
Der Git-Deployment-Dateibaum ist ueber den vorhandenen Vercel-Leseweg nicht
verfuegbar; die direkten Dateiabfragen liefern keinen Source-Inhalt. Der bisherige
Provider-Witness besitzt eine abgelaufene besondere Freigabe und ist kein
allgemeiner DIP-Pruefzugang. Kein Secret wurde fuer einen Ersatzweg beschafft.

## Begrenzter Code-Nachweis

Der neue `GET /api/release/dip-resolver` fuehrt neun feste synthetische Proben
mit den wirklichen DIP-/Identitaets-/Resolverfunktionen aus. Er prueft den
V1-Leser, vollstaendige V2-Bezuege, disjunkte Bezugsmengen, fehlenden positiven
Identitaetskurzschluss, echte Folgemeldungen, Jahreszahlen, manipulierte Metadaten
und die Ablehnung eines sachfremden Haushaltsbestands durch `resolveVorgang`.
Der Resolver erhaelt ausschliesslich feste in-memory Lesedependencies.

Der Pfad liegt vor jedem Account-/Session-/Profil-Vorlauf. Er ist bewusst
oeffentlich und liefert ausschliesslich Codehashes, feste boolesche Gegenproben,
Production-Commit und Deployment-ID. Er akzeptiert keine Quellen, Profile oder
anderen Nutzdaten. Nur GET ohne Query ist erlaubt. Der Header
`x-helmut-production-commit` muss dem wirklichen aktuellen Production-Commit
entsprechen. Preview, fehlende Runtimeidentitaet, Drift, eine fehlgeschlagene
Gegenprobe oder nicht lesbare Modulbytes liefern keinen positiven Nachweis.
Keine Datenbank-, Account-, Modell-, Netzwerk- oder Budgetfunktion wird aufgerufen.

Die Antwort traegt ausdruecklich `syntheticFixturesOnly=true`,
`productionSourceVersionsInspected=false` und `all500InputAcceptance=false`.
Sie ist keine fachliche Abnahme oder Beleg dafuer, dass vorbereitete V2-Quellen
bereits gespeichert wurden. Nach einem gesondert freigegebenen Merge muss der
Operator den dann tatsaechlichen neuen Production-Commit binden, die Codehashes
mit diesem Commit vergleichen und die neun Ergebnisse am Production-Pfad lesen.
Die neue Probe wurde bisher nur lokal ausgefuehrt, nicht in Production.

Die beim neuen Fenster erstmals einzubeziehende Berliner Recyclingpapiermeldung
wurde faelschlich mit Nobelpreis-Meldungen verbunden. Die Entscheidungsspur
zaehlte Berlin, das Jahr und allgemeine Auszeichnungswoerter. Die neue begrenzte
Regel entzieht dem gemeinsamen Landesort den Titel-/Sachbeleg, ausschliesslich
bei zwei kanonisch validierten Berliner Artikelstaenden. Originalanker und
Suchwurzeln bleiben erhalten; kein anderer Land-/Medienpfad wird umgestellt.
Ungueltige Staende werden laut abgewiesen. Gegenproben erhalten echte Nobelpreis-
Folgemeldungen und dokumentieren die Ablehnung im wirklichen Resolver.

## Neue endliche Resolver- und Profilbindung

Die bestehenden Originalquellen und die bereits belegte 43er-DIP-Recherche
wurden wiederverwendet. Fuer die 47 vorbereiteten Cluster wurden nun die
vollstaendigen Prefix-Treffermengen, die Acht-Treffer-Fenster und Exaktkennungen
gelesen: 1561 verschiedene Prefixkandidaten, daraus 92 vom Resolver gelesene
KO60-Versionen, 186 SOURCE23-Versionen und 225 Links. Alle 19 Originalsegmente
sind READ ONLY und jeweils unter 100 kB. Es gibt keinen Grenzzeitgleichstand
und keinen ausgewaehlten KO mit mehr als 40 Links.

Die 47 vorbereiteten Entscheidungen sind `neu`. Fuer alle 47 Kennungen sind
Exakt-KO, Reservierung und Vormerkung als Abwesenheit gebunden. Das ist keine
Freigabe, alle 47 zu erzeugen: notwendige fachliche Auswahl und Eligibility
bleiben getrennt. Das alte unbekannte Bundespolizeigesetz-U wurde weder neu
gestartet noch seine Reserve freigegeben.

Die Nachkontrolle am 07.10.12:54 UTC bestaetigt alle 92 KO- und 186 Quellenwerte
samt xmin sowie alle 225 Links unveraendert. Eine weitere Prefixaufnahme bestaetigt
alle vollstaendigen Prefixlisten unveraendert. Getrennte Aufnahmen behaupten
keine atomare native W-Abnahme oder zukuenftige Frische.

Alle 500 Profile wurden einzeln gegen ihre Originalprofilhashes und
Paketentscheidungen gebunden: 330 BT, 120 BE, 50 BB. Die private Datei
`all500-dependency-bindings.json` bindet Originale, Resolverentscheidungen,
Zustands-/Driftbelege und vorbereitete Quellenversionen ueber Dateihashes.
SHA256: `00d903efceea62e19d2074a1ac926aaa65e91f66c7a68c55bab4c4c8abc7c2ee`.
Scopekompatibilitaet wird nicht als notwendige Auswahl oder Zustaendigkeit
ausgegeben. Kein inaktives Profil wurde als aktives Motorprofil umgeschrieben.
`briefingEingabe`, `briefingDatum` und deren angenommene Quellen bleiben ehrlich
ungebunden. Positive notwendige KO-/Briefingeingabeabnahmen: 0/500.

Fuer das neue explizite Planfenster am07.10.13:01 UTC wurden die71 bereits
gebundenen Quellen mit bekannter Ebene neu zeitlich abgeleitet, ohne Abruf oder
Importwiederholung.58 sind strukturell zugelassen:44 BT,12 BE,2 BB. Zwei Berliner
Meldungen vom06.10. kommen hinzu; die BB-Schulnetzwerkmeldung vom23.09. ist jetzt
ausserhalb des ganzen tagesgenauen Fensters. Diese bekannte Teilmenge belegt
keine notwendige Gesamtversorgung und ersetzt keine Scopeentscheidung der
weiteren historischen917 Kandidaten.

Mit der vorbereiteten Berliner Regel enthalten die58 Versionen48 verlustfrei
gebundene Cluster.46 Originalcluster aus der bisherigen Aufnahme werden
wiederverwendet; Recyclingpapier und Frauen-/Kinderschutzhaus erhalten getrennte
Bestandsaufnahmen. Insgesamt97 KO60-Versionen,193 SOURCE23-Versionen und232 Links
tragen die neue48er Resolvervorbereitung. Alle48 Entscheidungen sind `neu`,
alle48 Exakt-/Reservierungs-/Vormerkungszustaende sind als Abwesenheit belegt.
Alle500 Profilzeilen wurden auf diese48 Entscheidungen neu gebunden; keine
Quellen-/KO-/Eligibility- oder Briefingabnahme wird daraus erfunden.

## Neu geschlossene Brandenburger Originaltextluecke

Die aktuelle Wochenmeldung50253 war bisher nur mit ihrem ersten Datumsabsatz
verfuegbar. Ihr vollstaendiger Artikel wurde am07.10.13:01 UTC einmal gelesen;
Titel, Publikationstag und Volltexthash stimmen exakt mit dem bereits
gespeicherten Stand ueberein. Kein Wiederimport oder neuer Stand wurde erzeugt.
Zwei ganze Originalabsaetze belegen die20. oeffentliche Sitzung des Wirtschafts-,
Energie- und Klimaausschusses sowie die17. oeffentliche Sitzung des Infrastruktur-
und Landesplanungsausschusses mit Fachgespraech zur Niederbarnimer Eisenbahn.

Der bestehende manuelle Artikelkontextvertrag bindet beide Absaetze getrennt an
die unveraenderte SOURCE23-Version und an jeweils einen vollstaendigen lokalen
Verstehensprompt. Kein kombinierter Mehrfachkontext oder ausfuehrbarer Modell-
Command wird behauptet. Datums-/Uhrzeitbloecke wurden nicht in einen einzelnen
Absatz hineinkopiert; keine tatsaechlich abgehaltene Sitzung wird aus einer
Ankuendigung abgeleitet. Publikations- und erster Absatzstand bleiben erhalten.
Alle50 BB-Profile bleiben einzeln erfasst;25 besitzen einen direkten deklarierten
Energie-/Verkehrsthemenbezug zu diesen Kandidaten. Das ist keine Ausschuss-
mitgliedschaft, kein notwendiger KO-Bestand und kein positiver Briefingnachweis.

## Externe Grenzen und naechster konkreter Schritt

Die direkte Production-Codeprobe benoetigt einen gesondert freigegebenen Merge
dieses begrenzten Nachweispfads. Die 43 vorbereiteten DIP-Metadatenversionen
benoetigen vor jeder Anwendung eine konkrete Datenfreigabe, frische CAS-/Original-
und Betriebsschutzbindungen sowie vollstaendiges Ruecklesen. Sie wurden weiterhin
nicht geschrieben. Notwendige neue KO-Versionen und wirkliche Briefingeingaben
duerfen nicht aus alten Zusammenfassungen oder Offlinefixtures erfunden werden.
Aus dem 47er Resolverbefund folgt keine Modellfreigabe; Kostenplanung bleibt
bei Blocker 3. Aktivierung und 500er Test bleiben ausserhalb dieses Auftrags.

Die Originalsicherung, Vorbereitung und diese PR sind die reviewbaren Ergebnisse;
die vollstaendige Blocker-2-Abnahme bleibt offen. Kein autonomer Merge oder
Production-Rueckweg ist autorisiert.


## Fortsetzung nach der exakt freigegebenen Siebenerkorrektur

Die bisherigen Abschnitte dokumentieren die Vorbereitung vor PR850. Die Codeprobe
ist seit dessen Deployment erfolgreich; neun feste Gegenproben und die unveraenderten
Modulhashes wurden mit der tatsaechlichen Production-Identitaet gelesen. Der am
07.10. gelesene READY-Stand `fcd7de564e9c6814a9a65ce5019f3f979bf81043`
baut auf dem PR850-Merge `a0b3e817` auf; DIP-, Resolver- und Briefingleserdateien
sind gegenueber diesem Merge bytegleich.

Genau die sieben Datensaetze der expliziten Freigabe wurden mit der unveraenderten
Transaktion SHA256 `6aafec149eadffd63bd1b780eaf972579d1cead882e3afd85c7e2262cd4dcd58`
atomar korrigiert. Unmittelbare native Nachkontrollen und ein unabhaengiger Pro-High
Pruefer bestaetigten die sieben Metadatenobjekte, alle uebrigen Zeilenfelder,
31.131 unangetastete Quelldatensaetze und51 weitere Relationen. Die anderen36
vorbereiteten DIP-Korrekturen wurden nicht angewendet. Die Datenfreigabe ist damit
erfuellt; daraus entsteht keine weitere Schreib-, Modell- oder Mergefreigabe.

Alle500 Profil-/Paketbindungen wurden auf die tatsaechlichen neuen Quellenstaende
und48 Resolverkandidaten neu gebunden. Das ausdrueckliche Fenster16:57:55UTC
enthaelt935 strukturell zulaessige Quellen aus989 Originalversionen. Bestehende
Quellenpruefungen wurden weiterverwendet; alte Vorbereitungswerte gelten nicht als
geschriebene SOURCE23-Versionen. Die erste fachliche Auswahl umfasst198 Kandidaten,
ist vorlaeufig und hat keine Vollstaendigkeitsabnahme. Die Grenze von fuenf
Themen je Profilgruppe ist keine notwendige Auswahlgrenze.

Der neue native RO-Abgleich der gesamten989 Quellenkennungen fand82 verknuepfte
Quellen, davon79 mit `understanding_status=complete` und nicht-pending KO. Alle72
zugehoerigen KO60-Versionen wurden vollstaendig gelesen und gegen ihre zuvor
erfassten nativen Hashes/xmin geprueft. Linkvorhandensein ist kein semantischer
Identitaets-, notwendiger Auswahl- oder Briefingbeleg. Aus einem fehlenden Link
folgt auch keine globale Abwesenheit eines verwandten Wissensobjekts. Alle500
Profile bleiben einzeln erfasst; die notwendige Eingabeabnahme bleibt **0/500**.

Neu notwendige Originaltextpruefungen belegen Bundesakteure bei der Drohnenerkennung
am BER und Brandenburgs Gesundheitsminister beim Aerztemangel. Die Preisberichte
betreffen beide Laender; der amtliche Statistiktext berichtet vorlaeufige
Septemberzahlen, waehrend seine Open-Graph-Vorschau irrtuemlich Juni nennt. Diese
Vorschau wird nicht als Septemberbeleg uebernommen. Abweichende Sekundenwerte,
widerspruechliche Datumsversionen und die spaeter aktualisierte Streikseite bleiben
offen; es wurde nichts automatisch korrigiert. Beim Brandenburger Besoldungsbericht
sind Artikeladresse und Publikationszeit identisch, aber der gespeicherte
Originalkontext fehlt. Ausschusszustimmung zu einem Entwurf ist kein endgueltiger
Landtagsbeschluss. Die privaten Vollbelege bleiben ausserhalb von Git.

## Eng begrenzter Nurleser fuer die neue inaktive Synthetikkohorte

Der Cron-geschuetzte GET `briefing-nachweis?modus=eingabe` akzeptierte bisher nur
die alte495er Testkohorte oder den vorhandenen Einzelbeleg. Er wies saemtliche
neuen500 Synthetikkennungen vor dem Profilabruf zurueck. Die vorbereitete Korrektur
erweitert ausschliesslich diesen Nurleser auf die geschlossenen500 Kennungen
und die unveraenderten Generatorvarianten. Vor dem Build muss das vollstaendige
Profil-DTO dem kanonischen Generator/Import entsprechen; nur `updatedAt` ist
fluechtig. Eigene Marker oder Hashes reichen nicht. Aktive, reale, manipulierte
oder fremde Profile werden abgewiesen. Ein zweites Profillesen erhaelt die
bestehende Driftsperre. Cron-Authentisierung, Motor, Aktivierung, Kosten und der
separate Nachweisweg fuer die aktive500er Kohorte bleiben unveraendert.

Die Zielpruefung deckt alle500 Generatorprofile (330BT/120BE/50BB), Kontrastfaelle,
Kennungsgrenzen,19 Profilmanipulationen und die bestehenden Alt-/Einzelbelege ab.
Ein zusaetzlicher privater lokaler Aufnahmetest nimmt alle500 tatsaechlich
gespeicherten Profil-DTOs an; dessen Build ist ausdruecklich gemockt. Er ist keine
Production-Aufnahme und kein Nachweis vorhandener notwendiger Briefingeingaben.
Der Leser liefert weiterhin `fachlicheFreigabe=false` und fuer neue Synthetik
`all500InputAcceptance=false`. Diese Korrektur benoetigt einen eigenen konkret
freigegebenen Merge vor ihrer Production-Nachkontrolle. Bis dahin bleibt der
technische Production-Aufnahmeschritt gesperrt; fachliche Quellen-/KO-Auswahl
und Eingabeabnahme bleiben offen. Keine weiteren Datenaenderungen, Aktivierung
oder kostenpflichtigen Helmut-Production-Modellaufrufe wurden ausgefuehrt.


## PR853 Production und gesonderter GitHub-Nurleser

Der konkret freigegebene Kopf `cbade2f4359f782e92671d103d616771c11f1281`
ist mit `f216ad0d7fdbcf74fc89189d7464a05a4e225d11` gemergt. Production ist
READY (`dpl_E3xKXjXDyDANsKUscVYR3GzzqsNG`); der oeffentliche technische
Runtimebeleg bestaetigt genau diesen Commit. Der Leser ist bytegleich zum
freigegebenen Kopf enthalten. Alle52 nativen Vor-/Nachvergleichstabellen,
einschliesslich Profil- und Modellnutzungsdaten, sind unveraendert.
Alle500 Profile wurden erneut einzeln gelesen und mit Original-xmin,
Namen sowie den bereits gebundenen Profil-/Pakethashes verglichen: alle inaktiv.

Die tatsächliche authentisierte Eingabeaufnahme bleibt **0/500**. Der Cloud
fehlt das Cron-Zugangsgeheimnis; Vercel gibt den als `sensitive` geschuetzten
Wert nicht heraus. Ein einzelner unauthentisierter GET liefert403 und ist keine
Eingabeaufnahme. Die500 Profile sind einzeln mit dieser gemeinsamen technischen
Zugangssperre erfasst. Daraus folgt weder fehlender noch leerer oder falscher
Inhalt; diese Inhaltsklassen bleiben ohne authentischen Abruf unbestimmbar.
Die neuen Production-Positiv-/Negativgegenproben bleiben wegen dieser Sperre offen.
Bestehende495/Cem-Ausnahmen wurden nicht veraendert; der neue Collector waehlt
streng nur die geschlossenen500 Synthetikkennungen.

Der Betreiber hat einen gesonderten Nurlese-Workflow mit dem bestehenden GitHub
Secret `HELMUT_CRON_SECRET` gewaehlt. Der vorbereitete Workflow startet nur
manuell auf `main`, hat keine Aktivierungs-, Datenbank-, Modell- oder Teststart-
Funktion und liest ausschliesslich `modus=eingabe`. Er bindet den erwarteten
Production-Commit und Berliner Tag, prueft die Runtimeidentitaet vorher/nachher
und stoppt bei Zugangs-/Profil-/Commit-/Schreib-/Modellwiderspruch oder Tagesdrift.
Andere technische/unbrauchbare Antworten werden getrennt von leeren Eingaben
aufbewahrt; nach Stop nicht abgerufene Profile bleiben ausdruecklich unerfasst.

Jede vollstaendige Antwort samt unveraendertem Antworttext und SHA256 geht
allein in einen RSA3072/AES256-GCM/gzip-verschluesselten Betreiberbeleg. Der
bestehende Transport bindet Actions-Lauf, Workflowcommit, Tag und Profilposition;
die enthaltene Productionbindung wird getrennt geprueft. Der Empfaengerfingerprint ist im Collector fest gebunden; ein fremder
Empfaenger wird vor dem ersten Abruf abgewiesen. Der Privatschluessel
bleibt beim Betreiber. Actions-Logs enthalten nur feste Gesamtwerte, Artefakte
nur verschluesselte JSON-Dateien (ein Tag Aufbewahrung). Verschluesselung ersetzt
keinen Herkunftsnachweis: Actions-Lauf/Commit/Artefakt sind vor der Entschluesselung
abzugleichen. Lokal sind alle500 geschlossenen Kennungen, Fehlerklassen,
Schutzstopps und der Transport geprueft. Das ist keine Production-Abnahme.
Ein eigener konkreter Merge ist erforderlich; der Workflow wurde nicht gestartet.
Die Freigabe fuer PR853 erlaubt keinen weiteren Merge oder Production-Dateneingriff.
