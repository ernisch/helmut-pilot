# Z3b Mess- und Aktivierungsplan bis 500 Mandate vom 27.08.2026

## Ziel und heutiger Stand

Das strategische Ziel ist **500 Mandate**. Es ist nicht zu spaet, darauf hinzuarbeiten. Der
sichere Weg bleibt jedoch gestuft: 5 → 10 → 25 → 50 → 100 → 200 → 500. Keine bestandene
Stufe aktiviert die naechste automatisch.

Z2 sowie Z3a fuer 25, 50 und 100 sind abgeschlossen und werden nicht erneut als neuer Beweis
gefahren. Die vorhandenen Werte dienen als Vergleich und Eingang fuer Z3b. Eine gezielte
Regression ist erst nach einer echten Aenderung oder mit neu gemessenen Anbieterparametern
zulaessig.

Der aktuelle Production Betrieb bleibt bei fuenf aktiven Mandaten. Der natuerliche
Fuenfernachweis wartet auf die rein lesende Kontrolle des am 27.08.2026 erneut geoeffneten
Verstehensvorgangs. PR #272 und danach PR #273 bleiben ungemergt. Keine Migration und keine
Production Aenderung ist durch diesen Plan freigegeben.

## Was lokal bereits vorbereitet ist

| Baustein | Stand | Wirkung |
|---|---|---|
| Supabase Messlaeufer | 46 PASS, 0 FAIL | akzeptiert nur das isolierte Testprojekt; startet ohne F9 und Z22 nicht |
| Azure Messlaeufer | 42 PASS, 0 FAIL | hoechstens 3 plus getrennt 21 Aufrufe; einzeln, ohne Wiederholung |
| Kapazitaetsauswertung | 33 PASS, 0 FAIL | berechnet Deckel und Kosten nur aus vollstaendigen Messwerten; kann nichts aktivieren |
| PR #273 Korrektur | nur lokal vorbereitet | kein Push, Merge, Deployment oder Migration |

## Verbindliche Reihenfolge vor der ersten Erweiterung

1. Natuerlichen Fuenfernachweis rein lesend abschliessen.
2. PR #272 kontrolliert pruefen und erst nach ausdruecklicher Freigabe mergen.
3. PR #273 danach auf dem gemergten Stand kontrollieren und erst nach neuer Freigabe mergen.
4. F9 im Testprojekt nur nach eigener Migrationsfreigabe anwenden.
5. Z22 im Testprojekt getrennt und nur nach eigener Migrationsfreigabe anwenden.
6. Supabase Probe ausschliesslich mit synthetischen Testauftraegen bis 100 stufenweise
   freigeben und auswerten.
7. Azure Vorprobe mit drei Aufrufen und eigener Kostenfreigabe ausfuehren.
8. Nur bei gruener Vorprobe die weiteren 21 Azure Aufrufe getrennt freigeben.
9. Aus den echten Werten den KI Deckel, die Understanding Reserve und die Kostenobergrenze
   berechnen. Eine Rechnung setzt keine Production Variable.
10. Notwendige Production Migrationen jeweils separat vorbereiten, freigeben und anwenden.
11. Import und Aktivierung jedes neuen Mandatspakets bleiben zwei getrennte Freigaben.

F9 und Z22 im Testprojekt sind keine Erlaubnis fuer Production. Ebenso ist ein Merge keine
Migrationsfreigabe. Diese Grenzen gelten auch dann, wenn alle Tests gruen sind.

## Stufentore

| Ziel | Technischer Mindestnachweis | Vorheriger Realbetrieb | Zusaetzliche Voraussetzung |
|---:|---|---|---|
| 10 | vorhandene 25er Fachwegmessung als obere Huelle; Supabase bis 25; Azure Stichprobe | 5 Mandate, sieben gruene Tage | Fuenfernachweis, PR #272/#273 und notwendige Migrationen abgeschlossen; KI Deckel gesetzt |
| 25 | Z3a 25 bleibt Regression; Supabase 25 gruen | 10 Mandate, sieben gruene Tage | eigene Import- und Aktivierungsfreigabe |
| 50 | Z3a 50 bleibt Regression; Supabase 50 gruen | 25 Mandate, sieben gruene Tage | Morgenlage ueber tragfaehigen Warteschlangenpfad; Aufbewahrung aktiv und belegt |
| 100 | Z3a 100 bleibt Regression; Supabase 100 gruen | 50 Mandate, sieben gruene Tage | Slotkapazitaet mit Reserve; Supabase Tarif, PITR und Speichergrenze entschieden |
| 200 | **neue** 200er Fachwegmessung; Supabase 200 gruen | 100 Mandate, sieben gruene Tage | Ereignisantrieb beziehungsweise grosser Transportweg und Kostenrahmen entschieden |
| 500 | **neue** 500er Fachwegmessung; Supabase 500 gruen | 200 Mandate, sieben gruene Tage | Anbieter-, Speicher-, Aufbewahrungs- und Betriebskapazitaet fuer 500 belegt |

Eine neue 200er oder 500er Messung ist keine Wiederholung des abgeschlossenen Z3a Nachweises,
sondern eine neue, bisher ungemessene Stufe. Sie wird trotzdem erst ausgefuehrt, wenn das
vorherige Tor gruen ist.

## Wie der KI Deckel bestimmt wird

Der Produktionsdeckel begrenzt Aufrufe, nicht Token. Deshalb werden beide Groessen getrennt
berechnet:

1. Tagesbedarf p95 fuer Verstehen, Lage und Buero addieren.
2. Fuer 25 Prozent freie Kapazitaet den Bedarf durch 0,75 teilen und aufrunden.
3. Die Understanding Reserve innerhalb dieses Gesamtdeckels berechnen; sie wird nie zum
   Gesamtdeckel addiert.
4. Echte Azure p95 Token je Arbeitsform mit dem Tagesbedarf multiplizieren.
5. Mit dem am Lauftag belegten Azure Preis die Tages- und Deckelobergrenze berechnen.

Das Ergebnis ist eine Betreiberempfehlung. Das Setzen des Deckels ist eine gesonderte
Production Aenderung und bleibt bis zur ausdruecklichen Freigabe gesperrt.

## Gruenes Beobachtungsfenster

Vor jeder naechsten Aktivierungsstufe braucht die vorherige Stufe mindestens sieben
vollstaendige Tage. Jeder einzelne Tag muss folgende Bedingungen erfuellen:

1. Abfluss ist mindestens so gross wie Ankunft.
2. Keine offene Arbeit ist 24 Stunden oder aelter.
3. Keine unbekannten Auftraege, Dubletten oder haengenden Leases.
4. Keine unerwarteten endgueltigen Fehler und kein fehlendes Mandatsbriefing.
5. Der KI Deckel wurde nicht erreicht.
6. Die Slotdauer p95 liegt bei hoechstens 217,5 Sekunden im 290 Sekunden Budget; damit bleiben
   25 Prozent Reserve. Ein Einzelwert ueber 280 Sekunden ist eine betriebliche Stopgrenze.

## Stop und Rueckweg

Bei einem roten Kriterium wird die Stufe gehalten. Bei einem sicherheits- oder
vollstaendigkeitsrelevanten Fehler werden ausschliesslich die zuletzt aktivierten Mandate
wieder deaktiviert; Code und Daten werden nicht spontan geloescht oder zurueckgesetzt.

Merge, Deployment, Migration, Kosten, Schluesselbereitstellung, Testdaten, Import, Deckel,
Cron, Umgebungsvariable und Aktivierung bleiben immer einzelne Betreiberentscheidungen. Ein
gruenes Werkzeug darf nur die Entscheidungsreife feststellen, niemals selbst freigeben oder
aktivieren.
