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


## Integration und Production Nachkontrolle PR453

[PR453](https://github.com/ernisch/helmut-pilot/pull/453), Head
`3a809cf4582c69e5016d520da5224be2712081f4`, vollstaendig abgenommen:
[CI35450471420](https://github.com/ernisch/helmut-pilot/actions/runs/35450471420)
422/422 Suiten in781s, Browser50/50, Kontoschutz15/15 mit500 isolierten
Registrierungen, JSONB Projektion und Z22 PASS48/FAIL0. Beide Pflichtjobs,
alle24 Schritte erfolgreich. Merge nach interner Pruefung von Notwendigkeit,
enger Wirkung, Ablehnungsrisiko, Code Revert und lesender Nachkontrolle.

Main `bac15b61fa774f87281dd9be54ecd7f0a2f5ba24`, identischer gepruefter Baum
`12cf602384501d47c4d95f70de242d71ce3cc584`. Production READY
`dpl_FDd46nxic1tmcDGH9URTj7aGnarG` um15:18:06 UTC, Hauptalias
`helmut-pilot.vercel.app`, Production Ziel und Commit unabhaengig bestaetigt.
[Leser35451454876](https://github.com/ernisch/helmut-pilot/actions/runs/35451454876)
erfolgreich:15:19:46 UTC HTTP200, exakter Commit, exklusiver relationaler
Profilpfad, Retention36, Kommunikations und Kohortenquellensperre, atomare
Sperre, Deckel2416/Reserve702/Vorrang200 und Kostenregel2 mit4 USD und voller
Reserve bei unbekanntem Ausgang. Keine Aktivierung und keine Modellaufrufe.

Native SQL15:20:59 UTC gegen Vorflug15:17:21:504 Profile,0 aktiv. Profile,
Identitaeten, kompletter Auth, Main und gesonderter Konten-/Sessionsschutz
hashidentisch.22709 Jobs erledigt, keine lebende Sperre, Lease, junge
unbeendete Verarbeitung oder offene Kostenreserve. Tagesbuch0,262850 USD.
Main CI35451368325 laeuft noch; die vollstaendige PR CI und Production
Nachkontrolle sind erfolgreich. Allgemeine semantische Prosaqualitaet ist
weiterhin offen. Der eng abgegrenzte Assemblerfix ist **erfolgreich abgeschlossen**.

## Folgepfade: Mandat, Risiko, Radar und Lage

19.09.2026. Status **teilweise abgeschlossen**. Eigener Folgebranch
`codex/prosa-lesegrenzen-20260919`, zunaechst auf dem bereits veroeffentlichten
PR453 Head `3a809cf4582c69e5016d520da5224be2712081f4`; nach dessen Abnahme
auf den identischen Main Baum `bac15b61fa774f87281dd9be54ecd7f0a2f5ba24`
fortgesetzt. Anwendungscode wurde dadurch nicht veraendert.
Kein fremder Schreiber gefunden. Dieselbe belegte Kuerzungsklasse, kein
neuer Produktbereich und keine weitere Modellmethode.

Die Leser von Mandatsummary, Risiko/Chance, Lage und Radar schnitten auch
nach dem Assembler noch selbst Zeichen ab. Diese Stellen erzeugen jetzt
keine neuen Satzpraefixe. Kurze ganze positive Texte bleiben identisch.
Ersatztitel in Lage und Radar erhalten den ganzen vorhandenen ersten Satz,
wie der bereits reparierte Mandatstitel. Uebrige gueltige Kartenfelder,
Originalinhalte, Quellen und Entscheidungswerte bleiben erhalten.

Der Lagekontext kuerzte zudem Titel600, Auszug1400 und Herausgeber160 blind.
Ein ueberlanger Beleg wird jetzt als unteilbarer Beleg ausgelassen: insbesondere
wird ein nichtleerer ueberlanger Auszug nicht entfernt und sein Titel allein
als unbestrittener Beleg weitergereicht. Andere gueltige Belege bleiben
verwendbar; wirklich fehlende Auszuege erlauben weiterhin den vorhandenen
Titelvertrag. Institutionelle Metatexte bleiben nach der bisherigen Regel
ausgenommen. Eingabemenge, Laengen und Quellengrenzen werden nicht erweitert.
Originalzeilen bleiben unangetastet. Veraenderter effektiver Kontext erzeugt
bereits ueber den vorhandenen Inhaltshash eine andere Cachebindung; unveraenderte
gueltige Belege und ihre Hashes bleiben gleich.

Neue Regression: vor Korrektur1/8 bestanden,7/8 gescheitert; danach8/8
bestanden. Entscheidungen39/39, Quellenbeleg21/21, Lage141/141, Radar10/10
Suiten und bisherige Titelsatzgrenzen unveraendert erfolgreich. Zwei alte
Erwartungen wurden fachlich verschaerft: ueberlanges Risiko liefert keinen
Praefix; ueberlange Quellen werden komplett abgewiesen. Ganze positive
Grenzwerte bleiben zusaetzlich exakt getestet, ebenso begrenzte Mengen und
Gesamtbudget mit gueltigen Belegen hinter ungueltigen Kandidaten.

Erster Gesamtlauf lieferte nur einen unvollstaendigen umgeleiteten
Dateibeleg ohne weitere sichtbare Bewegung und wurde kontrolliert mit Exit130
beendet. Kein Gesamterfolg behauptet. Die naechste Suite Urteilsimport bestand
gezielt14/14 und unter kanonischem Offline Guard in306ms. Eine Codeursache
ist nicht belegt. Der erneute kanonische Gesamtlauf wurde direkt im Terminal
mitgelesen und ist mit **423/423 Suiten in642s**, Exit0, erfolgreich beendet.
PR Abnahme und Production Nachkontrolle des Folgefixes stehen aus.
Risiko: einzelne ungueltige Kurzfelder oder Belege fehlen kuenftig sichtbar,
statt eine andere Bedeutung zu behaupten. Rueckweg ist ein gezielter Code
Revert, kein Datenrollback. Keine KI Kosten, Profilaktivierung oder neuer500er
Test. Freie Bedeutungsergaenzung durch ein Modell ist damit weiterhin nicht
allgemein verhindert. Danach folgen der sichere0→500→0 Weg und der explizite
Vollstaendigkeitsleser.
