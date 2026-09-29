# Roadmap bis zum 500er Production Nachweis

Stand: 27.09.2026

Diese Datei ist die verbindliche Reihenfolge bis zum 500er Production Nachweis.
Sie dient Codex als kurze Arbeitsroadmap. Aktueller Production Stand und Belege
stehen weiterhin in `docs/CURRENT_STATE.md`.

## Arbeitsmodus

Wenn der Nutzer einen Roadmap Schritt als Sprint startet, arbeitet Codex diesen
Sprint vollautonom bis zu den definierten Abnahmekriterien ab.

Dazu gehören Analyse, auftragsbezogener Code und Dokumentation, gezielte Tests,
Fehlerkorrekturen, Commit, Push, Pull Request, Merge nach grüner Pflicht CI,
reguläres Vercel Production Deployment und rein lesende Nachkontrolle.

Auftragsbezogene Fehler werden selbstständig behoben und erneut geprüft. Codex
stoppt nicht nur deshalb, weil ein weiterer Korrektur PR nötig wird.

Geschützte Production Aktionen bleiben ausgenommen. Insbesondere Migrationen,
Production Daten oder Profiländerungen, Cron, Environment oder Azure Änderungen,
Budgetänderungen, externe Nachrichten sowie Aktivierung der 500 Profile und Start
des 500er Nachweises brauchen weiterhin das dafür ausdrücklich erforderliche GO.

Notwendige Modelltests dürfen innerhalb des Sprintziels autonom laufen, solange
der technische Tagesriegel von 6 USD je UTC Tag eingehalten wird und der jeweilige
Test vorher klar begrenzt ist.

## 1 · Eingefrorenes Produktziel

**Verbindliche Zielgruppe: alle Parteien ausser AfD.** Keine AfD-zugehoerigen
Bundestags-/Landtagsprofile importieren, anlegen, aktivieren oder beliefern;
auch aus der500er Zielkohorte ausschliessen. Partei und Fraktion pruefen.
AfD-Nachrichten bleiben fuer andere Profile als politische Informationen erlaubt.

**Verbindliche Klarstellung des Betreibers vom 27.09.: Bundestag UND Landtage.**
Die individuelle Versorgung beider Mandatsebenen ist Pflicht. Der 500er Nachweis
muss beide Ebenen enthalten; ein ausschliesslicher Bundestagstest reicht nicht.
Notwendige Korrekturen an Landesquellen, Profilzuordnung und Ebenenpruefungen
sind direkte Nachweisblocker, kein auf spaeter verschiebbares Nebenprojekt.
[Testvertrag und belegte Luecken](betrieb/bundestag-landtage-testvertrag-20260927.md).

**Anschliessende Betreiberpriorisierung27.09.: Berlin und Brandenburg zuerst.**
Erste Markt-/Nachweisetappe: Bundestag, Abgeordnetenhaus Berlin und Landtag
Brandenburg. Die weiteren14 Laender folgen danach. Der erste500er Nachweis
enthaelt beide Mandatsebenen dieser Etappe; er belegt keine deutschlandweite
Landtagsversorgung. [Konkreter Startplan](betrieb/berlin-brandenburg-startplan-20260927.md).

Bis zum 500er Nachweis wird die Grundstruktur nicht erneut umgebaut, außer ein
belegter schwerer Produktfehler erzwingt es.

### Briefing

Nutzerfrage: **Was braucht heute meine Aufmerksamkeit?**

Briefing zeigt wenige Tagesprioritäten, einen kurzen belegten Anlass und den
nächsten Arbeitsschritt. Es erklärt den politischen Sachstand nicht noch einmal,
sondern verweist auf den zugehörigen Vorgang in Lage oder auf den passenden
Beobachtungshinweis.

### Lage

Nutzerfrage: **Was muss ich verstehen?**

Lage ist der einzige Ort für die ausführliche politische Erklärung:
Sachstand, Mandatsbezug, Einordnung, Unsicherheit und Quellen.

### Radar

Nutzerfrage: **Was sollte ich im Blick behalten?**

Radar bleibt ein eigener Bereich, aber kein zweiter Newsfeed.

Radar hat genau zwei Funktionen:

1. **Über dich**  
   Artikel und Meldungen, die die betreffende Person tatsächlich erwähnen.
   Titel, Medium, Datum und Link stehen im Vordergrund. Keine zweite
   Sachstandserklärung.

2. **Beobachten**  
   Konkrete belegte Beobachtungshinweise aus Fraktion, Partei, Wahlkreis und
   Ausschüssen sowie bevorstehende Fristen, Termine, Anhörungen oder angekündigte
   nächste Schritte. Partei und Fraktion bleiben fachlich getrennte Signale.

Ein bloßer Themenbezug, ein hoher Score oder ein weiterer Artikel zum gleichen
Sachstand reicht nicht für einen Radar Eintrag.

**Lokal belegt (29.09.2026, offline/fail-closed):** Die segmentbezogene sichtbare
Ursprungsbindung für Radar-Wahlkreis/Ausschuss ist fail-closed implementiert und
durch genau fünf gezielte Suiten belegt: radar-ursprung 15/15,
radar-committee-evidence 30/30, radar-party-normalization 32/32, radar-state
115/115, radar-ui 32/32. Relationsfremde Artikel und fehlende passende
Dokumentbelege werden nicht als sichtbarer Ursprung angezeigt; die
Ebenenbindung für Bund sowie Berlin und Brandenburg bleibt erhalten.
Ein produktiver Funktionsnachweis, ein echter Bedeutungsnachweis und der 500er
Test sind dadurch **nicht** erbracht.

## 2 · Verbindliche Regel gegen Überschneidungen

Jede Kernaussage hat genau einen Hauptort.

Derselbe politische Vorgang darf in mehreren Bereichen verbunden sein, aber nur
mit unterschiedlicher Funktion:

1. Lage erklärt den Sachstand.
2. Radar zeigt einen neuen Beobachtungsgrund oder eine persönliche Erwähnung.
3. Briefing priorisiert die heutige Arbeit.

Eine bloße Umformulierung derselben Kernaussage in einem anderen Bereich ist
nicht zulässig.

Andere Bereiche verweisen auf den Hauptort, statt denselben Inhalt erneut zu
erzählen.

## 3 · Nächste Arbeiten vor dem 500er Start

**Technischer Betreiberauftrag27.09. lokal abgeschlossen:** DeepSeek-Starter
mit eigenem15-USD-Tagesdeckel, grosszuegigen Laufbudgets und genau einer
Budget-/Tokenlimit-Erweiterung installiert und geprueft; Belege unter
[`tools/deepseek-budget/`](../tools/deepseek-budget/README.md).
Production-Kostenlimits bleiben bestehen. Naechster Fachschritt bleibt die
folgende Profil-/Landesversorgung.

**Aktueller vorgeschalteter Schritt:** Den bisherigen Platzhalterbestand durch
einen vorab festgelegten, quellenbelegten Profil- und Pruefplan fuer Bundestag
und die priorisierten Landesparlamente Berlin/Brandenburg ersetzen. Die anderen
Laender in diesem Sprint nicht vorziehen. Fuer alle500 Zielprofile reale oeffentliche Mandatsdaten recherchieren;
keine gesonderte Bestandsgruppe. Vor einem Import die genaue
Mischung, vertretenen Landesparlamente, Parteien/Fraktionen, Rollen und Themen
sowie Erwartungen je Profil festhalten; fehlende Unterstuetzung offen bilanzieren.
Die bisherige4/500-Auswahl ist kein Nachweis realistischer Personalisierung und
kein Grund, nur auf neue Nachrichten zu warten. Erst Profil-/Ebenenluecken
abgrenzen und korrigieren, dann die frische Versorgung unter Punkt3 nachweisen.
Bereits bestandene eng begrenzte Bereichspruefungen nicht pauschal wiederholen.
[500 Feldbelege](betrieb/500-profilfeldbelege-20260927.md) sind lokal zusammengestellt
und hashgeprueft. Keine personenbezogenen Pflichtplaetze in der Auswahl.
Naechster offener Teilschritt: die 73 Parteifelder einzeln aktuell amtlich belegen
oder bei reinem Belegblocker gleichgruppig sauber ersetzen; 500 technische Erfolge
sind keine fachliche Importfreigabe. Die zuvor 11 offenen Fachachsen und die letzte
Berliner Mandatsart sind durch zwoelf reale [Ersatzprofile](betrieb/500-ersatzprofile-20260928.json)
derselben Parlaments-/Fraktionsgruppe geschlossen (500/500, 330/330 Bundestag,
0 Fachachsen, 0 Mandatsarten; alle inaktiv und nicht importfreigegeben).
Fuer die Landesversorgung liegt ein enger Berliner Originalseiten-Leser vor:
`lib/helmut/berlin-presseartikel.js` bindet amtliche URL, Titel, Publikationstag
und vollstaendigen Artikeltext ohne erfundene Uhrzeit; die lokale Originalprobe
vom25.09.2026 besteht. Der separate Stand-/Speichervertrag und die tagesgenaue
Lage-Quellenanzeige sind jetzt offline geprueft; ein Live-Crawl und ein
freigegebenes Landesmodul fehlen weiterhin.
**Erledigt28.09. (lokal, offline):** [Berliner Artikelstand](betrieb/landesversorgung-berlin-20260928.md).
`lib/helmut/berlin-artikelstand.js` bindet fuer das gesicherte amtliche Original
(`be-bjf-kinder-jugendhilfe-20260925.html`) einen eigenen, geschlossenen Stand:
Metadata URL/Titel/Tag/Absatz- und Volltexthash/Standhash, eigener Namespace,
`published_at=null`, sichtbar nur der Kalendertag; als `summary` ausschliesslich der
gepruefte erste ganze Absatz (619 Zeichen) hashgebunden, kein Volltext/HTML in
`raw_documents`. Der Stand laeuft durch Import/Dedup, Speicherprojektion,
Lage-Quellenbeleg und sichtbare Quellenzeile der Lage-Karte; Offline-End-to-End-Test mit
In-Memory-Storage (25 Gruppen, echte Originalprobe), Negativtests fuer Drift und
Zeit. Der Bundestagspfad, die Schwellen und die AfD-Sperre bleiben unveraendert.
Kein Liveabruf, Import, Aktivierung oder500er Test; Production bleibt500/0,
Offline-Zielkohorte inzwischen 500/500 technisch akzeptiert und nicht importfreigegeben.
**Erledigt29.09. (lokal, offline):** [Brandenburger Landtags-Presseartikelstand](betrieb/landesversorgung-brandenburg-20260928.md).
Der minimierte Brandenburger Stand (`lib/helmut/brandenburg-landtag-presseartikelstand.js`)
ist als dritter, eigener Standtyp im gemeinsamen Dispatcher `lib/helmut/artikelstand.js`
registriert; jeder Stand behaelt eigenen Namespace und eigene Kennung. Die tatsaechlich
relevanten Storage-Leser in `lib/helmut/storage.js` (Dedup-Bestandsfenster, KO-/
Rohdokument-Projektionen, gebundene Lage-Quellen sowie ein vierter, ebenso begrenzter
Lesepfad in `listAktuelleLageQuellen`) und die tagesgenaue sichtbare Lage-Quellenzeile in
`lib/helmut/lage.js` fuehren den Stand ohne erfundene Uhrzeit (`published_at` bleibt leer,
sichtbar nur der belegte Kalendertag). Offline belegt ueber die Brandenburger
Artikelstand- und die Lage-Quellenfenster-Suite sowie die geprueften Berlin-/Bundestags-
und Dedup-Regressionen. Weiterhin **kein Live-Crawl, kein Import, kein freigegebenes
Landesmodul und kein produktiver Versorgungsnachweis**.
Gremienrollen und vier BB-Listenmandate sind korrigiert. Der falsche Widerspruch
SSW/fraktionslos ist mit PR661 ausgerollt und nachkontrolliert; Partei bleibt erhalten, AfD-Sperre unveraendert.
Zwei bislang offene Berliner Mandatsarten sind ueber die amtliche
[Berliner Mandatsartenquittung](betrieb/berlin-mandatsarten-20260927.json) belegt
(Johannes Martin Bezirksliste Marzahn-Hellersdorf, Benedikt Lux Landesliste;
Handbuch-PDF vom8.10.2025, Seite204 linke Spalte, woertliche Transkription, kein
automatischer PDF-Parser); der damals offene Fall Claudia Engelmann ist inzwischen
gleichgruppig durch Steffen Zillich mit direkt belegter Landesliste ersetzt.
Die 54 urspruenglich fachlich offenen Profile tragen ueber die gepruefte
[Rollenquittung](betrieb/profilrollen-54-20260927.json) 48 belegte Amtsrollen
in `profil.funktionen` (dedupliziert angehaengt, 6 offen); das ist keine fachliche
Achse. Ueber die gepruefte [Ressortquittung](betrieb/ressortachsen-19-20260927.json)
sind 19 dieser Achsen mit amtlich abgeleiteten Ressortthemen geschlossen
(9 Bund/4 Berlin/6 Brandenburg) und ueber die gepruefte
[Aufgabenquittung](betrieb/aufgabenachsen-6-20260927.json) 6 weitere mit
personengebundenen Aufgabenbereichen (Beauftragtenaufgaben + explizite
BMAS-Abteilungen) und ueber die gepruefte
[beratende Achsenquittung](betrieb/beratende-achsen-2-20260927.json) 2 weitere
mit amtlich belegten beratenden Ausschussrollen (Knodel Landwirtschaft/
Ernaehrung/Heimat, Seidler Haushalt; bestehende beratende Funktion erhalten,
keine ordentliche/stellvertretende Mitgliedschaft) und ueber die gepruefte
[Zusatzaufgabenquittung](betrieb/zusaetzliche-aufgaben-3-20260927.json) 3 weitere
mit amtlich belegten Fachzustaendigkeiten (Breher Tierschutz mit neuer
Funktionsrolle und erhaltener PSts-Rolle, Krichbaum Europa aus der aktuellen
AA-Seitenkopf-H1, Kippels BMG-Abteilungen1/4/5/6 mit12 Kurzthemen aus dem
manuell visuell abgenommenen PDF-Fachurteil, kein externer PDF-Parser) und ueber
die gepruefte [BMWSB-Aufgabenquittung](betrieb/bmwsb-aufgaben-2-20260927.json)
2 weitere mit den persoenlich zugewiesenen BMWSB-Unterbereichen (Sören Bartol
Z I 3/W II/S I/B I/B II, Sabine Poschmann Z II/W I/S II/S III; kanonische
v10-Adresse des amtlichen Organigramms, kein externer PDF-Parser, keine
Hochstufung auf ganze Abteilungen) und ueber die gesonderte gepruefte
[Amthor-Einzelfallquittung](betrieb/amthor-aktuelles-amt-1-20260927.json) den
einzeln offenen Rollenfall Philipp Amthor (aktuelle Kanzleramtsrolle seit29.Juli2026
aus geschlossenem bpa-richtext-Lebenslauf, ein Thema Bund-Laender-Beziehungen aus
genau einem echten li der Personalien-h2; der historische 54er-Eintrag bleibt offen,
keine Rolllockerung) und ueber die eng gepruefte
[Wahlausschuss-Aufgabenquittung](betrieb/wahlausschuss-drei-aufgaben-20260927.json)
3 weitere sonstige Gremien-Aufgabenachsen (Haßelmann/Hoffmann/Miersch: die aktuelle
Wahlausschuss-Mitgliedschaft eigenstaendig aus genau EINEM ProfilePage.mainEntity in
genau EINER echten Role mit exaktem roleName/startDate ohne endDate, das enge Thema
Richter des Bundesverfassungsgerichts aus dem geschlossenen aktuellen
Gremienaufgabenabsatz mit 21. Wahlperiode; das sonstige Gremium und die bestehenden
Funktionen unveraendert, kein regulaerer Ausschuss, keine Umdeklarierung,
Haßelmann/Miersch bleiben in der 54er Quittung offen); die54er
Rollenquittung bleibt deckungsgleich. Das war der Zwischenstand nach PR670:481/19.
Danach schlossen die eng belegten [Jarzombek-Abteilungen](betrieb/jarzombek-bmds-abteilungen-1-20260927.json),
[Klöckners Bundestagsverwaltungsaufgabe](betrieb/kloeckner-praesidentinnen-aufgaben-1-20260927.json),
[Brandenburger Ausschussstellvertretungen](betrieb/brandenburg-stellvertretungen-76-20260927.json)
(nur Skopec als neue Fachachse) und die lokal geprüfte
[Rohde-Bundeshaushaltsaufgabe](betrieb/rohde-bundeshaushalt-1-20260927.json)
je eine weitere Achse. Danach schliesst die eng gepruefte
[Merz-Einzelfallquittung](betrieb/merz-richtlinien-1-20260928.json) den zuvor offenen
Bundestags-Fachachsenfall Friedrich Merz ueber die amtlich belegte Bundeskanzler-Aufgabe
Richtlinien-Kompetenz (keine neue Rolle; Person und Amt nur aus dem sichtbaren eigenen
Artikelkopf, Thema nur aus dem geschlossenen H2-Abschnitt des eigenen innersten
div.bpa-richtext). Danach schliesst die eng gepruefte
[Woidke-Einzelfallquittung](betrieb/woidke-richtlinien-1-20260928.json) genau den
Brandenburger Fachachsenfall Dr. Dietmar Woidke ueber die amtlich belegte
Richtlinienkompetenz des Ministerpraesidenten; die bestehende Rolle bleibt
unveraendert und weitere Staatskanzlei-Themen werden nicht uebernommen.
Danach schliesst die eng gepruefte
[Wegner-Einzelfallquittung](betrieb/wegner-richtlinien-1-20260928.json) genau den
Berliner Fachachsenfall Kai Wegner ueber die amtlich belegte Richtlinienkompetenz
des Regierenden Buergermeisters; die bestehende Rolle bleibt unveraendert, Person
und Amt sind getrennt an die aktuelle Senatsseite gebunden und die weiteren50
Geschaeftsbereichsthemen werden nicht uebernommen.
Aktueller lokaler Entwurf:500/500 technisch akzeptiert;0 Fachachsen und0
Mandatsarten offen,73 aktuelle Parteifelder bleiben vor Import gesperrt. Die
fortgeschriebene [Rollenquittung](betrieb/profilrollen-43-20260928.json) bindet
die 43 weiter relevanten Altfaelle (37 belegt/6 offen); elf Bundestagsprofile
und Claudia Engelmann wurden gleichgruppig durch voll belegbare reale Profile ersetzt.
Der getrennte [amtliche SPD-Parteivorstandsbeleg](betrieb/pistorius-partei-1-20260928.json)
schliesst nur Boris Pistorius' Parteifeld; die bisherige335er-Auditquittung bleibt unveraendert.
Die zwei zuletzt fehlenden aktuellen Fraktionsvorsitz-Funktionsfelder Britta
Haßelmann und Dr. Matthias Miersch sind lokal ueber die enge
[Fraktionsvorsitz-Zweierquittung](betrieb/fraktionsvorsitz-zwei-20260927.json)
belegt (nur Funktion und amtliche Fraktionsquelle, keine Themen und keine
Fachachse;498 Datensaetze bleiben identisch); keine Importfreigabe.
Naechster Fachschritt: die verbleibenden 73 aktuellen Parteibelege; bei reinem
Belegblocker gilt weiter der gleichgruppige Ersatz durch reale aktuelle Profile.

1. Die gemeinsame semantische Trennung der tatsächlich sichtbaren Texte aus
   Briefing, Lage und Radar technisch absichern und mit echten Helmut Ausgaben
   belegen. Nicht nur wortgleiche, sondern auch sinngleiche Wiederholungen
   erkennen. Wichtige unterschiedliche Aussagen dürfen dabei nicht entfernt
   werden.

   Rein lokal/offline bereits abgesichert (29.09.2026): Der Aggregator
   `lib/helmut/bereichsabnahme-500.js` fuehrt die gebundenen Einzelurteile
   fail-closed zusammen (kein Modellaufruf, kein Netz, kein Production-Write) und
   verlangt exakt 500 erwartete Profile und 1500 positive Bereichspaare (500 mal
   drei Paare); fehlend, negativ, leer, dupliziert, unerwartet, ungueltig und
   hashgedriftet werden vollstaendig ausgewiesen. Die Suite
   `scripts/bereichsabnahme-500-test.js` ist mit 19/19 synthetischen Fallgruppen
   lokal gruen. Das ist kein echter 500er Bedeutungs- oder Production-Nachweis und
   keine Aktivierungs-/Testfreigabe.

2. Für Radar die Artikelbindung von **Über dich** sauber belegen: Der tatsächlich
   angezeigte beziehungsweise verlinkte Artikel muss die Person nachweislich
   betreffen. Umfeldsignale müssen ihrem echten Ursprung Fraktion, Partei,
   Wahlkreis oder Ausschuss korrekt zugeordnet sein.

3. Frische Production Versorgung für das Testfenster herstellen und belegen.
   Keine alten Quellen umdatieren und keinen abgeschlossenen Vorlauf ohne
   sachlichen Grund wiederholen.

4. Kostenstarttor schließen: vor dem 500er Start keine ungeklärten
   Kostenreservierungen und technischer Tagesriegel gemäß Betreiberfreigabe vom26.09. 6 USD je UTC Tag.

5. Profilbestand auf exakt 500 Zielprofile bereinigen und finalen rein lesenden
   Startplan fuer beide Mandatsebenen belegen. Ergebnisse zusaetzlich je Ebene,
   vertretenem Landesparlament und Partei/Fraktion bilanzieren; ein Gesamtwert
   darf keine unversorgte Teilgruppe verdecken. Alle500 werden bei Auswahl, Versorgung und Pruefung gleich behandelt;
   derselbe Schutz vor versehentlichem Loeschen gilt fuer den gesamten Bestand.
   Zusätzliche Nichtzielprofile zuerst eindeutig identifizieren und nur dann
   entfernen. Danach: 0 aktive Profile vor Aktivierung, richtiger Production
   Commit, keine störenden Jobs oder Sperren, Endwächter und Rückweg auf 0 aktive
   Profile bereit.

6. Danach stoppen. Exakt diese 500 gleich behandelten Zielprofile aktivieren und
   den eigentlichen 500er Production Nachweis erst nach neuem ausdrücklichem
   Betreiber GO starten.

## 4 · Nicht vor dem 500er Nachweis

1. Büro beziehungsweise Arbeit grundsätzlich neu gestalten.
2. Das neue mit Claude Design erarbeitete Desktop und Mobile UI integrieren oder
   die bestehende Oberfläche grundsätzlich neu gestalten. Das folgt erst nach dem
   erfolgreichen 500er Production Nachweis. Vorher nur technisch notwendige
   Smoke Prüfungen für tatsächlich geänderte Bereiche.
3. README oder allgemeines Repository Aufräumen ohne unmittelbaren Nachweisnutzen.
4. Neue Anbieter oder Modelle wie Voyage oder Cohere integrieren, solange die
   vorhandene Technik die semantische Trennung ausreichend belegen kann.
5. Die vier abgeschlossenen Understanding Problemfälle ohne sachlich neue
   Grundlage erneut versuchen.

## 5 · Entscheidungsregel

Wenn Codex gefragt wird, was als Nächstes ansteht, gilt diese Reihenfolge
zusammen mit dem aktuellen Production Stand aus `docs/CURRENT_STATE.md`.

Abgeschlossene Schritte werden nicht wiederholt. Neue unabhängige Themen werden
bis nach dem 500er Nachweis zurückgestellt.
