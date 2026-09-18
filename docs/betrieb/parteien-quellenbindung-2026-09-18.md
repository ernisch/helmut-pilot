# Quellenbindung strukturierter Parteienlisten

Stand 18.09.2026. Status: teilweise abgeschlossen. Folgeblock auf PR436
`1abe01a2a02226246e365ae0cafd5e2da0bdbca3`, eigener Branch
`codex/parteien-quellenbindung-20260918`. Keine Production Wirkung.

## Ausgangspunkt und Beleggrenzen

Die [gemeinsame Abnahme von PR434 bis PR436](aussagen-fristen-vertrag-2026-09-18.md#gemeinsame-abnahme-von-pr434-bis-pr436)
liess die fehlende Kurzempfehlung trotz Reaktionsentscheidung als naechsten
Originalbefund offen. Untersucht wurde Q006 des abgeschlossenen500er Tests.
Die Belege bleiben unveraendert und privat; keine Profile oder Rohantworten im Repo.

Die erhaltene Speicheraufnahme vom15.09. um11:28:53.771564UTC enthaelt die Karte
mit61 Punkten und Sofort reagieren. Sie stammt aus Version18 von
`Helmut_500_Productiontest_20260915_Belege.zip`. SHA256 des Eintrags
`500_Speicheraufnahme_20260915_nach_Start.json`:
`29a67624117c98955f014680679761baf5b14310d0ed19dd10d9a4a310eab2f2`.
Das damalige vollstaendige Mandatsprofil und die Identitaetszeile liegen in
derselben Aufnahme vor. Verwendet wurde die erhaltene Karte, keine manuell
redigierte Antwort aus einem anderen Teil des Archivs.

`Helmut_B055_Belege_20260915.zip` enthaelt das globale Wissensobjekt und seine
eine verknuepfte Quelle aus einer frueheren authentifizierten Aufnahme fuer ein
anderes Profil,15.09.04:14:29.833UTC. Objektkennung und Aenderungszeit stimmen
mit der spaeteren gespeicherten Empfehlung ueberein. SHA256 `basis.json`:
`97ff635a0ade052861396ab74c85cdc38c5274ea047b53695c90371a394febaa`;
`aufnahme.json`:
`d8bfa6201d2b7d6970eaab30860b04dac02ecdc8e83df846becab812653eaad4`.
Das ist keine gemeinsame transaktionale Aufnahme und kein erhaltener exakter
historischer Modellrequest. Aus dem Quellenstand folgt deshalb keine Behauptung
ueber unbekannte damalige Zusatztexte.

## Eingrenzung statt Aufweichen des Fristenschutzes

Der erhaltene Kurztext `recommendation` war schon leer. Der Rueckfalltext
`handlungsempfehlung` enthielt einen unbelegten relativen Handlungszeitraum.
Der vorhandene Quellen und Fristenschutz verwirft ihn regelgerecht. Die drei
gespeicherten strukturierten Handlungsschritte lassen sich ebenfalls exakt aus
diesem Schutzpfad reproduzieren. Die einschlaegigen Schutzmodule am damaligen
Production Commit `f700c1d139e5eebff2e8865507e32e273dba3e8a` stimmen mit dem
uebernommenen Stand ueberein. Kein belegter Verlust eines fachlich gueltigen
Kurztextes und kein Anlass, die Schutzregel oder den Darstellungsvertrag zu lockern.

Die Reaktionsentscheidung ist dagegen ueber den realen Profilmapper,
`matchProfileToKnowledgeObjects` und `buildDecision` offline exakt reproduziert:
61 Punkte, Sofort reagieren, dieselben zwei Merkmale Partei und Region.
Das Wissensobjekt enthaelt in `parteien` und `mentioned_parties` jeweils drei
Parteien, von denen keine im erhaltenen Titel oder Auszug vorkommt.

| Bewertungsbestandteil | Punkte |
| --- | ---: |
| Parteitreffer | 22 |
| Region | 20 |
| Aehnlichkeit0,2746 mal24 | 6,5904 |
| Zeitdruck mittel | 8 |
| Konfidenzwert70 | 4 |
| Gerundet | 61 |

Reine Gegenprobe mit beiden Parteienlisten leer:36 Punkte, Ignorieren,
Aehnlichkeit0,1766, nur das Regionsmerkmal. Das ist ein diagnostischer Vergleich,
keine fachlich abgenommene neue Karte und keine Aenderung gespeicherter Daten.
Alle Originaleingaben bleiben identisch. Die Bewertung verwendet beide Listen
sowohl fuer den direkten Parteitreffer als auch fuer die Aehnlichkeit. Nur eine
der Listen zu begrenzen wuerde den unbelegten Profilbezug bestehen lassen.

## Allgemeine Ursache und festgelegtes Ergebnis

Die bisherigen Rollenregeln unterscheiden Beteiligung und blosse Erwaehnung,
pruefen aber die Existenz der Parteinennung vor dem Speichern nicht. Das Schema
prueft Listenformen; Sanitisierung und nachgelagerte Profilzuordnung liefern
keinen Quellenbeleg. Die vorhandene deterministische Quellenbindung erfasste
nur `ministerien` und `mentioned_ministries`.

Ein neuer neutraler Laufzeittest mit Busverkehr und einer frei erfundenen
Testpartei reproduziert am unveraenderten PR436 Motor `saved` statt des erwarteten
`skipped-invalid`. Dieser unabhaengige Beleg zeigt die allgemeine Luecke ohne
historischen Modellrequest, Artikelkennung, Gipfeltitel oder Parteienkatalog.

Vor der Motoraenderung festgelegter Vertrag: Fehlt die woertliche Bezeichnung in
den tatsaechlich gelieferten Quellen, darf sie in keiner der beiden Parteienlisten
gespeichert werden. Echte Nennungen muessen weiterhin speicherbar und fuer einen
korrekten Parteitreffer verwendbar bleiben. Bewertungsschwellen, Gewichtung,
Profilmapper, Fristenschutz und bestehende Daten bleiben unveraendert.

## Kleine allgemeine Reparatur

Der bestehende Ministerienvalidator heisst jetzt
`lib/helmut/akteurslisten-quellenbindung.js`. Er prueft zusaetzlich `parteien` und
`mentioned_parties`; die Prueflogik fuer Ministerien bleibt unveraendert.
Der Prompt verlangt Quellbezeichnungen und verbietet die Ergaenzung von Parteien
aus Thema, Ort, Person, Amt oder Vorwissen. Keine neue Modellrunde.

Erstverstehen, Aktualisierung und Auswertung pruefen wie bisher die rohe Antwort
gegen genau den abgesendeten Prompt. Ausschliesslich ausgewaehlte Quellenzeilen
mit Titel, Auszug oder explizit gebundenem Artikelabsatz zaehlen. Unicode NFC,
Grossschreibung und Leerraum werden normalisiert; Wortgrenzen sind erforderlich.
Keine Metadaten, URLs, Antworttexte, Promptbeispiele, nicht ausgewaehlten Quellen,
nachtraeglichen Eingabemutationen oder Verbindungen getrennter Textfelder.

Ein unbelegter Wert verwirft die gesamte neue Antwort vor Speicherung mit
`skipped-invalid` und `quellenbeleg-parteien` beziehungsweise
`quellenbeleg-mentioned_parties`. Keine stille Listenbereinigung bei gleichzeitig
erhaltener abhaengiger Empfehlung. Bestehende Aktualisierungsdaten bleiben erhalten.
Fehlermarkierung, Vormerkung, CAS und der gesperrte unbekannte Aufrufausgang werden
unveraendert benutzt. Kein unmittelbarer Retry und kein zusaetzlicher Modellaufruf.

## Pruefstand

Neue Suite `scripts/parteien-quellenbindung-test.js`:9/9 Gruppen erfolgreich.
Beide Listen sperren unbelegte Werte in Erstverstehen und Update. Echte Nennungen
in Titel, Auszug und gebundenem Kontext bleiben erhalten; der neutrale Gegenfall
erzeugt weiterhin einen Parteitreffer. Weitere Abnahmen: gemischte belegte und
unbelegte Liste, ehrliche Leerlisten, Auswerter, Metadaten und Promptbeispiele,
Teilwort, Alias und Personenableitung, Unicode, getrennte Felder, Quellenlimit,
Eingabemutation sowie fehlender CAS Vertrag. Alle Modellantworten sind Attrappen.

Die bestehende Ministeriensuite bleibt mit allen12 Gruppen erhalten und besteht;
nur ihr interner Import ist auf den neuen Modulnamen umgestellt. Wiederholung
hier wegen der unmittelbar geaenderten gemeinsamen Pruefung, keine neue
Fachabnahme des Gipfelversuchs.

Der gemaess CLAUDE.md Paragraph6 vorgeschriebene lokale Gesamtlauf endete mit
410/411 erfolgreichen Suiten in845 Sekunden, Exit1. Einziger Fehler:
`p1-security-check.js` verwendete fuenf illustrative Goldsetantworten mit jeweils
zwei unbelegten Parteienlisten. Ausschliesslich diese zehn Listen wurden geleert;
Quellen, sieben Faelle und alle bisherigen Abnahmen bleiben erhalten. Zwei neue
Abnahmen pruefen die gespeicherten Leerlisten. Gezielte Nachpruefung:334/334
Sicherheitspruefungen erfolgreich; Goldsetstruktur7/7 gueltig. Der positive
Parteitreffer bleibt unabhaengig in der neuen Suite belegt.

Die Statusdatei ueberschritt beim ersten Einzelcheck die Zeichengrenze um88.
Nach Kuerzung ausschliesslich des aktualisierten Absatzes:4/4 erfolgreich,
29.942 Zeichen. Kein gelockerter Grenzwert. Nach Kopfaktualisierung29.950 Zeichen.

Anwendungscode im Gesamtlauf und in den Nachpruefungen identisch. Kein behaupteter
lokaler411/411 Lauf und kein zweiter Gesamtlauf nur wegen Testattrappen und Doku.
Die abschliessende vollstaendige Pflicht CI am veroeffentlichten Head ist im
Draft PR massgeblich. Dort stehen Commit, PR und CI Abschluss, ohne durch weitere
reine Nachweiscommits neue Laeufe auszuloesen. Vorhandene erfolgreiche PR433 bis
PR436 Fachpruefungen wurden nicht wiederholt; der Gesamtlauf ist der verbindliche
Pruefvertrag fuer den neuen PR.

## Grenzen, Betrieb und Fortsetzung

Nennungsbeleg fuer vier strukturierte Listen, keine allgemeine semantische
Wahrheitspruefung. Eine genannte Partei kann weiterhin falsch als beteiligt gelten.
Freitext, Personen, Ausschuesse und sonstige Akteurslisten sind hier nicht
deterministisch gebunden. PR435 und PR436 bleiben fuer Mandatsbezug, Beschluesse
und konkrete Fristen auf einen korrigierten Prompt begrenzt; reale Modellbefolgung
ist unbewiesen. Ehrliche Leerlisten beweisen keine richtige Gesamtantwort.

Die woertliche Bindung kann sachlich richtige Aliase, Uebersetzungen oder
Flexionsvarianten ablehnen. Der Prompt fordert deshalb die gelieferte Bezeichnung.
Eine moegliche Versorgungsluecke wird sichtbar. Vorhandene falsche Objekte werden
nicht rueckwirkend geaendert. Kein neuer500er Production Nachweis erbracht.

Vorflug: main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`; PR433 bis PR436 offen,
Draft und ungemergt, Heads unveraendert. Keine relevante laufende oder wartende
Action; nur zwei queued Altlaeufe vom06.08. Keine konkurrierende Reparatur sichtbar.
Eigene Kopie vor Beginn sauber; keine fremden lokalen Schreiber sichtbar.
Globaler Work Sitzungsstatus bleibt nicht abfragbar. Fremde55 Vorarbeiten erhalten.

Automatische Deployments des eigenen Branches in `vercel.json` deaktiviert;
alle13 Crons und uebrige Konfiguration unveraendert. Artikelkontext bleibt AUS.
Kein Merge, Deployment, Datenbankzugriff, Profilwechsel, Migration, Environment
oder Azure Wechsel, bezahlter Modellaufruf oder neuer Production Test.
Rueckweg vor Merge: den eigenen ungemergten Folgebranch verwerfen.

Nach Abschluss dieses Blocks zuerst den naechsten erhaltenen500er Inhaltsbefund
rein lesend bestimmen. Keine automatische Ausweitung auf neue Akteurskataloge,
Scoringregeln oder Freitextfilter. Fachliche Gesamtwirkung, Merge und ein spaeterer
Production Nachweis bleiben getrennte offene Schritte mit eigener Freigabe.
