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
Fuenfernachweis wartet auf den natuerlichen Lauf und dessen rein lesende Kontrolle. Der am
27.08.2026 neu unbekannte Verstehensvorgang wurde nach exakter Vorpruefung einmal ueber den
kanonischen Betreiberweg auf `erneut` gesetzt. Aggregiert lagen danach 0 unbekannte,
2 erneut freigegebene Vorgaenge, 0 aktive Leases, 509 abgeschlossene und 1 aufgegebener Vorgang
vor. Es gab keinen manuellen Lauf. Der naechste regulaere `understanding-cron` ist fuer
21:30 UTC vorgesehen.
PR #272 und danach PR #273 bleiben offen, gruen, mergefaehig und ungemergt. Keine Migration und
keine Production Aenderung ist durch diesen Plan freigegeben.

## Was lokal bereits vorbereitet ist

| Baustein | Stand | Wirkung |
|---|---|---|
| Supabase Messlaeufer | 46 PASS, 0 FAIL; Lauf A gruen | akzeptiert nur das isolierte Testprojekt; 25 von 25 Auftraegen und 62 von 62 HTTP Anfragen erfolgreich; temporaere Zugaenge und Workflow entfernt |
| Azure Messlaeufer | 46 PASS, 0 FAIL | hoechstens 3 plus getrennt 21 Aufrufe; einzeln, ohne Wiederholung; Deploymentart, Region und tagesaktueller Preisbeleg sind Pflicht |
| Kapazitaetsauswertung | 33 PASS, 0 FAIL | berechnet Deckel und Kosten nur aus vollstaendigen Messwerten; kann nichts aktivieren |
| PR #273 Korrektur | als Commit `2a01ea9e` hochgeladen | PR offen, gruen und mergefaehig; kein Merge, kein Production Deployment und keine Production Migration |

## Kontrollierte Merge Vorbereitung

Lesender GitHub Stand und lokale Merge Vorschau vom 27.08.2026:

| Punkt | PR #272 | PR #273 |
|---|---|---|
| Basis | `main` bei `ade1674e` | Kopf von #272 bei `b42c07b` |
| Kopf | `b42c07b` | `2a01ea9e` |
| Zustand | offen, nicht Draft, mergefaehig | offen, nicht Draft, mergefaehig |
| Pflicht CI | Syntax und Offline Suiten gruen; Browser und Mobile Smoke gruen | Syntax und Offline Suiten gruen; Browser und Mobile Smoke gruen |
| Vercel Status | gruen | gruen |
| Reviews / offene Review Threads | 0 / 0 | 0 / 0 |
| Aenderungsart | nur `scripts/` und `docs/`; keine Anwendung und keine Migration | Anwendungscode fuer Z22, Tests, Dokumentation und getrennte Z22 Migration |

Die lokale Vorschau bestaetigt: #272 passt konfliktfrei auf den aktuellen `main`; #273 ist
ein direkter Nachfolger von #272 und passt konfliktfrei darauf. Die Codepruefung fand keinen
neuen Merge Blocker. Der Rueckfall von #273 vor der Z22 Production Migration fragt genau
einmal ohne Mandatsfilter und behaelt damit das bisherige konservative Verhalten bei.

Spaeterer Vollzug bleibt strikt getrennt:

1. Vor dem Vollzug `main`, beide Kopfstaende, Mergefaehigkeit und CI erneut lesen.
2. #272 nur nach eigener Mergefreigabe mergen. Dieser Merge loest ein Production Deployment
   aus, obwohl der Aenderungssatz selbst nur Pruefwerkzeuge und Dokumentation enthaelt.
3. Deployment von #272 abwarten und rein lesend auf Erfolg pruefen.
4. Basis von #273 danach ausdruecklich kontrollieren; nicht annehmen, dass GitHub sie
   automatisch auf `main` umstellt. Diff und CI erneut pruefen.
5. #273 nur nach einer zweiten Mergefreigabe mergen und das Deployment rein lesend pruefen.
6. F9 und Z22 in Production bleiben danach zwei eigene Migrationsentscheidungen. Keine
   Migration wird durch einen Merge mitfreigegeben.

## Verbindliche Reihenfolge vor der ersten Erweiterung

1. Natuerlichen Fuenfernachweis rein lesend abschliessen.
2. PR #272 kontrolliert pruefen und erst nach ausdruecklicher Freigabe mergen.
3. PR #273 danach auf dem gemergten Stand kontrollieren und erst nach neuer Freigabe mergen.
4. F9 im Testprojekt nur nach eigener Migrationsfreigabe anwenden. **Erledigt.**
5. Z22 im Testprojekt nicht veraendern. Eine lesende Bestandspruefung fand die korrigierte
   Fassung unter `20260827121931`, obwohl die freigegebene Kette Z22 ausschloss. Der Ursprung
   ist offen; der Supabase Lauf hat keine Migration ausgefuehrt.
6. Supabase Probe ausschliesslich mit synthetischen Testauftraegen bis 100 stufenweise
   freigeben und auswerten. **Lauf A ist erledigt; B bis D bleiben gesperrt.**
7. Azure Vorprobe mit drei Aufrufen und eigener Kostenfreigabe ausfuehren.
8. Nur bei gruener Vorprobe die weiteren 21 Azure Aufrufe getrennt freigeben.
9. Aus den echten Werten den KI Deckel, die Understanding Reserve und die Kostenobergrenze
   berechnen. Eine Rechnung setzt keine Production Variable.
10. Notwendige Production Migrationen jeweils separat vorbereiten, freigeben und anwenden.
11. Import und Aktivierung jedes neuen Mandatspakets bleiben zwei getrennte Freigaben.

F9 und Z22 im Testprojekt sind keine Erlaubnis fuer Production. Ebenso ist ein Merge keine
Migrationsfreigabe. Diese Grenzen gelten auch dann, wenn alle Tests gruen sind.

## Neu gemessen: Supabase Lauf A

Am 27.08.2026 lief genau die freigegebene kleinste Stufe im Testprojekt:

| Wert | Ergebnis |
|---|---:|
| synthetische Auftraege | 25 |
| Parallelitaet | 4 |
| Dauer | 8.218 ms |
| HTTP Anfragen | 62 von hoechstens 62 |
| HTTP Status | 62 mal 200 |
| Latenz p50 / p95 / p99 | 339 / 654 / 808 ms |
| maximale Latenz | 1.265 ms |
| Zeitueberschreitungen / Netzfehler / 429 / 5xx | 0 / 0 / 0 / 0 |
| abgeschlossen / offen / laufend / fehlgeschlagen | 25 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |

Der GitHub Actions Lauf `33105081744` war gruen. Anschliessend wurden das GitHub Actions
Secret, der temporaere Supabase Secret Key und der einmalige Workflow entfernt. Die
25 synthetischen Zeilen bleiben wie freigegeben erhalten, alle abgeschlossen und ohne aktive
Lease. Production, Azure, Z2 und Z3a wurden nicht beruehrt.

## Ausschliesslich noch fehlende Z3b Werte

| Bereich | Bereits vorhanden | Noch offen |
|---|---|---|
| Supabase Netzweg | Lauf A, 25 Auftraege, Parallelitaet 4 | Lauf B mit 8, Lauf C mit 16 und Lauf D mit 32 parallelen Anfragen |
| Fachwege 25/50/100 | Z3a abgeschlossen | keine Wiederholung; nur gezielte Regression nach echter Aenderung oder neuen Anbieterwerten |
| Azure | Werkzeug offline gruen; aktuelle Global- und Data-Zone-Listenpreise dokumentiert | Deploymentart und Kontopreis bestaetigen; danach begrenzte echte Laufzeit sowie Ein- und Ausgabetoken |
| KI Deckel | Rechenweg und Schutzregeln vorhanden | Zahl erst aus echten Azure Werten bestimmen |
| Aktivierung bis 100 | Stufen und Stopkriterien vorhanden | finale Zahlen fuer Deckel, Kosten, Slotreserve und Supabase Tragfaehigkeit |
| 200 und 500 | strategischer Weg festgelegt | neue Messungen erst vor diesen spaeteren Stufen; kein Blocker fuer den Plan bis 100 |

## Stufentore

| Ziel | Technischer Mindestnachweis | Vorheriger Realbetrieb | Zusaetzliche Voraussetzung |
|---:|---|---|---|
| 10 | vorhandene 25er Fachwegmessung als obere Huelle; Supabase Lauf A gruen, Lauf B noch offen; Azure Stichprobe | 5 Mandate, sieben gruene Tage | Fuenfernachweis, PR #272/#273 und notwendige Migrationen abgeschlossen; KI Deckel gesetzt |
| 25 | Z3a 25 bleibt Regression; Supabase Laeufe A und B gruen | 10 Mandate, sieben gruene Tage | eigene Import- und Aktivierungsfreigabe |
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
