# Ganze Aussagen an den Speichergrenzen

19.09.2026. Status **teilweise abgeschlossen**. Kleine deterministische
Reparatur auf `codex/prosa-textgrenzen-20260919`, Basis Main nach PR451
`2d239abca16e54371e102ff69384f6c981f86ff1`. Keine erneute Modellserie.

## Beleg und Entscheidung

Der gemeinsame `cleanEntry` schnitt Zeichen blind ab. Ein440 Zeichen langer
synthetischer Gegenfall beginnt mit einem behaupteten Beschluss und nimmt
ihn am Ende ausdruecklich zurueck. Nach dem Speichern als `display_summary`
bleiben320 Zeichen ohne diese Einschraenkung uebrig. Der bestehende
Validator prueft die bereits verkuerzte Form; der fehlerhafte Praefix ist
strukturell gueltig. Erstverstehen, Update und Auswerter benutzen denselben
Assembler. Kernprosa, Listen und strukturierte Handlungen sind ebenso betroffen.

Ein weiterer Modellaufruf ist dafuer unnoetig. Abschneiden an Satzgrenzen
waere keine allgemeine Loesung: auch ein spaeterer ganzer Satz kann den
vorigen einschraenken. Die bisherigen Laengenobergrenzen werden weder
erhoeht noch abgeschafft. Das kleinste sichere Verhalten ist, niemals einen
zu langen Text in eine kuerzere Tatsachenbehauptung umzuwandeln.

## Korrektur

Texte innerhalb ihrer Grenze bleiben nach derselben bisherigen Leerraum und
Steuerzeichenbereinigung unveraendert. Ueberlange optionale Einzelwerte
bleiben leer; die uebrige gueltige Analyse bleibt erhalten. Nichtleere
Pflichtprosa bleibt Pflicht: ein zu langer Kerntext wird am bestehenden
Validator sichtbar abgewiesen. Ein Update behaelt dabei den vorherigen
Inhalt; kein zweiter Modellaufruf wird freigegeben. Das ist keine allgemeine
Loeschregel fuer unbelegte Bedeutung und keine Quellenwahrheitsentscheidung.

Listeneintraege bleiben ganz oder entfallen einzeln. Eine strukturierte
Handlung mit ueberlangem Titel, Beschreibung oder Frist entfaellt als
Eintrag, damit ihr Titel nicht ohne verlorene Voraussetzung stehen bleibt.
Andere vollstaendige Handlungen bleiben erhalten. Eine vorhandene, aber
zu lange strukturierte Kommunikationslinie gilt nicht als fehlend und wird
nicht still durch die kuerzere Altlinie ersetzt. Wirklich fehlende Linien
behalten den bisherigen kompatiblen Rueckfall.

Keine historischen Quellen oder Mandate im Reparaturcode, keine neue
Abhaengigkeit, Datenbankmigration, Environmentaenderung oder Modellkosten.
Bestehende gespeicherte Inhalte werden nicht automatisch umgeschrieben.
Der fehlgeschlagene Quellenpruefer aus PR452 wird nur dokumentiert, nicht
in die Anwendung oder den neuen Branch uebernommen.

## Nachweis

Vor der Korrektur:1 positive Gruppe bestanden,7 negative Gruppen gescheitert.
Danach8/8 Gruppen bestanden: alle betroffenen Textarten, Erstverstehen und
Update mit echtem Orchestrierungscode/CAS Vertrag bei lokal ersetztem
Speicher und Modell, Schutz des alten Inhalts, optionale Darstellung ohne
Verlust der ganzen Kernanalyse, exakte Grenzwerte und gemeinsamer Auswerter.
Bestehender Aussagen-/Fristenvertrag6/6 und Ebenenkonsistenz8/8 unveraendert
erfolgreich. Bestehende Feldpruefung72/72: die fruehere Erwartung eines
gekappten action_item wurde durch einen staerkeren Vertrag ersetzt, der
den vollstaendigen positiven zweiten Eintrag exakt erhaelt und keinen
Teiltext des ungueltigen ersten Eintrags annimmt. Keine Assertion entfernt.
Alle Tests ueber `scripts/lokal.js`, null echte Modellaufrufe.

Erster kanonischer Gesamtlauf:419/422 in635s. Zwei Browserpruefungen
scheiterten am fehlenden lokalen PLAYWRIGHT_BROWSERS_PATH; der vorhandene
Browser wird im erneuten Aufruf explizit gebunden. Die dritte rote Suite
`lage-test.js` erwartete noch den bisherigen why_relevant Praefix. Diese
Assertion verlangt jetzt das leere ungueltige Feld; der vollstaendige positive
Summary Wert bleibt daneben unveraendert getestet. Danach141/141 Lage
Assertions erfolgreich. Keine Produktionsumgebung wird veraendert.

Rein lesende SQL Aufnahme14:46:34 UTC: die114 Wissensobjekte aus den letzten
500 historischen Mandatspaketen ueberschreiten keine der neun untersuchten
Kern-/Prosagrenzen. Ein Kommunikationsfeld ist genau240 Zeichen lang; das
beweist fuer sich keinen Abbruch. Auch173 verknuepfte Quelldokumente haben
keinen Titel ueber600, Auszug ueber1400 oder Herausgeber ueber160 Zeichen.
Der synthetische Fehlerbeleg ist kein Nachweis eines bereits eingetretenen
Schadens in dieser historischen Menge.

Erneuter kanonischer Gesamtlauf mit korrekt gebundenem lokalem Browser:
**422/422 Suiten erfolgreich in641s**, Exit0. Anwendungscode seit Laufbeginn
unveraendert. PR CI, Merge und Production Nachkontrolle stehen aus.
Ein fachlicher500er Nachweis und eine allgemeine semantische Prosaabsicherung
sind damit nicht erbracht. Rein lokale Gegenprobe der Folgepfade:543 Zeichen
mit abschliessender Verneinung werden in Mandatsummary199, Entscheidungsrisiko239
und Lageersatztitel82 Zeichen ohne Verneinung ausgegeben; ein langer
Quellenauszug endet nach1400 Zeichen ebenso ohne seine Verneinung. Diese
Schwesterpfade werden im naechsten kleinen Sprint behandelt. Der sichere
0→500→0 Testweg bleibt danach mit expliziter Zielmenge und auswertbarem Ende
vorzubereiten.

## Risiko und Rueckweg

Ueberlange bislang still angenommene Kerntexte werden kuenftig sichtbar
abgewiesen. Das kann die Zahl speicherbarer Antworten reduzieren; es
verhindert einen falschen Erfolg mit veraenderter Bedeutung. Optionale
Felder duerfen weiterhin fehlen, gueltige Textlaengen werden nicht enger.
Rueckweg ist ein gezielter Code Revert; gespeicherte Profile, Konten,
Sessions, Quellen und Kostenhistorie brauchen keinen Datenrollback.
