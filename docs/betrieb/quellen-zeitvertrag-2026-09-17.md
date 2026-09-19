# Quellenzeitvertrag im Reparatursprint

Stand 17.09.2026. Dieser begrenzte technische Teilsprint ist lokal erfolgreich geprueft. Der gesamte Reparatursprint bleibt teilweise abgeschlossen. Keine Production Wirkung, kein neuer Modellaufruf und kein erneuter 500er Nachweis.

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
