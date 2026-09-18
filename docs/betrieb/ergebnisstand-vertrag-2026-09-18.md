# Vorbericht und Ergebnisstand im Quellenauftrag unterscheiden

Stand 18.09.2026. Status: teilweise abgeschlossen. Folgebranch
`codex/ergebnisstand-vertrag-20260918` auf PR439
`1686a5086f648bc611f4033160fa068156653674`. Kein Production Nachweis.

## Erhaltener Originalbefund

Ausgewaehlt wurde der offene500er Befund Wahlvorbericht als bekanntgegebenes
Ergebnis aus der [offenen Fachabnahme](artikelidentitaet-2026-09-17.md#offene-fachabnahme).
Das private Originalpaket Version18 enthaelt
`Qualitaetsbefunde_vertiefte_Apppruefung_20260915.json`, erfasst15.09.13:46:23.393478UTC,
SHA256 `b13045a3b4fa8135bb6b47576317d337a990969b7f9171997a5640a92efdca9a`.
Der damalige Originalvergleich beschreibt einen Wahlvorbericht mit Umfragen;
die gespeicherte Karte behauptet dagegen veroeffentlichte Wahlergebnisse,
Auswertung einer Sitzverteilung und daraus abgeleitete Folgen. Der erhaltene
Vergleich ist ein historischer negativer Befund, kein neuer Artikelabruf.

Die authentifizierte `Pruefaufnahme_A001_34984794661.json`, erhoben15.09.14:55:32.669UTC,
SHA256 `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455`,
enthaelt genau eine verknuepfte Quelle mit Titel zur Ausgangslage, `summary=null`.
Der Ergebnisfehler steht bereits in `was_ist_passiert` und `display_summary` des
Wissensobjekts. Weitere Felder behaupten veraenderte Mehrheiten und Koalitionsfolgen.
Die Anzeige muss diesen Fehler also nicht erst erzeugen.

Der Quellenstand belegt weder Ergebnis noch Sitzverteilung oder konkreten
Wahltermin. Der im alten Originalvergleich genannte Termin wird nicht in die
erhaltene Eingabe hineinrekonstruiert. Aufnahme und Bericht sind nicht gemeinsam
transaktional. Exakter historischer Modellrequest und rohe Modellantwort fehlen.
Keine neuen Quellen, privaten Karten oder Profile wurden ins Repository kopiert.
Q006 und seine abgeschlossenen Pruefungen wurden nicht erneut untersucht.

## Belegbare Auftragsluecke und festgelegtes Ergebnis

Der bisherige gemeinsame Quellenvertrag unterscheidet Moeglichkeit, Absicht,
Ankuendigung und Beschluss. PR436 erhaelt Akteur, Handlung und Aussagegrad.
Diese Regeln sind bereits vorhanden und werden nicht als neue Reparatur ausgegeben.
Die konkreten Understanding Feldanweisungen fragen jedoch weiterhin nach einem
bereits passierten Vorgang, einer eingetretenen Entwicklung und einer belegten
Veraenderung. Das steht bei einer blossen Ausgangslage in Spannung zur ebenfalls
vorhandenen Vorgabe, keine Entwicklung zu erzwingen. Die verschiedenen Staende
Vorbericht, Umfrage, Hochrechnung, vorlaeufiges Ergebnis und Endergebnis sind
dort nicht ausdruecklich unterschieden. Das ist eine belegbare Luecke des Auftrags,
keine bewiesene alleinige Ursache der historischen Modellentscheidung.

Vor der Aenderung festgelegt: Belegten Sachstand samt Ereignisphase und
Erkenntnisstand erhalten. Aus Vorbericht und Umfrage kein ausgezaehltes Ergebnis
erfinden; vorlaeufige Angaben nicht endgueltig darstellen. Tatsächlich belegte
Zahlen, Termine und Ergebnisse bleiben konkret moeglich. Rueckblicke bleiben
bei ihrer Wahl. Fehlende Angaben werden nicht aus Metadaten ergaenzt; auch Folgen
und Empfehlungen duerfen den offenen Ausgang nicht als bereits eingetreten behandeln.

## Begrenzte allgemeine Korrektur

Sechs zusaetzliche Saetze in `quellen-zeitvertrag.PROMPT_REGELN` formulieren diesen
Ergebnisstandvertrag. Der bereits vorhandene Anschluss reicht ihn an Understanding,
Lagegeneration und den bestehenden Quellenreview weiter. Es entsteht kein neuer
Pruefer und kein zusaetzlicher Modellaufruf. In `buildUnderstandingPrompt` werden
fuenf Feldsaetze vom vorausgesetzten Vollzug auf den belegten Sachstand umgestellt.

Kein einzelner Artikel, Titel, Herausgeber, Wahltermin oder Ortsname ist verdrahtet.
Quelle und Ergebnis bleiben Daten; keine automatische Wortersetzung. Quellenwahl,
Quellenzeilen, Klassifikation, Schema, Speicherung, Scoring, Cacheversionen,
Fristenschutz, Akteurslistenbindung und Ebenenkonsistenz bleiben unveraendert.
Es gibt keine neue semantische Antwortsperre und keinen automatischen Neuaufbau
alter Wissensobjekte oder gespeicherter Pakete.

## Gezielte Pruefungen und Gegenproben

Neue Suite `scripts/ergebnisstand-vertrag-test.js`:7/7 Gruppen erfolgreich.
Neun neutrale Faelle: Ausgangslage nur im Titel, belegter bevorstehender Termin,
Umfrage, Prognose, Hochrechnung, vorlaeufiges Ergebnis, amtliches Endergebnis,
historischer Vergleich und explizites Endergebnis nur im Titel. Alle neun festen
Antworten bleiben in Erstverstehen, Update und Auswerter erhalten.18 Aufrufe an
injizierte Modellattrappen im Speicherpfad und9 im Auswerter, kein echter Aufruf.
Die drei Promptverbraucher erhalten denselben Vertrag und ihre unveraenderten
Quellfelder. Der explizite Artikelkontext behaelt den bestehenden Bindungsvertrag;
fehlender Auszug bleibt ohne ausdruecklichen Zusatz leer.

Die neue Vertragspruefung scheiterte am unveraenderten PR439 Prompt erwartungsgemaess.
Nach der Aenderung bestand sie. Beim Review wurde die Formulierung fuer fehlende
Wahltermine praezisiert, damit gelieferte Termine ausdruecklich erhalten bleiben;
ein weiterer neutraler positiver Fall belegt dies. Die folgende gezielte Pruefung
bestand erneut alle7 Gruppen. Keine bisherige Abnahme angepasst oder abgeschwaecht.

Privater Vergleich gegen PR439: Die eine erhaltene Quellenzeile bleibt bytegleich.
Die beiden falschen historischen Prosafelder bleiben bei erneuter Assemblierung
unveraendert. Keine korrigierte Production Karte und kein historischer Modellreplay.
Das vollstaendige alte Objekt scheitert schon vor dieser Aenderung an der
bestehenden Parteienbindung, nicht an einer Pruefung seines behaupteten Wahlergebnisses.

Eine unabhaengige neutrale Negativprobe nach der Aenderung liefert bewusst eine
falsche feste Ergebnisantwort auf einen Titel zur Ausgangslage. Mit leeren
Akteurslisten endet der isolierte echte Erstverstehenspfad weiter als `saved`,
genau1 Aufruf der Attrappe und1 Aufruf des injizierten Speichers. Das belegt die
offene Grenze: Der neue Prompt ist keine technische Gewaehr fuer sachliche Wahrheit.
Keine echte Datenbank oder Modellverbindung verwendet.

Der lokale Pflichtlauf gemaess CLAUDE.md Paragraph6 bestand am finalen
Anwendungscode:414/414 Suiten in808 Sekunden, Exit0. Danach nur diesen
Ergebnisabsatz ergaenzt. Alle Tests liefen ueber `scripts/lokal.js`, mit den
vorhandenen Abhaengigkeiten und Chromium, ohne Neuinstallation. Die unabhaengige
CI am veroeffentlichten Head wird im Draft PR dokumentiert, ohne weiteren
Commit nur zum CI Nachtrag.

## Betrieb, Grenzen und naechster Schritt

Vorflug18.09.: main unveraendert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`.
PR433 bis PR439 offen, Draft und ungemergt. PR439 CI35357140672 erfolgreich:
413/413 in791s, Browser50/50, Kontoschutz15/15 samt500 isolierten Registrierungen,
Z22 48/48, alle24 Pflichtschritte. Keine relevante laufende oder wartende Action;
nur die zwei queued Altlaeufe vom06.08. Kein weiterer lokaler Schreiber sichtbar,
globaler Work Sitzungsstatus nicht abfragbar. Fremde55 Vorarbeiten unangetastet.

Automatisches Deployment ausschliesslich dieses Folgebranches gesperrt.
Artikelkontext AUS. Kein Merge, Deployment, Migration, Production Datenaenderung,
Profilwechsel, Cron, Environment oder Azure Aenderung, bezahlter Aufruf oder500er
Test. Rueckweg vor Merge: diesen ungemergten Folgebranch verwerfen.

Echte Modellbefolgung und fachliche Behebung des Wahlfehlers bleiben unbewiesen.
Keine Vollabnahme aus gruenen Attrappen. Naechster begrenzter Block ist die
erhaltene falsche Personenzuschreibung: erst verfuegbare Eingabe und Ausgabe sowie
Motorpfad pruefen. Fehlende historische Eingaben offen benennen. Weitere
Promptregeln sind kein Ersatz fuer die spaeter gesondert freizugebende Fachabnahme.
Der vollstaendige neue500er Production Nachweis ist nicht freigegeben und nicht erbracht.
