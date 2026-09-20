# Quellenzeitvertrag im Reparatursprint

Aktueller Folgesprint20.09.2026: Einlesepfade erfinden teilweise Publikationsdaten; Ursache, Korrektur und Abnahme stehen im letzten Abschnitt. Die folgenden Abschnitte beschreiben den historischen Stand17.09.; damalige Freigabegrenzen sind keine neue Sperre des ausdruecklich autorisierten Mehrsprintauftrags.

## Umfang und Ausgangspunkt

Basis `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`, Branch `codex/quellen-zeitvertrag-20260917`. Der konkrete Reparaturcommit wird im zugehoerigen ungemergten PR und im Abschlussbericht belegt.

Der vorherige lokale Branch `codex/motor-reparatur-20260916` hatte 40 geaenderte und 15 neue Dateien, aber keinen neuen Commit. Seine Arbeitskopie bleibt erhalten. Die dort vorbereitete Trennung der Quellenfelder wurde fuer diesen kleinen Sprint gezielt fortgesetzt. Die alte automatische Zuordnung relativer Jahresformulierungen wird nicht unveraendert uebernommen: Ein Zitat oder historischer Rueckblick kann einen anderen Zeitanker haben. Eine Wortliste ist kein semantischer Faktenrichter.

Uebernahme bis 10:04 Tuerkei / 09:04 Berlin / 07:04 UTC:

* GitHub Main unveraendert; kein entfernter Branch mit Motorreparatur und kein neuer Reparatur PR. Nur historischer Draft345 offen.
* Keine laufenden Actions. Die zwei wartenden CI Laeufe 31128435980 und 31126446647 stammen vom 06.08. und gehoeren zu anderen alten Branches. Keine Aenderung an diesen Laeufen.
* Juengster abgeschlossener Lauf 35089430502 ist das Testende vom 16.09., kein Reparaturfortschritt.
* Vercel Production `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy` READY; keine neuen Deployments am 17.09. im geprueften Zeitraum. Fuer 09:58 bis 10:04 Tuerkei / 08:58 bis 09:04 Berlin / 06:58 bis 07:04 UTC keine Runtime Logs gefunden. Das ist kein Beweis fuer vollstaendig ruhende globale Quellenarbeit.
* Testbegleitung und Testende Automationen pausiert. Eine alte Aufgabe fuer ein anderes Testprojekt hat keinen naechsten Lauf und wurde zuletzt am 28.08. ausgefuehrt; keine aktuelle Konkurrenz gefunden. Keine Automationsaenderung.
* Kein alter lokaler Arbeitsprozess sichtbar. Der Betreiber hat den alten Work Lauf vor Uebernahme gestoppt; ein globaler Sitzungsstatus ist nicht abfragbar.

## Belegte Ursache und kleinste Korrektur

1. `buildUnderstandingPrompt` setzte Titel, Auszug, Herausgeber und Publikationsdatum in eine einzelne Textzeile. Es fehlte ein ausdruecklicher Vertrag zur Unterscheidung zwischen berichtender Quelle, handelndem Akteur und Ereignisdatum. Die im Test dokumentierten Zuschreibungs und Zeitprobleme werden dadurch beguenstigt; ein monokausaler Beweis fuer jede Modellantwort folgt daraus nicht.
2. `lage-quellenbeleg.datum` normalisierte jede mit `Date.parse` lesbare Angabe nach UTC. Beispiel: `2025-12-31T23:30:00-03:00` wird `2026-01-01T02:30:00.000Z`. Der Zeitstempel ist richtig, aber das urspruengliche Quellenjahr war danach nicht mehr verfuegbar. Zudem akzeptiert `Date.parse` den unmoeglichen 30. Februar durch Verschiebung in den Maerz.
3. Der erhaltene Benchmarkfall C09 enthaelt eine Quelle vom 14.09.2026 mit der Formulierung "im vergangenen Jahr". Das belegt den Bedarf, Quellenjahr und heutiges Briefingjahr getrennt zu halten. Der Test nutzt nur den vorhandenen kurzen Ausschnitt und das Publikationsmetadatum. Kein Abruf und kein Ersatz fuer den unbekannten Benchmarkversuch30.

Die neue reine Hilfsdatei `quellen-zeitvertrag.js` gibt explizite Felder fuer Text und Metadaten aus. Titel und Auszug bleiben erhalten. Nur die schon ausgewaehlten maximal zwoelf Dokumente erreichen Understanding; Volltexte und beliebige Objektfelder werden nicht hinzugefuegt. Publikationsangaben muessen gueltige ISO Kalenderdaten sein. Fehlende oder ungueltige Angaben bekommen keinen Ersatz aus URL, Abruf oder Systemuhr.

Lage behaelt bei einem abweichenden Kalenderjahr neben dem normalisierten Zeitstempel das urspruengliche Publikationsdatum und dessen Jahr. Ohne Jahresverschiebung reicht das vorhandene `veroeffentlichtAm`; wiederholte Metadaten sollen keine weiteren Quellen aus dem begrenzten Kontextfenster verdraengen. `ereignisdatum` bleibt im Zusatz ausdruecklich null: Es wird kein Ereignisdatum aus Metadaten erfunden. Relative Jahresangaben sollen nur bei eindeutiger Kontextbindung zum Quellenjahr normalisiert werden; Zitate und historische Bezuege bleiben eine Aufgabe der fachlichen Pruefung.

Understanding, Lagegeneration und der vorhandene separate Quellenreview erhalten dieselben Regeln fuer Zuschreibung, Publikation, Abruf, Ereignis und Modalitaet. Dies fuegt keinen Modellaufruf hinzu. Die bestehenden exakten Belegstellen, Mandatsbindung und fachlichen Ablehnungen werden nicht abgeschwaecht.

## Grenzen und Risiko

Der Lagequellenvertrag bekommt Version4. Bereits gespeicherte Vertraege der Version3 gelten damit nach einem spaeter freigegebenen Deployment nicht als nach dem neuen Vertrag geprueft. Eine spaetere regulaere Neuerzeugung kann dadurch zusaetzliche Aufrufe im bestehenden Budget ausloesen oder ehrliche Leerstaende zeigen. Hier werden weder alte Texte veraendert noch Aufrufe ausgeloest. Der harte Geldriegel bleibt unveraendert.

Die Promptaenderung ist keine fachliche Modellabnahme. Tests beweisen korrekte Eingaben, Datumsvalidierung und Cachetrennung. Sie beweisen weder die richtige Deutung jedes Zitats noch vollstaendige Quellenversorgung, Faktenrichtigkeit oder 500 gelieferte Ergebnisse. Schon gespeicherte globale Analyseobjekte werden nicht rueckwirkend umgeschrieben.

`vercel.json` erhaelt ausschliesslich die Abschaltung automatischer Deployments fuer diesen Reparaturbranch. Alle 13 Crondefinitionen bleiben gegen Main identisch. Keine Workflow, Modell, Budget, Environment, Azure, Datenbank oder Profilkonfiguration wird geaendert.

## Pruefbelege

* Vor der Implementierung scheiterte `node scripts/lokal.js -- node scripts/quellen-zeitvertrag-test.js` an der fehlenden strukturierten Quelle.
* Nach der Korrektur bestehen neun Gruppen: Feldtrennung, UTC Jahreswechsel, C09, fehlende und ungueltige Daten, Schaltjahr, Felder mit Steuertext und Zeilenumbruechen, Dokumentgrenze und Unveraenderlichkeit, alle drei Promptpfade sowie Cachetrennung.
* Kanonischer Gesamtlauf: 391/394 Suiten in 653 Sekunden. Die drei anfaenglichen Fehler wurden gezielt nachgeprueft: `admin-nutzer-loeschen-test.js` 75/75 Assertions und `passwort-setzen-login-fix-test.js` 39/39 nach Installation des zur CI passenden Chromium; `github-quellenkontext-500-test.js` 13/13 Gruppen nach Begrenzung redundanter Zeitmetadaten. Damit kein offener Fehler aus dem Gesamtlauf. Dies ist ein Gesamtlauf plus Nachpruefungen, kein behaupteter zweiter durchgehend gruener Gesamtlauf.
* Nach der letzten Codekorrektur nochmals Quellenzeitvertrag9, Quellenbeleg21, Briefingsprache28 und Statusgroesse4 erfolgreich. Syntax aller sechs betroffenen Javascript Dateien und `git diff --check` erfolgreich. Der zunaechst gewaehlte Name `lage-textqualitaet-test.js` existiert nicht; die vorhandenen Dokumentbindungspruefungen bestehen mit8/8 und die Lagepruefung mit141/141 Assertions. Keine Tests entfernt oder Erwartungen abgesenkt.
* Tests laufen ausschliesslich ueber `scripts/lokal.js` mit entferntem Production Zugang und technischem Netzschutz. GitHub CI wird erst durch den PR gestartet und bleibt getrennt nachzuweisen.
* Lokale Abhaengigkeiten aus dem vorhandenen Cache kopiert; identische Lockdatei. Keine neue Laufzeitabhaengigkeit. Playwright1.56.1 war lokal vorhanden; der passende Chromium141 Browser und FFMPEG wurden fuer die vorhandenen Tests heruntergeladen. Der erste CLI Versuch scheiterte an der abweichenden globalen Playwright1.62.1 Umgebung; der zweite benutzte den konsistenten vorhandenen Paketpfad. Keine Projekt oder CI Aenderung dafuer.

## Verbleibender Reparatursprint

Die alten Vorbereitungen fuer faire Fortsetzung, aktive Zielmenge, Versorgung und Auswertung bleiben gesondert zu pruefen. Nicht enthalten sind neue Crontermine, deren Aktivierung, automatische fachliche Ablehnungswiederverwendung, Artikelvariantenbereinigung, Titelreparaturen und die neue 500er Abschlussintegration. Fehlender Quellentext, falsche Akteurs oder Ebenenzuschreibung und sachlicher Profilbezug bleiben fachlich nachzuweisen. Keine dieser Aufgaben wird durch die neun Testgruppen als erledigt markiert.

Naechster kleiner Sprint: erhaltene Versorgungsreparatur gegen Main auf aktive Zielmenge und faire Fortsetzung begrenzen und lokal abnehmen. Ein neuer 500er Test braucht danach eine eigene Freigabe mit Zielmenge, Zeitfenster, Kosten, Erfolgswerten und unabhaengig geprueftem Abschlussweg.

Merge, Production Deployment, neue Crons, Profil oder Datenaenderungen und kostenpflichtige Modellaufrufe sind nicht freigegeben. Auch ein spaeterer produktiver Revert braucht eine Betreiberfreigabe. Lokaler Rueckweg ist die Ruecknahme dieses isolierten Branchdiffs.

## Publikationszeit bereits beim Einlesen am 20.09.

Basis nach integriertem PR462:91fdcbfa3d7735491764e3af4f49953812eb0bfe,
Branch codex/quellen-publikationszeit-20260920. Teilweise abgeschlossen;
lokale Pruefung unten, exakte Pflicht CI und Integration offen.

Belegte neue Ursache: Der Leser aus PR419 konnte erfundene upstream
Metadaten nicht erkennen. normalizeRawItem und der DIP Scheduler setzten
bei fehlendem Datum die Systemzeit. HTML setzte sie immer. Atom updated
und DIP aktualisiert wurden als Publikation behandelt. Freies Date.parse
verschob den30. Februar in den Maerz und deutete selbst die Zeichenfolge12
als historischen Zeitstempel. Diese Angaben gelangten als scheinbar
gueltige Publikationsdaten in den Quellenvertrag.

Vor Aenderung festgelegte Erwartungen: fehlende, ungueltige oder nur
geaenderte Zeit bleibt unbekannt; belegte ISO und RSS Daten bleiben
erhalten; Quelleninhalt und Abrufzeit bleiben nutzbar. RSS, HTML und DIP
sowie Understanding und Lage muessen denselben Unterschied erhalten.

Kleinste Korrektur: gemeinsame begrenzte Datumsnormalisierung mit dem
bestehenden Kalenderpruefer. ISO und explizite RSS Datumskomponenten mit
Jahr und Zeitzone werden gelesen; unbekannte Formen bekommen keinen
Ersatz aus Uhr, URL oder Abruf. Kein vollstaendiger RFC5322 Parser.
Atom braucht published oder pubDate, DIP datum. HTML verwendet ein
ausdrueckliches article:published_time statt Systemzeit. Die getrennte
Abrufzeit bleibt erhalten. Fehlende und ungueltige Publikation verwendet
denselben stabilen undated Hashanteil. Kandidaten bekommen aus Abruf
oder zukuenftiger Publikation keinen Frischebonus. Auch die isolierte
Frischeprobe verwendet die Kalenderpruefung vor ihrer48 Stunden Grenze.

Zehn neue Pruefgruppen erfolgreich: gueltige Kalenderdaten und Zeitzonen,
unmoegliche/uneindeutige Angaben, globale Speicherabbildung, stabile
Kennungen, Atom Aenderungszeit, HTML ueber echten lokalen HTTP Server,
DIP in beiden Stellungen, Understanding und Lage, Kandidatenreihung und
Frischeprobe. Die neue Testfixture wurde beim ersten Lauf an den
tatsaechlichen persists Rueckgabevertrag und beim zweiten an den
vollstaendigen leeren Lage Rueckgabewert korrigiert; keine bestehende
Assertion oder Schwelle geaendert. Kein Modellversuch.
Betroffene Bestandssuiten erfolgreich: Quellenzeitvertrag9,
Quellenfrische11, Crawlerhaertung19, Pilotvertrag97, Quelldeduplikation13
und Lagekapazitaet129.

Privater Replay der vorhandenen31 Feedkandidaten: alle Publikationsdaten,
gespeicherten Dokumentkennungen und Auszuege erhalten. Der erste
Vergleich setzte faelschlich temporaere raw Kennungen mit gespeicherten
rd Kennungen gleich; korrigiert am echten toRawDocumentRow Ausgang.
Das Artefakt enthaelt normalisierte Eingaben, nicht das urspruengliche
RSS XML. Deshalb kein behaupteter erneuter Originalfeedtest. Keine
externen Abrufe, bezahlten Aufrufe oder Production Schreibvorgaenge.

Production Wirkung nach Integration: kuenftige unbelegte Publikationszeit
bleibt null. Damit kann die bestehende Lagefrischepruefung eine solche
Quelle ehrlich ablehnen. Risiko: weniger als frisch angenommene Quellen
und geaenderte Kennungen bei zuvor ungueltigen Datumsangaben. Atomare
Dublettensicherung und URL Abgleich bleiben erhalten. Historische
Quellen werden nicht pauschal korrigiert, da ihr wirklicher Zeitpunkt
nicht aus der gespeicherten Angabe erschlossen werden kann. Quellentext
bleibt bestehen; dies ist keine Loeschung oder neutrale Umschreibung
aller Prosa und kein Nachweis freier semantischer Folgerungen.

Rueckweg: gezielter Code Revert ohne Datenloeschung. Vor Merge exakte
Pflicht CI und anschliessend READY/Main/Alias sowie geschuetzten
Production Stand rein lesend pruefen. Preview nur fuer diesen Branch
ausgeschaltet. Keine Cron, Environment, Budget, Profil oder
Migrationsaenderung; kein neuer500er Test.

Kanonischer lokaler Gesamtlauf429/430 Suiten in646 Sekunden, Exit1.
Einziger Fehler: der historische Sprint9B Atom Positivfall verwendete nur
updated als vermeintliche Publikation. Der positive Fall hat jetzt ein
ausdrueckliches published und bleibt geeignet; ein zusaetzlicher Fall mit
nur updated bleibt eingeschraenkt und behauptet keine Publikationsfrische.
Keine vorhandene Assertion entfernt oder Schwelle gelockert. Auch der
Sprint9B Leser benutzt jetzt die gemeinsame Kalenderpruefung; ein weiterer
Gegenfall prueft den unmoeglichen Kalendertag. Alle47 betroffenen Assertions
danach erfolgreich. Dies ist ein Gesamtlauf plus gezielte Nachpruefung,
kein behaupteter gruener lokaler Gesamtlauf des finalen Heads.

Der vorbereitete Quellenimport bekommt im bestehenden CI Datenbankgate
einen getrennten isolierten Nachweis, siehe [Importvorbereitung](quellenkontext-ruhe-2026-09-19.md#vorbereitete-uebernahme-der31-gelesenen-quellen).
Keine Ausfuehrungsfreigabe durch diesen Test.
