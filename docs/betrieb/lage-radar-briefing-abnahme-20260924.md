# Lage, Radar und Briefing: fachliche Abnahme

Auftrag vom 24.09.2026: Die drei Bereiche erfuellen unterschiedliche Aufgaben.
Dies ist die Abnahme der Anzeige- und Adaptervertraege, kein neuer Modelllauf
und kein Ersatz fuer die vollstaendige Inhaltsbilanz des spaeteren 500er Laufs.

## Verbindliche Aufgaben

| Bereich | Frage | Inhalt | Abgrenzung |
| --- | --- | --- | --- |
| Lage | Was ist passiert und warum ist es relevant? | Belegte Fakten, Einordnung, Quellen, ehrliche Aktualitaet. | Keine zweite Handlungsanweisung. Bei vorhandener Empfehlung Verweis ins Briefing. |
| Radar | Was bewegt sich um das konkrete Mandat? | Belegte persoenliche Erwaehnungen und Bezuege zu Partei, Wahlkreis oder Ausschuss, mit Artikelquelle. | Kein allgemeiner Themenfeed; ein Artikel hat genau einen sichtbaren Hauptplatz, weitere Bezuege bleiben erhalten. Keine Briefing-Empfehlung. |
| Briefing | Was soll ich jetzt tun und warum? | Priorisierte Empfehlung, eigenstaendige Entscheidungsgruende, Risiken, Chancen und naechste Schritte. | Vorhandene Lage-Einordnung verlinken statt wortgleich wiederholen; Hauptvorgang nicht nochmals unter weiteren Vorgaengen. |

Dasselbe Ereignis darf in allen drei Bereichen vorkommen. Titel und Quellen
sind notwendige Orientierung, keine unerwuenschte Dopplung. Unnoetig waeren
dagegen dieselbe lange Einordnung oder Handlungsanweisung als zweiter Feed.
Abweichende Entscheidungsgruende duerfen bei der Entdopplung nicht verschwinden.

## Technischer Vertrag und Abnahmekriterien

1. Der echte Vertragsadapter `toBriefingContractV3` liefert Briefing und Radar
   aus demselben belegten Vorgang. Radar benoetigt einen konkreten Profilbezug.
2. Lagekarte und Lagedetail zeigen Fakten/Quellen, keine Kopie der Empfehlung.
3. Briefing zeigt die Empfehlung und verlinkt den passenden sichtbaren
   Lagevorgang. Wortgleiche Einordnung entfällt; eigenstaendige Gruende bleiben.
4. Ohne passenden sichtbaren Lagevorgang entsteht kein leerer Querverweis.
5. Hin- und Rueckweg funktionieren auch mobil. Der Hauptvorgang erscheint
   nicht nochmals in der Briefing-Liste.
6. Radar zeigt einen Artikel trotz persoenlicher Erwaehnung und Ausschussbezug
   nur einmal. Seine Anzeige enthaelt weder den Briefing-Vorschlag noch den
   Lage-Langtext. Quellennachweis und weitere Bezuege bleiben erhalten.
7. Keine zusaetzliche Modellabfrage, Datenmutation oder Production-Fixture
   fuer diese Anzeigeabnahme. Die fuenf realen Profile bleiben unveraendert.

Die vorhandene Implementierung erfuellt diese Rollen bereits: `client.js`
(`renderLageView`, `renderHelmutStandView`, `renderRadarView`) sowie
`lib/helmut/radarState.js` (`ordneArtikelEinmal`). Der Sprint ergaenzt die bislang
auf Lage/Briefing beschraenkte Browserabnahme um Radar, Duplikate und die
negativen Verweisfaelle. Keine unnoetige Neugestaltung oder Promptaenderung.

## Belege und Grenzen

`scripts/browser-smoke-test.js` fuehrt die synthetische Fachfixture durch den
echten Adapter und die echten Klickhandler auf Desktop und Mobil. Die
Pflicht-CI muss einschliesslich dieser neuen Assertions gruen sein. Bestehende
Adaptertests pruefen Profilbezug, Quellenpflicht und Artikelidentitaet separat.
Nach Merge werden Production-Commit und gelieferter Client rein lesend geprueft.

Ein erfolgreicher Browserbeleg beweist diesen Anzeigevertrag, nicht die
inhaltliche Richtigkeit jeder zukuenftigen Modellantwort. Diese muss im
500er Lauf fuer alle 1500 Ergebnispositionen eigens bilanziert werden. Die vier
gesperrten Understanding-Faelle werden dadurch nicht nachtraeglich erfolgreich;
ihre [Abschlussbilanz](verstehen-vier-nacharbeit-20260924.md) bleibt verbindlich.
