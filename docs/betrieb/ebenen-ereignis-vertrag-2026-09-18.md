# Politische Ebene und Ereignis quellentreu zuordnen

Stand 18.09.2026. Status: teilweise abgeschlossen. Folgebranch
`codex/ebenen-ereignis-vertrag-20260918` auf PR437
`3fba735354f4de13c27e3f72c65bec44e565c5b4`. Kein Production Nachweis.

## Erhaltener Befund und Beleggrenze

Ausgewaehlt wurde ausschliesslich der offene Befund Bundeskoalition als
Landeskoalitionsbildung aus der [offenen Fachabnahme](artikelidentitaet-2026-09-17.md#offene-fachabnahme).
Q006 und seine abgeschlossenen Pruefungen wurden nicht erneut bearbeitet.

Das private Originalpaket Version18 enthaelt in
`Qualitaetsbefunde_Ebenen_und_Gegenpruefung_20260915.json` den damaligen
Originalvergleich: Der gelesene Artikel behandelt die bestehende Bundesregierung;
die gespeicherte Karte beschreibt dagegen regionale Koalitionsoptionen und
Verhandlungsbedingungen. Dieser Vergleich wird als erhaltener Befund uebernommen,
nicht als neuer Artikelabruf oder gesicherter historischer Volltext ausgegeben.

Die authentifizierte `Pruefaufnahme_A001_34984794661.json` vom15.09.14:55:32.669UTC,
SHA256 `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455`,
enthaelt Karte, Wissensobjekt und genau eine verknuepfte Quelle mit Titel ohne
Auszug. Die falsche Darstellung steht bereits in `display_summary`, `warum_wichtig`
und weiteren Wissensfeldern. `decision_level` und `political_level` sind `land`,
mit `classification_confidence.level_quelle=ki`. Die Anzeige erzeugt diesen
Ebenenwechsel nicht erst selbst.

Die fruehere Aufnahme im privaten `Helmut_B055_Belege_20260915.zip`, `basis.json`,
enthaelt fuer diesen Vorgang dieselbe Quelle ohne Auszug und denselben Objektstand.
Sie liefert keinen fehlenden Artikelabsatz. Beide Aufnahmen sind nicht gemeinsam
transaktional. Der exakte historische Modellrequest und die rohe damalige
Modellantwort fehlen. Keine neue Quelle wurde als historische Eingabe eingesetzt;
keine privaten Karten, Profile oder Rohantworten ins Repository kopiert.

## Ursache im Auftrag und festgelegtes Ergebnis

Die bestehende allgemeine Belegpflicht ist vorhanden. Die konkrete politische
Feldanweisung ordnet jedoch Institutionsnamen unmittelbar einer Ebene zu und
stellt nachgelagerte deterministische Ergaenzung in Aussicht. Sie verlangt dort
keinen handelnden Akteur mit belegter Rolle. Anlass einer Meldung, erwaehnte
Regionalwahl, Schauplatz und eigentliches Ereignis werden nicht explizit getrennt.
Das ist eine belegbare Luecke des Auftrags, keine bewiesene alleinige Ursache der
historischen Modellentscheidung.

Vor der Aenderung festgelegt: Ebene, Akteur und Handlung zusammen erhalten.
Ein regionaler Anlass macht einen Bundesvorgang nicht zur Landespolitik.
Eine Wahl oder ein Streit in einer bestehenden Regierung belegt keine neue
Regierungsbildung. Ist die Hauptrolle aus dem gelieferten Text nicht bestimmbar,
im Auftrag `unknown` verlangen und auch im Freitext keine Ersatzebene erfinden.
Eindeutig belegte Bundespolitik, Landespolitik und Kommunalpolitik muessen
weiterhin konkret formulierbar und speicherbar bleiben.

## Begrenzte allgemeine Korrektur

Nur `buildUnderstandingPrompt` im bestehenden Fachmodul geaendert. Der gemeinsame
Ebenen und Ereignisvertrag gilt fuer freie und strukturierte Felder. Die alten
pauschalen Institutionenpfeile werden durch Rollenbedingungen ersetzt; mehrdeutige
Institutionsnamen ohne Kontext erhalten keine feste Ebene. Hintergrund, Vergleich
und Adressat sind keine automatische Entscheidungsebene.

Kein Artikel, Titel, Herausgeber oder Bundesland ist als Sonderfall verdrahtet.
Erstverstehen, Pending, Aktualisierung und Auswerter verwenden denselben Auftrag.
Quellenzeilen, Auswahl, Schema, Klassifikation, Gedaechtnis, Speicherung, Bewertung,
Fristenschutz und die Quellenbindung der vier Akteurslisten bleiben unveraendert.
Keine neue semantische Antwortsperre, kein zusaetzlicher Modellaufruf oder Retry.

## Pruefungen und ausdruecklich offene Grenzen

Neue Suite `scripts/understanding-ebenen-ereignis-test.js`:5/5 Gruppen erfolgreich.
Vier neutrale Faelle: offener Koalitionsstreit nur im Titel sowie Bundespolitik,
Landespolitik und Kommunalpolitik mit jeweils einer anderen Ebene als Hintergrund.
Alle vier durchlaufen Erstverstehen und Update mit und ohne expliziten Kontext,
insgesamt16 isolierte Aufrufkombinationen. Jeweils genau eine feste Modellattrappe,
korrekte Prosa und Ebene gespeichert, Eingaben und Bestand unveraendert. Auswerter
prueft dieselben vier Antworten. Metadaten und ungenutzter Volltext ergaenzen keinen
fehlenden Auszug. Keine Fachbehauptung aus Attrappen.

Am unveraenderten PR437 Auftrag scheiterte die neue Vertragspruefung erwartungsgemaess.
Der erste Lauf nach der Korrektur scheiterte an zwei leeren Pflichtfeldern der neuen
Testattrappe. Diese wurden durch ausdrueckliche Nichtableitbarkeit befuellt;
Schema und Abnahmen unveraendert. Der folgende Lauf bestand alle5 Gruppen.

Gezielter privater Replay: Die eine erhaltene Quellenzeile bleibt gegen PR437
bytegleich. Die falsche gespeicherte Zusammenfassung bleibt bei erneuter
Assemblierung unveraendert; keine nachtraegliche redaktionelle Korrektur. Das
gesamte alte Objekt wuerde an der bereits bestehenden Parteienbindung abgewiesen.
Dies ist eine Gegenprobe mit dem erhaltenen Objekt, kein historischer Modellrequest
und kein Nachweis einer verbesserten neuen Antwort.

Zwei gezielte neutrale Gegenproben begrenzen die Aussage dieses Sprints:

1. Eine feste falsche Modellantwort mit Landesregierung zu einer expliziten
   Bundesquelle besteht weiterhin die Formpruefung, wenn die vier gebundenen
   Akteurslisten leer sind. Keine allgemeine semantische Quellenpruefung vorhanden.
2. Bei vorhandenem KI Ebenenwert `land` und neuer Antwort `bund` erhaelt die
   Assemblierung den alten Wert `land`, obwohl die neue Prosa Bundespolitik
   beschreibt. Das ist der bestehende gleichrangige Gedaechtnisvertrag, kein
   neuer Defekt dieses Prompts. Die Probe schreibt keine Daten. Ein spaeterer
   fachlicher Neuaufbau darf deshalb nicht allein auf einen normalen Updatepfad
   als Ebenenkorrektur vertrauen. Im historischen Fall ist kein solcher neuer
   Korrekturversuch nachgewiesen.

Die reale Modellbefolgung und die fachliche Behebung des Originalfehlers sind
offen. Aus dem erhaltenen Titel allein laesst sich die korrekte Bundesebene nicht
belastbar rekonstruieren. Eine weitere Promptregel ist keine allgemeine Garantie.

Der lokale Pflichtlauf gemaess CLAUDE.md Paragraph6 bestand am finalen
Anwendungscode:412/412 Suiten in845 Sekunden, Exit0. Danach nur diesen
Ergebnisabsatz ergaenzt; Diff und Statusgroesse abschliessend geprueft.
Alle Testprozesse liefen ueber `scripts/lokal.js`, mit vorhandenen Abhaengigkeiten
und Chromium, ohne Neuinstallation. Der unabhaengige CI Nachweis am veroeffentlichten
Head wird im Draft PR dokumentiert; kein weiterer Commit nur zum Nachtragen der CI.

## Vorflug, Betrieb und naechster Schritt

Rein lesender Vorflug18.09.: main unveraendert
`2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. PR433 bis PR437 offen, Draft,
ungemergt und auf den uebergebenen Heads. PR437 CI35348570671 erfolgreich.
Keine relevante laufende oder wartende Action, nur die beiden queued Altlaeufe
vom06.08. Kein weiterer lokaler Schreiber sichtbar. Globaler Work Sitzungsstatus
nicht abfragbar. Eigene saubere Kopie aus PR437; fremde55 Vorarbeiten unangetastet.
Keine neue Datenbankaufnahme und keine neue Production Zustandsbehauptung.

Automatisches Deployment ausschliesslich des neuen Branches in `vercel.json`
gesperrt. Alle13 Crons und andere Einstellungen identisch. Artikelkontext AUS.
Kein Merge, Deployment, Migration, Profilwechsel, Production Datenaenderung,
Environment oder Azure Aenderung, bezahlter Aufruf oder500er Test.
Rueckweg vor Merge: ausschliesslich diesen ungemergten Folgebranch verwerfen.

Naechster kleiner Block: den jetzt neutral reproduzierten Widerspruch zwischen
neuer Prosa und erhaltener politischer Ebene gezielt untersuchen. Vor einer
Korrektur den Bestandsschutz erhalten und einen eindeutigen Quellenvertrag
festlegen; keine blinde Vorrangregel fuer die jeweils neueste Modellantwort.
Keine zweite semantische Vollpruefung behaupten. Weitere Originalfehler bleiben
gesondert offen. Production Wirkung und neuer500er Nachweis benoetigen eine
spaetere ausdrueckliche Freigabe.
