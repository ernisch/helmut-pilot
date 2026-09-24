# Lage, Radar und Briefing: fachlicher Vertrag und Abnahme

Auftrag vom 24.09.2026. **Production erfüllt die geforderte Trennung noch nicht
vollständig.** Die vorherige Anzeigeabnahme aus PR #549 belegte Navigation und
wortgleiche Doppelungen, keine verlässliche semantische Trennung. Diese Prüfung
ersetzt ihre weitergehende Aussage, die Rollen seien bereits hinreichend umgesetzt.

## Geprüfter Stand und Reichweite

Rein lesend belegte Production: Commit
`bf95ebd810a69ec224a07d034f95543b5957a396`, Vercel
`dpl_GH7QGAfDCyiufvyfu7Gc5pSGB9Co`, READY, Production-Alias
`helmut-pilot.vercel.app`. Die folgende Ist-Analyse bezieht sich auf diesen Code.
Die Reparatur liegt separat auf `codex/lage-radar-briefing-vertrag-20260924`.
Kein Deployment, Profilwrite, Modelllauf oder 500er Start in diesem Auftrag.
Keine aktuelle Vollprüfung der gespeicherten Texte aller Profile durchgeführt.

Geprüft: `server.js` (`buildV3Briefing`), `lib/helmut/decisions.js`,
`briefingContract.js`, `lage.js`, `radarState.js`, aktive Renderer in `client.js`,
Quellen-/Fristprüfung sowie Aussagen-, Gesamturteil- und Speicherverträge.
`radar.js` enthält daneben ältere Archiv-/Adminlogik; sie ist nicht der aktive
Radar-Reiter. API-Aliase wie `items` und `homeSections` sind keine zusätzlichen
sichtbaren Reiter und bleiben als interne Vertrags-/Prüfdaten erhalten.

## Antworten zum bisherigen Production-Verhalten

1. **Lage:** mandatsbezogenen Sachstand mit Quellen und Einordnung erschließen.
   `loadRankedVorgaenge` nutzt persönliche Matches, ergänzt aktuelle passende
   Vorgänge und kann auf verstandene Vorgänge zurückfallen; maximal zwölf Karten.
   Hinzu kommt ein separat erzeugter, qualitätsgeprüfter und gespeicherter
   Lagetext. Karten/Details zeigen keine zweite Handlungsempfehlung.
2. **Radar:** persönliche Erwähnungen und Umfeldbezüge zu Partei, Wahlkreis und
   Ausschüssen sammeln. Das ist bisher hauptsächlich ein Relevanz-/Resonanzfeed,
   **keine nachgewiesene Frühwarnlogik**. Die bisherige Dynamik kann schon aus
   einem Quellenbestand entstehen; ein Zähler beweist keine Entwicklung.
3. **Briefing:** einen priorisierten Hauptvorgang und bis zu drei weitere
   Vorgänge mit Empfehlung, Begründung, Risiken, Chancen und Schritten anzeigen.
   Es kopiert dabei teilweise Einordnungen aus denselben Wissensobjekten.
   Auch alte bzw. zeitlich unzureichend belegte Inhalte konnten nachrücken.
4. **Zuordnung:** keine gemeinsame exklusive Bereichsentscheidung. Rohartikel
   werden über Understanding zu Wissensobjekten; persönliche Entscheidungen
   gewichten Ausschuss (34), Partei (22), Wahlkreis (20), Thema (12), semantische
   Ähnlichkeit (bis 24), Zeitdruck (8), mehrere Quellen (4) und Konfidenz (4).
   Ab 60 Punkten: reagieren; ab 40: beobachten; darunter: ignorieren. Das sind
   Relevanzschwellen, keine Rollen. Lage, Briefing und Radar filtern/rangieren
   anschließend separat. Quellen- und Profilprüfungen begrenzen diese Wege.
5. **Derselbe Vorgang in allen drei Bereichen:** ja. Es gibt keine Sperre, die
   eine bereits gezeigte Kernaussage in einem anderen Bereich zuverlässig erkennt.
6. **Überschneidungen:** Lage-Einordnung und Briefing-Begründung stammen aus
   denselben KO-Feldern; Radar kann dieselbe Meldung als Erwähnung, Umfeldbezug
   oder Artikelangebot zeigen. Unterschiedliche Formulierungen oder IDs heilen
   die fachliche Doppelung nicht. Innerhalb Radar werden Artikel bereits einem
   Hauptplatz zugeordnet; das löst den Vergleich mit Lage/Briefing nicht.
7. **Technisch erzwungen?** Nur teilweise: Quellenpflicht, Profilrelation,
   Radar-Artikelidentität und Navigation sind echte Regeln. Der Client unterdrückt
   punktuell wortgleiche Einordnung; der Speicher erkennt lange exakte Kopien.
   Zeitliche/fachliche Eigenständigkeit und sinngleiche Wiederholungen waren damit
   nicht abgesichert. Unterschiedliche Prompts und Scores sind kein Nachweis.

## Verbindlicher fachlicher Vertrag

| Bereich | Nutzerfrage | Eigenständiger Nutzen | Nicht zulässig |
| --- | --- | --- | --- |
| Lage | Was ist für mein Mandat relevant, was ist belegt und wie ist es einzuordnen? | Sachstand, Bedeutung, Unsicherheit und Quellen eines Vorgangs; darf über mehrere Tage relevant bleiben. | Handlungsfeed oder Prognose ohne Beleg. |
| Radar | Welche belegten Vorzeichen, kommenden Fristen oder neuen Resonanzen sollte ich beobachten? | Beobachtungsgrund mit Zeit-/Quellenbeleg; keine behauptete Prognose aus bloßer Artikelzahl. | Eine weitere Sachmeldung allein wegen Themen-/Partei-/Ausschussbezug. |
| Briefing | Was hat für meinen heutigen Arbeitstag Vorrang und welcher nächste Schritt folgt daraus? | Kurze Tagespriorisierung und Handlung, gegebenenfalls ausdrückliches Beobachten; Bezug auf Lage/Radar statt zweiter Sachbericht. | Erneute Lage-Einordnung, Hintergrundfeed, künstlicher Tagesanlass aus neuem Speicherdatum. |

Die Ausgangshypothese wird damit präzisiert: Lage ist der dauerhafte Sachstand,
Radar beobachtet **belegte Signale**, Briefing priorisiert **heutige Arbeit**.
Die vorhandenen Daten tragen keine generelle Vorhersage, was politisch eintreten
wird. Das Produkt darf diese Fähigkeit nicht suggerieren.

Gleicher Vorgang und Originaltitel sind zur Orientierung erlaubt. Eine doppelte
Kernaussage ist nur zulässig, soweit sie knapp zur heutigen Entscheidung nötig
ist; der zusätzliche Nutzen muss erkennbar sein. Beispiel: Lage erklärt einen
Gesetzentwurf, Radar nennt eine belegte kommende Einreichungsfrist, Briefing
priorisiert am Fristtag die Abgabe. Drei umformulierte Meldungen über den Entwurf
sind dagegen unzulässig.

## Reparatur im Branch

`lib/helmut/briefing-bereichsvertrag.js` ist ein gemeinsamer deterministischer
Filter im regulären Briefing-/Radaradapter, ohne Modell, Netz oder Datenwrite:

- Briefing benötigt eine veröffentlichte Quelle im geltenden Briefingfenster
  oder eine ausdrücklich datierte, quellenbelegte heutige Frist. Das bestehende
  Fenster umfasst gegebenenfalls den Vorabend bzw. die Zeit seit dem letzten
  erfolgreichen Briefing. Relevanzprüfung bleibt vorgeschaltet. **Eine frische
  Quelle ist ein Kandidatenbeleg, kein automatisches fachliches Wichtigkeitsurteil.**
- Ohne Tagesanlass entsteht ein ehrlicher Leerzustand. Die Begründung beschreibt
  den Tagesanlass; die Lage-Einordnung wird nicht mehr übernommen, auch nicht in
  anderer Formulierung. Haupt-/Nebenplätze werden nach Vorgang und Artikelidentität
  entdoppelt. Handlung, Risiken und Chancen behalten ihre gesonderte Quellenprüfung.
- Radar benötigt eine frische persönliche Erwähnung, eine belegte künftige Frist
  oder verschiedene Artikel an unterschiedlichen Veröffentlichungstagen mit
  jüngstem Beleg innerhalb sieben Tagen. Es beschreibt nur zusätzliche Berichte,
  keinen daraus abgeleiteten politischen Trend. Reiner Quellenbestand zählt nicht.
- Radar gibt keine Sachzusammenfassung und keinen zweiten allgemeinen Artikelfeed
  aus. Der Beobachtungsgrund ersetzt kopierte KO-Prosa. Bestehende Profilrelationen
  bleiben Voraussetzung; pro Vorgang nur ein sichtbarer Platz.
- Canonical-/Tracking-/Anbieteraliase sind kein Wachstum. Undatierte, zukünftige
  oder widersprüchlich datierte Varianten liefern keinen Zeitbeleg. Strikte Fristen
  verlangen ein Kalenderdatum plus Fristkontext; abgesagte/negative Belege sperren.
- Der externe Gesamturteilsvertrag verlangt jetzt zusätzlich `bereichstrennung`
  (Version 2). Fehlendes/negatives Kriterium und alte Versionen verhindern Import
  und Verwendung als positives Gesamturteil. Auswahl-/Beobachtungshinweise werden
  gegen die exakt gebundene Ausgabe beurteilt, freie Handlungen gegen ihre Quellen.
- Die strukturelle Speicherprüfung weist ein Briefing ohne Tagesanlass ausdrücklich
  als unvollständig aus. Ein zulässiger leerer Reiter ist kein Fehler der Anzeige,
  erfüllt aber nicht automatisch die nichtleere 500er Ergebnisanforderung.

Bewusste Grenze: Freie Handlungsempfehlungen, Risiken und der separat erzeugte
Lagetext können semantisch weiterhin schlecht formuliert sein. Die neue
Gesamtprüfung bindet Briefing und Radar, **nicht einen später erzeugten Lagetext**.
Sie allein ist deshalb kein Dreifach-Nachweis. Eine universelle automatische
Paraphrasenerkennung wurde weder eingebaut noch behauptet. Der 500er Fachnachweis
muss die tatsächlich gemeinsam sichtbaren Ausgaben vollständig vergleichen.
Bis diese Prüfung positiv belegt ist, bleibt die Gesamtanforderung offen.

## Repräsentative Abnahme

`scripts/briefing-bereichsvertrag-test.js` prüft 19 synthetische Fallgruppen durch
reale Adapter. Kein Fixtureurteil ist ein Production-Fachurteil.

| Fall | Erwartung |
| --- | --- |
| Neue relevante Meldung, kein Signal | Lage; Briefing nur als Tagespriorität; kein allgemeiner Radarartikel |
| Alte Quelle, heute neu gespeichertes KO, hoher Score | Kein erfundener Tagesanlass |
| Beleg vom Vorabend | Innerhalb des Briefingfensters zulässig, Datum bleibt erhalten |
| Undatiert, Zukunft, widersprüchliche Artikelaliase | Kein Zeitbeleg, auch bei anderer Reihenfolge |
| Gleicher Vorgang oder Artikel mehrfach | Kein zweiter Briefingplatz |
| Quellenzähler 200 ohne zeitliche Folge | Kein Dynamiknachweis |
| Persönliche Erwähnung | Eigene Resonanzfunktion, keine Kopie des Sachstands |
| Verschiedene Berichte an mehreren Tagen | Begrenzte Beobachtung, keine Trendbehauptung |
| Zeitgleiche Quellen oder Trackingvarianten | Kein Wachstum |
| Alte Resonanz oder fremdes Mandat | Kein persönliches Signal |
| Künftige/heutige Frist | Radar-Beobachtung/heutiger Briefinganlass; priorisierte heutige Frist nicht durch bloße Artikelfrische verdrängen |
| Abgesagte/erfundene Frist oder bloßes Datum | Kein Fristbeleg |
| Sinngleiche alternative Lage-Einordnungen | Keine davon wird als Briefinggrund/Radartext übernommen |
| Fehlendes/negatives/veraltetes Fachurteil | Keine fachliche Freigabe |

Weitere gezielte Regressionen: die 45 Briefing-/Radar-Suiten; erforderliche
lokale HTTP-Tests getrennt außerhalb der Port-Sandbox. Desktop-/Mobil-Smoke
prüft echte Navigation, sichtbaren Tages-/Beobachtungsgrund, Quellen und das
Fehlen eines zweiten Radar-Artikelfeeds. Endgültige Pflicht-CI siehe zugehöriger PR.

## Abnahmekriterien vor dem 500er Start

1. Genau dieser reparierte Commit muss nach konkretem Merge-GO READY ausgerollt
   und anschließend rein lesend verifiziert sein. Branch-/CI-Erfolg reicht nicht.
2. Gemeinsame Sicht auf Lage, Radar und Briefing je Profil/Tag/Version sichern;
   Quellen, Profil, sichtbare Auswahl und vollständige Texte exakt zuordnen.
3. Jeden wiederkehrenden Vorgang/Kernaussage vergleichen: Sachstand, Beobachtung
   und Tagesentscheidung unterscheiden. Bloße Umformulierung ablehnen, erforderliche
   kurze Entscheidungsgrundlage begründen. Keine Stichprobe als Vollprüfung.
4. Für alle 500 Profile Rolle/Mehrwert und fehlend, leer, doppelt, unbrauchbar,
   technisch fehlerhaft vollständig ausweisen. Radar mitprüfen, ohne die geltenden
   **1500** Ergebnispositionen eigenmächtig umzudefinieren.
5. Neue Fachurteile samt Bereichskriterium, echte Lage-/Radar-/Briefing-Gegenprüfung
   und gebundene Rücklesung belegen. Alte positive Urteile nicht wiederverwenden.
6. Die übrigen Kosten-, Understanding-, Schutz-, Zeitfenster- und Endwächtergates
   aus dem [Starttor](500-starttor-20260924.md) müssen ebenfalls erfüllt sein.

**Status:** Ursache der deterministischen Doppelpfade im Code begrenzt und
gezielt testbar; vollständige semantische Production-Abnahme noch offen.
Der 500er Nachweis wird in diesem Auftrag nicht gestartet.
