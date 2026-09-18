# Ausschusslisten an gelieferte Quellen binden

Stand 18.09.2026. Status: teilweise abgeschlossen. Die technische Listenbindung ist
offline belegt. Falsches Sachgebiet und falscher Vollzug in der Prosa bleiben offen.
Keine korrigierte Production Karte und keine reale Modellbefolgung behauptet.

## Ausgangspunkt und erhaltene Belege

Folgebranch `codex/ausschuesse-quellenbindung-20260918`, Basis PR441
`5b8879b7cb7f8ac6aec46aac01acc35c6ea49afa`. Lokaler Basiscommit
`3959ce10680190063134a6ec83baea282d045c96`, gleicher Tree
`7dd1ce363d7113f431196cbeaa0cfbd29a453576` und gleicher Elterncommit
`f166db871ec82deb81a309ee76b6b7a321ff0f94`. Die Commitkennungen unterscheiden sich;
der veroeffentlichte Folgecommit verwendet den veroeffentlichten PR441 Head als
Elterncommit. Kein erneuter Import oder Force Push fuer PR441.

Der ausgewaehlte Pflegebefund im abgeschlossenen 500er Test enthaelt zwei Fehler:
Eine Pflegeleistung wird als Steuerregel beschrieben; ein moeglicher Verfall wird
im Titel als Entzug behauptet. Die fruehere authentifizierte Aufnahme enthaelt
diese Prosa bereits im Wissensobjekt. Titel, Zusammenfassung und Aenderungszeit
stimmen mit der spaeteren fehlerhaften Karte ueberein. Die Aufnahmen sind nicht
gemeinsam transaktional. Andere enthaltene redaktionelle Korrekturtexte sind kein
in diesem Sprint erzeugter oder abgenommener Motorerfolg.

Der erhaltene Quellenstand umfasst genau einen Titel mit ausdruecklichem
Moeglichkeitsvorbehalt, keinen Auszug und keinen document_type. Der zeitgenoessische
Originalvergleich dokumentiert Pflegeversicherungsleistung, Referentenentwurf und
offene Gesetzgebung. Diese Pruefnotiz ist kein historischer Modelleingang. Der
exakte damalige Modellrequest und die rohe Modellantwort fehlen. Das Fehlen von
Eingaben im Paket beweist nicht, dass sie historisch niemals geliefert wurden.
Keine heutige Webseite wurde als damalige Eingabe eingesetzt.

Die Rohbelege bleiben privat. Verwendet wurden aus dem Originalpaket Version18:

| Datei | Aufnahme | SHA256 |
| --- | --- | --- |
| `Qualitaetsbefunde_vertiefte_Apppruefung_20260915.json` | 2026-09-15T13:46:23.393478+00:00 | `b13045a3b4fa8135bb6b47576317d337a990969b7f9171997a5640a92efdca9a` |
| `500_Speicheraufnahme_20260915_nach_Start.json` | 2026-09-15T11:28:53.771564+00:00 | `29a67624117c98955f014680679761baf5b14310d0ed19dd10d9a4a310eab2f2` |

Die ergaenzende authentifizierte Aufnahme vom15.09.2026,04:14:29.833UTC bezieht sich
auf Production Commit `f700c1d139e5eebff2e8865507e32e273dba3e8a`.
`aufnahme.json`: SHA256
`d8bfa6201d2b7d6970eaab30860b04dac02ecdc8e83df846becab812653eaad4`.
`basis.json`: SHA256
`97ff635a0ade052861396ab74c85cdc38c5274ea047b53695c90371a394febaa`.
Ausgewaehltes Wissensobjekt und Quellenliste sind zwischen dekodiertem
`response.rawBody`, `payload` und `basis.json` exakt gleich. Das ist eine
Inhaltskontrolle derselben Aufnahme, kein zusaetzlicher unabhaengiger Zeitbeleg.

## Konkret belegte allgemeine Luecke

Das erhaltene Wissensobjekt nennt in `ausschuesse` und `mentioned_committees` einen
Fachausschuss, der im erhaltenen Quellenstand nicht genannt ist. Die falsche
Sachgebietsdeutung findet sich somit auch in strukturierten Listen wieder. Daraus
folgt nicht, dass die historische Entstehungsursache vollstaendig bewiesen ist.

Die heute reproduzierbare Luecke ist enger: Die gemeinsame Quellenbindung pruefte
Ministerien, Parteien und Personen, aber nicht die beiden Ausschusslisten. Die
Zusammenstellung bereinigt solche Werte nur. Die Klassifikation kann sie danach
als `decision_entities` aufloesen; sie liefert dafuer keinen weiteren Quellenbeleg.
Eine neutrale Antwort mit erfundenem Ausschuss erreichte vor dieser Aenderung den
injizierten Speicher mit `saved`. Die neue Regression scheiterte genau daran auf
unveraendertem PR441 Anwendungscode.

Der Prompt enthielt allgemeine Belegregeln und trennte Beteiligung und Erwaehnung.
Die vorhandenen Aussagenregeln verbieten bereits die Umdeutung eines Vorschlags
zum Vollzug. Deshalb keine weitere allgemeine Regel zu Entwurf oder Steuerleistung.
Die neue Anweisung erklaert ausschliesslich den nun technisch durchgesetzten
Vertrag fuer Ausschusslisten.

## Vor der Aenderung festgelegtes Ergebnis

Eine unbelegte Ausschussbezeichnung in einer der beiden Listen verwirft die ganze
neue Antwort vor Inhaltsspeicherung. Ein gueltiger alter Inhalt bleibt bei
ungueltiger Aktualisierung erhalten. Kein sofortiger Retry und kein weiterer
Modellaufruf. Leere Listen bleiben erlaubt. Ausdruecklich gelieferte Bezeichnungen
aus ausgewaehltem Titel, Auszug oder explizit gebundenem Artikelkontext bleiben
erhalten. Eine Nennung beweist weiterhin weder Beteiligung noch Zustaendigkeit.

## Kleine allgemeine Aenderung

`lib/helmut/akteurslisten-quellenbindung.js` ergaenzt `ausschuesse` und
`mentioned_committees` in der bestehenden Feldliste. Drei Promptsaetze verlangen
die gelieferte Bezeichnung ohne abgeleitete Zustaendigkeit oder erfundene
Kurzformen und unterscheiden Nennung von Beteiligung. Keine neue Pruefkomponente,
kein Artikelname, keine Quellenliste und kein Institutionenverzeichnis.

Die bestehende Anbindung prueft rohe Modellwerte gegen den tatsaechlich
abgesendeten Prompt in Erstverstehen, Aktualisierung und Auswerter. Metadaten,
weggelassene Quellen, Antwortprosa und nachtraeglich geaenderte Dokumente ersetzen
keinen Beleg. Fehler: `quellenbeleg-ausschuesse` beziehungsweise
`quellenbeleg-mentioned_committees`. Die ganze Antwort wird abgelehnt; kein stilles
Entfernen einzelner Werte. Alle bisherigen Schutzregeln bleiben erhalten.

Vier illustrative Goldsetfaelle enthielten nicht genannte Ausschuesse. Nur ihre
acht entsprechenden Listen wurden geleert, Quellen und andere Antwortfelder
blieben exakt erhalten. Der positive Fall mit ausdruecklichem Ausschussnamen ist
unveraendert; zwei zusaetzliche Sicherheitsassertionen pruefen den Erhalt beider
Listen. Keine historische Antwort oder Production Quelle wurde umgeschrieben.

Der erste Gesamtlauf zeigte denselben Widerspruch in den beiden bestehenden
Vertragstests fuer Berlin und Brandenburg: Ihre festen Antworten behaupteten
Ausschussnennungen, die den verwendeten Originalexporten fehlen. Saemtliche
bisherigen fachlichen Assertions bleiben erhalten. Die positiven Durchlaeufe
bekommen jetzt drei unabhaengig von den Antworten formulierte, ausdruecklich als
synthetisch markierte Testauszuege. Zusaetzliche Gegenproben weisen dieselben
Antworten gegen die unveraenderten Originaleingaben ab. XML Dateien, Parser,
Originalobjekte und Modellattrappen bleiben erhalten. Die positiven Durchlaeufe
sind damit ausdruecklich Tests mit ergaenzten synthetischen Eingaben, keine
Fachabnahme ausschliesslich anhand der Originalexporte. Es wird weder eine Quelle
nachtraeglich historisiert noch ein Ausschuss aus Metadaten zugelassen.

Im erneuten Gesamtlauf fiel auch der Pilottest wegen zweier entsprechender
Nennungen auf. Seine Eingaben sind vollstaendig synthetisch und verwenden
`.example` Adressen. Der passende Bundestagsausschuss ist nun im synthetischen
DIP Titel genannt, der passende Landtagsausschuss im synthetischen Medienauszug.
Nur diese zwei Eingabetexte und ein erklaerender Kommentar wurden korrigiert.
Keine Assertion, Modellantwort oder Vergleichsschwelle wurde geaendert.

`vercel.json` sperrt nur das automatische Deployment des eigenen Folgebranches.
Alle anderen Werte einschliesslich der13 Crons bleiben identisch.

## Gezielte Pruefungen

Neue Regression `scripts/ausschuesse-quellenbindung-test.js`: **9/9 Gruppen**.
Sie prueft Erstverstehen und Update, Erhalt bisheriger Inhalte, echte Nennung in
Titel und Auszug, leere und gemischte Listen, rohe ungueltige Werte, Unicode,
Teilwoerter, fehlende Namensformen, Feldgrenzen, Metadaten, nicht ausgewaehlte
Quellen, nachtraegliche Mutation, expliziten Artikelkontext und den Pfad ohne CAS.
18 isolierte Laufzeitaufrufe mit festen Modellattrappen; zusaetzliche synthetische
Auswerterfaelle. Kein echter Modellaufruf und keine Datenbank.

Weil das gemeinsame Pruefmodul erweitert wurde, wurden seine unmittelbar
betroffenen Regressionen gezielt kontrolliert: Ministerien12/12, Parteien9/9 und
Personen10/10. Goldsetstruktur7/7. Sicherheitspruefung338/338. Alle Tests ueber
`node scripts/lokal.js -- node ...` mit technischem Netzschutz.

Nach Korrektur der widerspruechlichen Testeingaben: Berlin79/79,
Brandenburg102/102, Pilot97/97. Die vorhandenen Pruefbedingungen bleiben erhalten; die neuen
Gegenproben und Unveraendertheitskontrollen kommen hinzu.

Der erste lokale Gesamtlauf wurde ohne Abschluss beendet:41 erfolgreiche und
zwei fehlgeschlagene Suiten. Die beiden belegten Fixturefehler sind oben benannt.
Danach blieb der Lauf hinter `briefing-artikelidentitaet-test.js` ohne weiteren
Fortschritt. Die naechste unveraenderte Suite `briefing-aussagenbindung-test.js`
bestand separat15/15 und ueber denselben kanonischen Starter mit `--only`1/1.
Die Ursache des Haengers ist nicht bewiesen. Kein Timeout, Schutz oder
Pruefkriterium wurde veraendert. Weil kein vollstaendiger lokaler Lauf vorlag,
wurde der verbindliche Gesamtlauf am korrigierten Teststand erneut gestartet.

Privater Vergleich mit dem erhaltenen Objekt als fester Modellattrappe:

| Variante | Vorher | Nachher |
| --- | --- | --- |
| Erhaltenes Gesamtobjekt gegen rekonstruierten Prompt | Bereits wegen Parteien und Ministerien ungueltig | Weiter ungueltig; Ausschusspruefung kommt hinzu |
| Kontrollierte Kopie, nur die vier bereits gebundenen Parteien und Ministerienlisten geleert | Gueltig | Wegen beider Ausschusslisten ungueltig |

Die kontrollierte Kopie isoliert die Pruefluecke. Sie ist weder ein historischer
Modellrequest noch eine neue echte Antwort oder korrigierte Karte. Ursprungsdaten
blieben identisch. Die rekonstruierte Quellenzeile blieb vorher und nachher
bytegleich: SHA256 `52026d0a30db298f491f50d9f6b2d8232f7d1c14390008239ce22f08f16bab13`.
Prompt vorher: `291b258b77c3318d317289447a96b88f09a871d026b09d7e05bf0cd60d1b17da`;
nachher: `80fe5c2943490e4c04dd501b8adeffe4bbff76f9eb8e4723d433cfa6e6db2abd`.

## Grenzen, Betriebsstand und Fortsetzung

Zwei weitere neutrale Laufzeitdiagnosen machen die Grenze sichtbar: Ein offener
Entwurf zum moeglichen Verfall eines Bonus bleibt mit korrekter Unsicherheit
speicherbar. Eine absichtlich falsche Antwort mit anderem Sachgebiet und
behaupteter Abschaffung wird bei leeren Akteurslisten ebenfalls als `saved` an
die Speicherattrappe uebergeben. Je genau ein Modellmock und ein Speicheraufruf,
keine echte Modell oder Datenbanknutzung. Keine semantische Antwortsperre behaupten.

Auch die vorausgegangene Gastbeitragsdiagnose bleibt offen: Der bestehende Prompt
trennt Herausgeber und Urheber bereits; falsche Beziehungen in der Prosa werden
technisch nicht allgemein erkannt. Dafuer wurde keine neue Promptregel angelegt.
Private Befundnotiz `Helmut_Gastbeitrag_Diagnose_20260918.md`; kein Production Fix.

Vor Aenderungen Pflichtdokumente und geltende Anweisungen gelesen. Main bleibt
`2d1eb705e00ea5f5ff8f351997e429cc16d195c1`, PR433 bis441 offen und Draft. Keine
konkurrierende Reparatur sichtbar. Keine laufenden Actions, nur die beiden alten
queued Laeufe31128435980 und31126446647 vom06.08. Kein weiterer lokaler Schreiber
sichtbar; globaler Work Sitzungsstatus technisch nicht abfragbar. Fremde55
Vorarbeiten unangetastet. Kein Merge, Deployment, Abruf aktueller Originale,
Modellvergleich, Modellaufruf oder neuer500er Test. Artikelkontext bleibt AUS.

Der erneute verbindliche lokale Gesamtlauf endete mit **415/416 Suiten in801
Sekunden, Exit1**. Einziger Fehler war der oben beschriebene Pilottest. Seine
synthetischen Eingaben wurden nach diesem Einzelbefund noch waehrend des laufenden
Gesamtlaufs korrigiert und die Suite separat97/97 geprueft. Anwendungscode und
Schutzregeln blieben waehrend des Gesamtlaufs unveraendert. Kein lokal gruener
416er Lauf behauptet. Der vollstaendige Nachweis am finalen veroeffentlichten
Stand steht im zugehoerigen Draft PR; keine erneute Wiederholung erfolgreicher
lokaler Suiten. Fuer den Gesamtlauf gilt unveraendert CLAUDE.md Paragraph6.
Kein gruener technischer Lauf ersetzt die offene Fachabnahme.

Naechster noch einzugrenzender Kandidat: Konzerttermin gegen historischen
Rueckblick. Zuerst konkrete erhaltene Ein und Ausgabe sowie Motorpfad feststellen.
Offen bleiben insbesondere Sachgebiet, Vorschlagsstand und Zuschreibungen im
Freitext sowie reale Modellbefolgung und ein neuer gesondert freizugebender500er
Production Nachweis. Rueckweg: ungemergten Folgebranch verwerfen; keine Migration
oder Production Rueckabwicklung erforderlich.
