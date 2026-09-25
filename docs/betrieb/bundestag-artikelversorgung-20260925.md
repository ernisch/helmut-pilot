# Amtliche Artikelkontexte fuer die frische Versorgung

25.09.2026, Code lokal geprueft; noch kein Import oder Modelllauf.

## Konkreter Blocker und Reparatur

Der amtliche Feed `https://www.bundestag.de/static/appdata/includes/rss/aktuellethemen.rss`
lieferte um12:44:58UTC15 Meldungen, davon11 mit nach dem bestehenden Vertrag
brauchbarem kurzem Auszug. Der bisherige Artikelkontextleser lehnte alle11
Originalantworten mit `strukturierter-artikel-mehrdeutig-oder-fehlend` ab:
Die Bundestagsseiten liefern kein Article-JSON-LD. Kurze Feedtexte allein
enthalten vielfach keine ausdrueckliche Ausschussueberweisung.

Der neue reine Leser gilt nur fuer HTTPS-Textarchivartikel auf bundestag.de.
Er bindet die Antwortadresse, alle gespeicherten Quelladressen, og:url,
og:type, den Metadatentitel, eine eindeutig passende vollstaendige H1 und
den Berliner Publikationstag. Amtlich gekuerzte og:Titel gelten nur als
langer exakter Praefix; die H1 muss immer vollstaendig passen.

Mehrere Beratungen auf derselben Seite werden anhand der H1 getrennt.
Verschachtelte Rednerartikel und Randspalten gelangen nicht in den Text.
Genau der erste Absatz des eindeutig gebundenen Berichts wird uebernommen:
vollstaendig, unveraendert und hoechstens600 Zeichen. Kurze Hinweise, leere,
versteckte oder zu lange erste Absaetze sperren den Zusatz; kein Wechsel
auf einen spaeteren passenden Absatz. Nur der exakt markierte Bedienhinweis
an Dokumentlinks entfaellt. Der Herkunftsbeleg hat einen eigenen Methodennamen,
Antwort-/Textfingerabdruck und unveraenderte Quellenbindung.

Die Artikelidentitaet wird hier durch vollstaendige Ueberschrift und
Metadaten belegt. Ein Mindestworttreffer zwischen Ueberschrift und erstem
Absatz ist deshalb kein zusaetzlicher Auswahlgrund. Die tatsaechliche
Worttrefferzahl bleibt im Beleg, auch0; sie wird nicht auf2 hochgesetzt.
Die bisherige Auswahl fuer andere Herausgeber bleibt unveraendert.

## Begrenzter Quellenbefund

Alle15 amtlich verlinkten Originalseiten einmal oeffentlich gelesen,
je Abruf15 Sekunden/1MB, keine Weiterleitungen oder automatischen Retries.
Die elf bereits brauchbaren Feedeingaben wurden lokal gegen die gesicherten
Antworten verglichen: sieben gebundene Leitabsaetze gewonnen; zweimal
`absatz-zu-lang`, einmal `artikeltitel-abweichend`, einmal
`leitabsatz-nicht-nutzbar`. Insbesondere wird eine inzwischen geaenderte
Ueberschrift nicht still an den alten Feedtitel angepasst.

Dies belegt nur die lokale Originalgewinnung. Keine500er Vollversorgung,
keine Modellqualitaet und kein positiver sichtbarer Drei-Bereiche-Nachweis.
Keine Quelltexte oder HTML-Antworten im Repository. Private Aufnahme:
`/private/tmp/helmut-bundestag-artikelkontext-probe.json`.

## Pruefung und naechster Schritt

Gezielt ueber den Offline-Runner: neue Bundestagssuite10/10 Gruppen,
bestehende Gewinnung11/11, Beschaffung12/12, Kontextvertrag10/10,
Anschluss20/20. Geprueft: falsche Titel/Adressen/Datumswerte, mehrere Tabs,
verschachtelte Artikel, versteckte Eltern,600-Zeichen-Grenze, keine
Ersatzwahl, Metadatenkuerzung, Herkunftsmanipulation und Berliner Tagesgrenze.

Keine Flags, Katalogwege, Daten oder Crons geaendert. Der regulaere
automatische Anschluss bleibt auf direkte Medienartikel begrenzt; der
neue amtliche Leser wird dadurch nicht implizit aktiviert. Naechster Schritt:
die sieben Quellen mit ihren exakt gewonnenen Belegen in einem eigenen
begrenzten Aufnahme-/Verstehensauftrag binden. Keine Wiederverwendung der
verbrauchten30er/169er Vertraege. Rueckweg fuer diesen Code: PR revertieren;
noch keine neuen Daten oder kostenpflichtigen Laeufe aus dieser Reparatur.

## Uebernommener Productionstand

PR570 nach Pflicht-CI36136628990 erfolgreich gemergt12:51:50UTC als
`b3942c9ce4b44a6eed6b7f4314229e2f9da3143f`. Deployment
`dpl_DyTLwHDJ87x7kWy4pYFHttNaH1Zf` READY12:52:07UTC;
keine Error/Fatal-Protokolle bis12:53:13UTC. Reiner Dokumentationsabschluss,
kein neuer Profil- oder Funktionslauf.
