# Personennamen vor Speicherung an gelieferte Quellen binden

Stand 18.09.2026. Status: teilweise abgeschlossen. Folgebranch
`codex/personen-quellenbindung-20260918` auf PR440
`f166db871ec82deb81a309ee76b6b7a321ff0f94`. Kein Production Nachweis.

## Originalbefund und erhaltene Eingabegrenze

Untersucht wurde die falsche Personenzuschreibung aus der
[offenen Fachabnahme](artikelidentitaet-2026-09-17.md#offene-fachabnahme).
Das private Originalpaket Version18 enthaelt
`Qualitaetsbefunde_vertiefte_Apppruefung_20260915.json`, erfasst am
15.09.2026 um13:46:23.393478UTC, SHA256
`b13045a3b4fa8135bb6b47576317d337a990969b7f9171997a5640a92efdca9a`.
Der damalige Originalvergleich belegt einen falschen Vornamen und die falsche
Einordnung als innerparteilicher Konflikt statt Kritik zwischen zwei Parteien.
Dies ist ein erhaltener negativer Originalvergleich, kein neuer Quellenabruf.

Die Originalkarte stimmt vollstaendig mit der Karte in
`500_Speicheraufnahme_20260915_nach_Start.json` ueberein, Aufnahme
15.09.2026 um11:28:53.771564UTC, SHA256
`29a67624117c98955f014680679761baf5b14310d0ed19dd10d9a4a310eab2f2`.
Auch die dort gespeicherte personalisierte Empfehlung traegt denselben falschen
Kurztext. Die Karte zeigt genau einen Quellentitel mit Nachnamen und einen leeren
Auszug. Ihre Quellenanzeige ist kein vollstaendiger historischer Modellrequest.

Die gezielte Suche nach Person und Vorgangskennung in den JSON Dateien dieses
Pakets findet den Fall nur in diesen beiden Dateien. Die anschliessende Suche
im ergaenzenden `Helmut_B055_Belege_20260915.zip` findet aber das globale
Wissensobjekt und eine verknuepfte Quelle in der authentifizierten Aufnahme vom
15.09.2026 um04:14:29.833UTC. SHA256 `aufnahme.json`:
`d8bfa6201d2b7d6970eaab30860b04dac02ecdc8e83df846becab812653eaad4`;
`basis.json`: `97ff635a0ade052861396ab74c85cdc38c5274ea047b53695c90371a394febaa`.
Dieselbe Quelle und dasselbe Objekt stimmen zwischen der unveraenderten
`response.rawBody`, dem dekodierten `payload` und `basis.json` vollstaendig ueberein.

Der falsche Vorname steht bereits in `mentioned_people`, `was_ist_passiert` und
`display_summary`; die falsche innerparteiliche Beziehung steht ebenfalls im
Wissensobjekt. Sein Kurztext und Aenderungszeitpunkt stimmen exakt mit der
spaeteren gespeicherten Empfehlung ueberein. Die eine erhaltene Quelle enthaelt
beide Nachnamen im Titel und `summary=null`, jedoch keinen der ausgegebenen
Vornamen. Auch ein sachlich richtiger Vorname ist damit nicht quellenbelegt.

Diese Aufnahmen sind nicht gemeinsam transaktional. Exakter historischer
Modellrequest und rohe Modellantwort fehlen weiterhin. Aus ihrem Fehlen folgt
nicht, dass damals nie weitere Eingaben geliefert wurden. Keine aktuelle Quelle
wird als historische Eingabe ausgegeben. Private Inhalte und Profile bleiben
ausserhalb des Repositorys; keine korrigierte Production Karte behauptet.

## Unabhaengig belegte technische Luecke

`assembleKnowledgeObject` uebernimmt `mentioned_people` und `mentioned_mps`
aus der Antwort nach Sanitisierung. `validateKnowledgeObject` prueft deren Form,
der gemeinsame Quellenvalidator erfasste bisher nur Ministerien und Parteien.
Ein neutraler Lauf mit einem erfundenen Vornamen zu einem blossen Nachnamen im
Quellentitel beziehungsweise Auszug erreicht vor der Aenderung den injizierten
Speicher. Die neue Regression mit dem echten Erstverstehenspfad und injiziertem
CAS Speicher endet am unveraenderten PR440 Anwendungscode mit `saved` statt
`skipped-invalid`. Kein echtes Modell, keine Datenbank und kein privater Fall
wurden dafuer verwendet. Eine vorangehende Probe ohne CAS erreichte ebenfalls
den Speicheranschluss, meldete wegen der nur booleschen Speicherattrappe aber
`skipped-store`; sie wird nicht als erfolgreicher Speicherabschluss gezaehlt.

Das ist ein eigener Laufzeitbeleg fuer unbelegte strukturierte Personennennungen,
kein Beweis, dass der historische Prosafehler durch eine solche Liste entstand.
Der bestehende Anzeigeadapter `buildPersonMentions` bindet seine Personenzaehler
bereits an geladene Quelltexte; er wird nicht geaendert. Dieser Schutz prueft
jedoch weder die eingehende Modellantwort noch den gesamten Kartenfliesstext.

Vor der Korrektur festgelegt: Beide Personenlisten duerfen nur Namensformen
enthalten, die in einem tatsaechlich abgesendeten Titel, Auszug oder explizit
gebundenen Artikelabsatz vorkommen. Ein unbelegter Zusatz verwirft die gesamte
neue Antwort vor Inhaltsspeicherung. Vorhandene Inhalte und Versionen bleiben
beim ungueltigen Update erhalten. Belegte Namen, Initialen und Nachnamen muessen
weiterhin unveraendert speicherbar sein. Keine Ergaenzung oder automatische
Namenskorrektur, kein Personenverzeichnis und keine Einzelfallregel.

## Begrenzte allgemeine Reparatur

`lib/helmut/akteurslisten-quellenbindung.js` nimmt die beiden Personenlisten in
die bestehende Pruefung auf. Pruefverfahren und Bindung an den abgesendeten Prompt
bleiben identisch: Unicode NFC, Grossschreibung und Leerraum normalisieren;
Wortgrenzen verlangen; getrennte Textfelder nicht verbinden. Metadaten, URLs,
Antworttexte, nicht ausgewaehlte Quellen und nachtraeglich veraenderte Eingaben
ersetzen keinen Beleg. Geprueft wird die rohe Antwort vor deren Sanitisierung.

Drei Listenanweisungen erklaeren die Namensbindung und den Unterschied zwischen
Namensnennung, amtlicher Rolle, Mandat und Partei. Das bisherige Promptbeispiel
`Name (MdB)` wird durch quellenbelegte Namensformen ersetzt, damit es keine
unbelegte Ergaenzung nahelegt. Die bestehenden Regeln fuer oeffentliche politische
Akteure bleiben erhalten. Die neue technische Pruefung beweist nur die Nennung,
nicht eine Rolle oder Beziehung.

Erstverstehen einschliesslich Pending, Update und Auswerter nutzen die gemeinsame
Validierung. Fehler heissen `quellenbeleg-mentioned_people` beziehungsweise
`quellenbeleg-mentioned_mps`. Der bestehende Invalidpfad verwirft die ganze neue
Antwort, statt nur Listen zu leeren und abhaengige Aussagen beizubehalten.
Bestehende Fehlermarkierung, Updatevormerkung und CAS Behandlung bleiben gleich.
Kein zusaetzlicher Modellaufruf und kein unmittelbarer Retry.

## Gezielte Nachweise und offene Grenze

Neue Suite `scripts/personen-quellenbindung-test.js`:10/10 Gruppen erfolgreich.
Sie prueft beide Listen in Erstverstehen und Update, neutrale positive Namen aus
Titel, Auszug und gebundenem Kontext, leere und gemischte Listen, falsche
Vornamen, Teilworttreffer, erfundene Rollenlabels, nicht gelieferte Initialen,
Unicode, Quellenlimit, Metadaten, nachtraegliche Eingabemutation und den Pfad
ohne CAS. Belegte Initialen, Nachnamen und bereits gelieferte Rollenlabels
bleiben erhalten. Der erste Lauf scheiterte vor der Motoraenderung erwartungsgemaess
mit `saved`; nach Korrektur eines falsch uebertragenen neutralen Testtextes
bestehen alle10 Gruppen. Keine bestehende Abnahme wurde angepasst.

Wegen der gemeinsam geaenderten Pruefung erneut gezielt geprueft:
Parteien9/9, Ministerien12/12. Keine Schutzregel oder Abnahmeschwelle geaendert.
Alle Tests laufen ueber `node scripts/lokal.js -- node ...`.

Eine unabhaengige Negativprobe am korrigierten Motor liefert denselben erfundenen
Vornamen ausschliesslich im Fliesstext, beide Personenlisten leer. Der echte
Erstverstehenspfad endet weiterhin mit `saved`: genau1 Modellattrappe und1
injizierter Speicheraufruf. Die Listenbindung ist also keine semantische
Freitextpruefung. Auch eine falsch zugeschriebene Rolle oder innerparteiliche
Beziehung kann bei belegten Namen bestehen bleiben. Der historische Personenfehler
ist dadurch nicht fachlich abgenommen oder nachtraeglich korrigiert.

Privater diagnostischer Vergleich mit dem spaeter aufgefundenen Originalobjekt:
Der alte PR440 Listenvalidator akzeptiert dessen Listen gegen den aus der
erhaltenen Quelle rekonstruierten Prompt; der neue lehnt mit
`quellenbeleg-mentioned_people` ab. Das gespeicherte Objekt als feste Antwortattrappe
im aktuellen Erstverstehenspfad wird mit demselben Fehler vor dem Speicher verworfen:
`skipped-invalid`, genau1 Attrappenaufruf,0 Speicheraufrufe. Das ist kein Replay
einer erhaltenen rohen Modellantwort und kein historischer Modellrequest.
Die Quelle bleibt unveraendert; der Fehler wird abgewiesen, nicht redaktionell
korrigiert. Der bereits abgeschlossene Q006 Befund wurde nicht erneut untersucht.

Der verpflichtende lokale Gesamtlauf endete mit414/415 Suiten in820 Sekunden,
Exit1. Einziger Fehler: `p1-security-check.js` erwartete sieben gueltige feste
Beispielantworten, eine davon ergaenzte jedoch in `mentioned_mps` den nicht
gelieferten Zusatz `(MdB)` am quellenbelegten Namen. Ausschliesslich dieser
Zusatz wurde in `scripts/goldset/understanding-goldset.json` entfernt. Der
Personenfall, sein Name, seine Quelle und alle sieben Faelle bleiben erhalten.
Zwei neue Sicherheitsabnahmen pruefen den unveraenderten Namen in beiden Listen.
Keine bestehende Pruefbedingung wurde abgeschwaecht.

Gezielte Nachpruefung:336/336 Sicherheitschecks und7/7 Goldsetfaelle erfolgreich.
Der Anwendungscode ist im Gesamtlauf und den Nachpruefungen identisch. Kein
behaupteter lokal gruener415er Lauf und keine Wiederholung aller Suiten nur
wegen Testdaten und Dokumentation. Die vollstaendige Pflicht CI am
veroeffentlichten Head bleibt fuer den Abschluss erforderlich und wird im
Draft PR dokumentiert, ohne weiteren Commit nur zum CI Nachtrag.

## Betrieb, Risiken und Fortsetzung

Vorflug18.09.: main unveraendert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`.
PR433 bis PR440 offen, Draft und ungemergt. PR440 Head und Tree stimmen lokal
und veroeffentlicht ueberein. Keine relevante laufende Action, nur die beiden
queued Altlaeufe vom06.08. Kein weiterer lokaler Schreiber sichtbar; globale
Work Sitzungen sind technisch nicht abfragbar. Fremde55 Vorarbeiten unangetastet.

Die woertliche Bindung kann sachlich richtige, aber nicht gelieferte Namensformen,
Flexionen, Uebersetzungen oder Rollenlabels ablehnen. Der Prompt verlangt deshalb
die gelieferte Form. Moegliche Versorgungsluecken bleiben sichtbar. Alte Objekte,
Karten und deren Freitexte werden nicht neu aufgebaut. Quellenwahl, Scoring,
Schema, Klassifikation, Fristenschutz und Speichervertrag bleiben unveraendert.

Automatische Deployments ausschliesslich dieses Folgebranches gesperrt.
Artikelkontext AUS. Kein Merge, Deployment, Migration, Production Datenzugriff,
Profilwechsel, Cron, Environment oder Azure Aenderung, bezahlter Modellaufruf
oder neuer500er Test. Rueckweg vor Merge: diesen ungemergten Folgebranch verwerfen.

Naechster kleiner Block: den erhaltenen Befund Gastbeitrag als Position der
Zeitung anhand der vorhandenen Aufnahme und des Motorpfads eingrenzen. Die
allgemeine Urheberregel existiert bereits; keine weitere Promptregel ohne
konkrete belegte Luecke. Exakten historischen Request und rekonstruierte Eingabe
weiterhin trennen. Echte fachliche Reparatur und neuer vollstaendiger500er
Production Nachweis bleiben offen und gesondert freizugeben.
