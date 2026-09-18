# Akteursrollen und ausdrueckliche Unsicherheit erhalten

Stand 19.09.2026 Tuerkei, begonnen am 18.09. UTC. Status: teilweise abgeschlossen.
Basis PR443 `00e1d7642ecbd11eee10e1a044e909be65feb03e`.
Folgebranch `codex/akteursrollen-erhalten-20260919`.

## Beleg und vorab festgelegte Erwartungen

Die vier historischen Prosaquellen aus PR443 bleiben Ergebnis B. Erhaltene
Aufnahmen, damalige Modellrequests und heutige Rekonstruktionen bleiben getrennt.
Die gezielt gelesenen Originalnotizen bestaetigen Sachgebiet, Vollzug,
Zuschreibungen und den Praezisierungsbedarf der Konzertzeit. Sie enthalten keinen
nachtraeglichen Beweis fuer die genaue historische Modellursache.

Unabhaengig davon zeigt die heutige Nachverarbeitung eine neue allgemeine Luecke:
`buildDecisionEntities` nimmt `mentioned_committees` und `mentioned_ministries`
als handelnde Institutionen auf, obwohl diese Listen nur Erwaehnungen bezeichnen.
Die neue neutrale Regression erreicht vor der Korrektur den injizierten Speicher
und scheitert am dort gespeicherten Ausschuss mit erfundener Akteursrolle.
Die fachlich korrekte feste Modellantwort wurde erst durch Anwendungscode veraendert.

Erwartung vor Aenderung: Eine blosse Erwaehnung bleibt erhalten, aber begruendet
keine Akteursrolle. Explizite Beteiligung in `ausschuesse` oder `ministerien`
bleibt moeglich. Gemischte und doppelte Nennungen verlieren keine Eintraege.

Die anschliessende Schwesterfeldpruefung belegt zwei weitere Aufwertungen:

1. Die Modellantwort liefert `decision_level=unknown` und `event_type=unknown`.
   Der Deriver ersetzt das durch eine Bundesebene und einen Kabinettsbeschluss
   aus Hintergrundnennungen. Erwartung: ausdrueckliche Unsicherheit erhalten.
2. Die Modellantwort liefert `affected_geographies=[]`. Eine Hintergrundinstitution
   erzeugt dennoch eine betroffene Region. Erwartung: ihre Nennung erhalten,
   aber ohne neuen Betroffenheitsbeleg die ausdrueckliche Liste nicht erweitern.

Beide Regressionen scheitern vor ihrer jeweiligen Korrektur im echten Fachpfad.
Auch diese neutralen Belege sind keine historischen Replays und keine Modellabnahme.

## Allgemeine Korrektur und positive Gegenfaelle

`lib/helmut/quellenarchitektur/classification.js` und die nachgelagerte
Politikfeldableitung in `matching.js` werden fachlich geaendert.
Erwaehnte Ausschuesse und Ministerien gehen nach `related_entities`;
`decision_entities` erhaelt weiter die explizit beteiligten Institutionen.
Keine Einzelquelle, Person, Partei oder konkrete Institution wird im Motor ergaenzt.

Explizites `unknown` wird bei Ebene und Ereignisart nicht mehr als fehlendes Feld
behandelt. Eine gelieferte Liste betroffener Geografien wird nicht mehr durch
Institutionsnennungen erweitert; diese bleiben als Erwaehnungen erhalten.
Staerkere Parserbelege, amtliche Belege und geschuetzter Bestand bleiben wirksam.
Ein schon belegter Bestand wird nicht geloescht oder pauschal zurueckgestuft.
Die bestehende Sperre ausdruecklich widerspruechlicher Ebenen aus PR439 bleibt.

Richtige explizite Akteursrollen, alle fuenf politischen Ebenen, alle konkreten
Ereignisarten, explizite betroffene Regionen und echte hoeherrangige Belege bleiben
moeglich. Keine Prosa, Quelle oder Eingabe wird umgeschrieben. Kein Schema,
Prompt, Modell, Kostenriegel oder Speichervertrag wird abgeschwaecht.

## Gezielte Pruefung und Grenzen

Neue Suite `scripts/akteursrollen-erhalten-test.js`: 16/16 Gruppen erfolgreich.
Sie prueft Erstverstehen und Update bis zur bestaetigten Speicherattrappe,
Auswerter, reine Backfillplanung, gemischte Rollen, Duplikate, Bestandschutz und
positive Gegenfaelle. Genau ein Modellmock je Fachaufruf; keine echte KI und
keine Datenbank. Eingaben, Antworten und Bestandsobjekte bleiben unveraendert.

Nach der ersten Rollenreparatur scheiterte nur ein neues synthetisches Beispiel
an einem vorhandenen kanonischen Ausschussalias. Sein Beispielname wurde durch
einen neutralen Namen ohne Katalogtreffer ersetzt. Keine Assertion, bestehende
Pruefung oder fachliche Schutzregel wurde gelockert. Die anschliessenden roten
Regressionslaeufe zu Unsicherheit und Geografie waren gezielte Vorherbelege.

Gezielt erfolgreich: Klassifikation 70/70, Geografiegedaechtnis 61/61,
Ebenengedaechtnis 41/41, Ebenenkonsistenz 8/8 Gruppen,
Nachklassifikation 101/101, Embeddingvertrag 43/43.
Alle Tests ueber `node scripts/lokal.js -- node ...`.
Der erste vorgeschriebene lokale Gesamtlauf endete mit 415/417 in 755 Sekunden.
Nur zwei Browsertests scheiterten am fehlenden Standardsuchpfad fuer Chromium1194.
Der Browser war bereits in der vorhandenen isolierten Laufzeit installiert.
Mit dessen explizitem lokalem Browserpfad besteht die Nutzerloeschung unveraendert.
Kein Browserdownload, kein geaenderter Pruefcode und keine abgeschwaechte Schranke.
Der zweite Gesamtlauf besteht mit 417/417 Suiten in 780 Sekunden, einschliesslich
beider Browserpruefungen. Er umfasst die Rollen und Optionalfeldkorrektur vor
dem letzten Ausschuss und Politikfeldblock. Danach gezielte Pruefungen am
Endstand; die verpflichtende CI prueft den veroeffentlichten Gesamtstand erneut.
Dies ist lokal Gesamtlauf plus Nachpruefung, keine behauptete letzte
Anwendungsaenderung vor dem erfolgreichen Gesamtlauf.

## Anschlussreparatur: fehlende Optionalfelder

Vor weiterer Aenderung Main und PR443 unveraendert, null laufende oder wartende
Actions, nur zwei alte queued Eintraege. Eigener Branch und Arbeitsaenderungen
unveraendert zugeordnet, kein anderer Schreiber im betroffenen Bereich sichtbar.

Die Schwesterfeldpruefung zeigte denselben Rollenfehler im alten Ableitungspfad,
wenn das Modell die optionalen Felder gar nicht liefert. `koHaystack` nahm
Erwaehnungslisten als Grundlage fuer Entscheidungsebene und Ereignistyp;
`hasCommittee` zaehlte auch nur erwaehnte Ausschuesse. Die neue Laufzeitprobe
scheiterte vor der Korrektur mit bund statt unknown. Drei getrennte Proben am
unveraenderten PR443 Code bestaetigten zudem Berlin als betroffen allein aus
`mentioned_committees`, `mentioned_ministries` und `mentioned_organizations`.

Erwartung vor Aenderung: Diese Listen bleiben auch ohne optionale Modellfelder
reine Erwaehnungen. Explizite Handlung in Sachtext oder Beteiligtenliste bleibt
eine moegliche Ableitungsgrundlage. Korrektur: Ebenen und Ereignisderiver nehmen
keine Erwaehnungslisten mehr als Hauptbeleg; beruehrte Ebenen behalten sie.
Geografien solcher Listen erhalten stets die Rolle erwaehnt. Beide echten
Speicherpfade und reine Backfillplanung bestehen die neuen Gegenproben.

Acht alte Assertions erwarteten teilweise genau die aufgefundene Aufwertung.
Ihre Pruefziele bleiben erhalten: negative Erwaehnungen werden jetzt ausdruecklich
geprueft und positive Beispiele erhalten eine belegte Handlung. Kein alter
Schutztest wurde entfernt; Datenintegritaet, Histogramm, Leerwerte und fehlende
Ortsbelege werden weiter geprueft. Klassifikation70/70 und Geografie61/61 danach
erfolgreich, ebenso Ebenengedaechtnis41/41 und Nachklassifikation101/101.

## Anschlussreparatur: Ausschussidentitaet und Sachgebiet

Der naechste reine Vorflug bestaetigte denselben eigenen Branch auf PR443 und
keine geaenderten entfernten Reparaturen. Zwei weitere neutrale Belege:
Ein beliebiger Ausschuss erzeugte ohne Ebenenbeleg bund/high. Ein Ausschuss
fuer Bildung eines Stadtrats wurde durch `normalizeCommittee` zum
Bundestagsausschuss fuer Bildung und Forschung umbenannt. Die falsche
Bundesebene scheiterte vor der Korrektur erneut im echten Speicherpfad.

Erwartung: Fachgebiet allein belegt keine Ebene; eine Themenaehnlichkeit keine
Institutionsidentitaet. Der Ebenenderiver nimmt deshalb nicht mehr jeden
Ausschuss als Bundesbeleg. Explizite Bundesinstitutionen und eindeutige
Bundesministeriumsaliase bleiben moeglich. Der Ausschussresolver verlangt eine
vollstaendige normalisierte Fachbezeichnung statt bloss eines Themenworts.
Volle Namen, Kurzformen und entsprechende zusammengesetzte Ausschussnamen
bleiben aufloesbar. Unbekannte Namen bleiben unveraendert mit null ID erhalten.
Nachklassifikation nutzt denselben Resolver; ihr Bestandsschutz bleibt erhalten.

Die gezielte Sachgebietspruefung fand ausserdem `matching.derivePolicyFields`:
Ein nur erwaehnter Finanzausschuss erzeugte das Politikfeld Finanzen. Dies ist
eine aktuelle allgemeine Ursache, kein Beweis fuer den historischen Pflegefall.
Die rote Gegenprobe zeigt genau diese unberechtigte Ableitung. Jetzt tragen
nur beteiligte Ausschuesse diese Ableitung. Explizite Themen behalten Vorrang,
die erwaehnte Institution bleibt als Erwaehnung erhalten. Beide Speicherpfade
mit nachgelagerter Merkmalsableitung bestehen negative und positive Gegenfaelle.
Der manuelle Anreicherungsweg verwendet dieselbe korrigierte Funktion; er
wurde nicht ausgefuehrt. Bestehende gespeicherte Politikfelder bleiben unberuehrt.

Am Endstand erfolgreich: neue Suite16/16, Klassifikation70/70, Anreicherung18/18,
Nachklassifikation101/101, Ausschusszustaendigkeit88/88, Geografie61/61,
Ebenengedaechtnis41/41, Ebenenkonsistenz8/8 und Embeddingvertrag43/43.
Zusaetzlich die betroffenen bestehenden Suiten Matchingnormalisierung,
Relevanzgate, Ausschussnormalisierung, Ausschussbelege und Anreicherungsbackfill.
Ein irrtuemlich gewaehlter Geografietestname existierte nicht und zaehlt nicht
als ausgefuehrter Test. Der vorhandene Zustaendigkeits und Geografievertrag
wurde stattdessen geprueft. Alte Erwartungen an generischen Bundesausschuss
und Themenableitung aus Erwaehnungen wurden durch negative Gegenfaelle und
ausdruecklich belegte positive Eingaben ersetzt. Keine Schutzregel entfernt.

## Weiterhin offene Grenzen

Grenzen bleiben ausdruecklich offen:

* Die vier Prosakategorien aus PR443 werden durch diese Korrektur nicht semantisch
  validiert. Ein plausibler Satz mit vertauschten Rollen kann weiterhin passieren.
* Fehlende Klassifikationsfelder behalten die Ableitung aus Beteiligtenlisten
  und Sachtext, nun ohne Erwaehnungslisten als Hauptbeleg. Die Korrektur beweist
  keine Rolleninterpretation beliebiger Prosa und keine richtige Modellantwort.
* Bestehende Katalogaufloesung kann Bezeichnungen kanonisieren. Ein Katalogtreffer
  ist kein neuer Quellenbeleg fuer Rolle, Sachgebiet oder Geografie.
* Die reine Nachklassifikation erhaelt Altbestand und entfernt keine schon
  gespeicherten falschen Akteursrollen. Kein Backfill oder Production Import.
* Aenderungen kuenftiger Klassifikationen koennen Zuordnung und Auswahl beeinflussen.
  Eine geringere Treffermenge darf nicht als bessere fachliche Versorgung gelten.

## Betrieb und Integration

Main bleibt `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`.
PR419 bis PR443 sind beim frischen Abgleich offen, Draft und ungemergt.
Jede Basis entspricht genau dem Vorgaengerhead; alle sind gegen ihre jeweilige
Basis konfliktfrei. Die lokale Kopie hat den echten veroeffentlichten PR443 Head,
nicht nur einen inhaltsgleichen abweichenden lokalen Commit.

Keine aktuelle Action in Bearbeitung oder wartend; nur die zwei bekannten
queued Altlaeufe vom 06.08. Kein weiterer lokaler Schreiber sichtbar; globale
Work Sitzungen technisch nicht abfragbar. Fremde Vorarbeiten bleiben erhalten.
Vor einem spaeteren Merge muss dieser Vorflug frisch wiederholt werden.

Automatische Deployments des eigenen Folgebranches sind gesperrt. Die 13 Crons,
Artikelkontextflag, Datenbank, Profile und alle Production Umgebungswerte bleiben
unveraendert. Kein Merge, Deployment, Modellaufruf oder neuer 500er Test.
Rueckweg vor Integration: ungemergten Folgebranch nicht uebernehmen.

## Fortsetzung und Bereitschaft

Reparaturpaket noch nicht fuer den 500er Test abgenommen. Historische Prosafehler,
reale Modellbefolgung, Artikelkontextentscheidung, Versorgung und sicherer
Abschluss eines neuen Testfensters bleiben getrennte Nachweise.
Die vollstaendige [Bereitschaftspruefung](500-bereitschaft-2026-09-19.md)
benennt Integration, automatische Production Wirkung, Profilmenge, Kosten,
Qualitaet, Testende und die noch notwendige Betreiberentscheidung.
Der naechste begrenzte Prosanachweis ist als acht feste synthetische Faelle
vorbereitet. Ohne eigene Kostenfreigabe keine reale Ausfuehrung.
