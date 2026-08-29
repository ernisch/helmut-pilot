# Z3b Mess- und Aktivierungsplan bis 500 Mandate vom 27.08.2026

> **Stand-Nachtrag 29.08.2026** (der Plan darunter bleibt als datierter Beleg unverändert):
> PR #272 und #273 sind **gemergt**; `main` = `bb0577a9`. **Z22 ist samt Vorwärtskorrektur seit
> dem 29.08. mit Betreiberfreigabe in Production angewendet** (Buchungen `20260829175642` und
> `20260829175749`) — die Vollzugsschritte 3–5 der Kette unten sind damit vollzogen; Z22 nie
> erneut anwenden. F9 bleibt nicht angewendet. Die Stapel-PRs #274–#277 wurden am 29.08. per
> normalen Merge-Commits auf den aktuellen `main` nachgeführt (#274 hängt an Basis `main`);
> die unten genannten Köpfe/CI-Läufe bezeichnen den 27./28.08.-Stand. Aggregierter CAS-Stand
> 29.08.: 653 fertig · 1 unbekannt · 1 aufgegeben · 1 offen. **Achtung Beobachtungsfenster:**
> die planmäßigen Slotdauern vom 29.08. (Crawl 230 s, Pipeline bis 261 s) überschreiten die
> p95-Grenze von 217,5 s bereits — ein grünes Fenster kann mit dem heutigen Slotverhalten
> nicht beginnen; das ist vor dem Einfrieren zu klären.

## Ziel und heutiger Stand

Das strategische Ziel ist **500 Mandate**. Es ist nicht zu spaet, darauf hinzuarbeiten. Der
sichere Weg bleibt jedoch gestuft: 5 → 10 → 25 → 50 → 100 → 200 → 500. Keine bestandene
Stufe aktiviert die naechste automatisch.

Z2 sowie Z3a fuer 25, 50 und 100 sind abgeschlossen und werden nicht erneut als neuer Beweis
gefahren. Die vorhandenen Werte dienen als Vergleich und Eingang fuer Z3b. Eine gezielte
Regression ist erst nach einer echten Aenderung oder mit neu gemessenen Anbieterparametern
zulaessig.

Der aktuelle Production Betrieb bleibt bei fuenf aktiven Mandaten. Der natuerliche Lauf am
27.08.2026 um 21:30 UTC endete ohne laufinternen Fehler, die Fuenferregression bleibt aber
rot: 17 verarbeitet, 34 vertagt. Der betroffene Vorgang wurde nach 2 Versuchen und 2 KI
Aufrufen erneut unbekannt; ein Ergebnis wurde nicht gespeichert. Aggregiert lagen danach
537 CAS Vorgaenge, 535 abgeschlossene, 1 unbekannter und 1 aufgegebener Vorgang vor; 0 offen,
reserviert oder laufend, 0 aktive oder haengende Leases, 0 endgueltige Auftragsfehler und
weiterhin genau 5 aktive Mandate. Das ist kein neuer Skalierungsbeweis.
PR #272 bis #277 bleiben offen und ungemergt; jeder ist nur gegen seinen unmittelbaren
Vorgaenger sauber mergefaehig. Die Pflicht-CI-Laeufe der Kette sind
`32996076988`, `33069194975`, `33167736389`, `33170004225`, `33172213903` und
`33173604221`. #277 steht dabei auf `7320d4d`. Die Reihenfolge ist Z3a, Z22,
KI Antwortumschlag, Planungszeitbudget, Monitoring und Z3b Tore. Nichts davon gibt
eine Migration oder Production Aenderung frei.

Der danach weiter gehaertete lokale Arbeitsstand ist nicht durch Kopf `7320d4d` oder
Lauf `33173604221` gedeckt. Erst ein neuer entfernter Kopf mit eigener vollstaendig
gruener Pflicht CI darf diese lokalen Aenderungen als PR Beleg tragen.

## Beweisstand streng getrennt

| Ebene | Sicherer Stand | Grenze |
|---|---|---|
| Lokal bewiesen | Z3a 25/50/100 und die Schutzvertraege fuer Supabase, Azure, Kapazitaet und Fachweg | lokale Anbieter, lokale Datenbank oder Attrappen sind kein Production Nachweis |
| Isoliert gegen Supabase bewiesen | A bis D sowie 200 und 500, zuletzt Lauf `33158170030` mit 500 synthetischen Mandaten | nur Plattformweg des Testprojekts, keine echten Mandate und kein Fachweg |
| Vollstaendig im Fachweg bewiesen | fuer 200 und 500 noch nichts | die neuen Laeufe sind weder ausgefuehrt noch durch natuerliche Vorstufen freigeschaltet |
| In Production bewiesen | historische Abnahme der fuenf aktiven Mandate | aktuelles Fuenfertor wegen 1 unbekannten Vorgang rot; 10 bis 500 nicht bewiesen |
| Noch offen | Azure, echter Google Sonderweg, beweissichere Production Beobachtung, Ereignistransport, Speicher, Aufbewahrung, Tarif, Fachweg 200/500 und alle natuerlichen Stufen | Simulation und Hochrechnung duerfen keine dieser Luecken ersetzen |

## Technische Werkzeuge und getrennte Belege

| Baustein | Stand | Wirkung |
|---|---|---|
| Isolierter Supabase Plattformbeleg | 51 PASS, 0 FAIL; A bis D, 200 und 500 gruen | echter PostgREST Weg im Testprojekt bis 500 bei Parallelitaet 32; keine echten Mandate und kein Fachweg |
| Azure Messlaeufer | lokal 64 PASS, 0 FAIL | 21 Einzelwerte werden intern nachgerechnet; Portalherkunft, Deployment und Preis bleiben extern offen; kein Azure Aufruf erfolgt |
| Kapazitaetsauswertung | lokal 90 PASS, 0 FAIL | formale Rechnung und Tore; bleibt ohne externe Herkunft, Fachweg Gesamtbericht und Kostenstopp nicht entscheidungsreif |
| Fachweglaeufer 200/500 | lokal 45 Vertrag, 18 konstruktiver Aussenriegel und 60 Integritaet, je 0 FAIL | Prozessstart ohne externe Azure/Production Herkunft gesperrt; Buero im Queue Fachweg 0, kein 200er oder 500er Lauf |
| Production Beobachtungsvertrag | lokal 61 PASS, 0 FAIL | interner Siebentage- und 500er Vertrag; vertrauenswuerdiger Slotplan, Sammler und externe Production Herkunft fehlen |
| Provider Fachpfad | lokal 86 PASS und Google Haertung 60 PASS | Redirect, Retry und Aufloesung je Hop begrenzt; `proHttpVersuchGlobal` bleibt falsch; nicht deployt, M1, Quote, Production und gategebundene Kapazitaet offen |
| Backup und Restore | lokal Export 74, Dateikopie 56, Verifier 86 gruen | 51 Tabellen gebunden; kein transaktionaler Snapshot, kein Datenbank Restore und kein Vollrueckweg |
| Aufbewahrung | lokal Planner 53 und Storage 5 gruen | REST Plan bleibt nur Trockenlauf, Executor konstruktiv bei 0 DELETE; kein Production Vollzug |
| KI Antwortumschlag | PR #274 offen, gruen, mergefaehig und ungemergt; Parser 25 PASS, Endpunktvertrag 10 PASS | rettet den beobachteten Steuerzeichenpfad, lehnt unvollstaendige Anbieterantworten ab und gibt keine Antwortfragmente im Fehler aus; nicht deployt |
| Planungszeitbudget | PR #275 offen, gruen, mergefaehig und ungemergt | wartet einen bereits begonnenen Schreibaufruf ab und meldet nur belegte Zaehler; nicht deployt |
| Monitoring Ehrlichkeit | PR #276 offen, gruen, mergefaehig und ungemergt | kennzeichnet gedeckelte Queuegruende als Stichprobe und traegt Blobspiegelueberlauf bis zum Motorbericht; nicht deployt |
| PR #273 Korrektur | als Commit `2a01ea9e` hochgeladen | PR offen, gruen und mergefaehig; kein Merge, kein Production Deployment und keine Production Migration |

## Kontrollierte Merge Vorbereitung

Lesender GitHub Stand und lokale Merge Vorschau vom 27.08.2026:

| Punkt | PR #272 | PR #273 |
|---|---|---|
| Basis | `main` bei `ade1674e` | Kopf von #272 bei `b42c07b` |
| Kopf | `b42c07b` | `2a01ea9e` |
| Zustand | offen, nicht Draft, mergefaehig | offen, nicht Draft, mergefaehig |
| Pflicht CI | Syntax und Offline Suiten gruen; Browser und Mobile Smoke gruen | Syntax und Offline Suiten gruen; Browser und Mobile Smoke gruen |
| GitHub Vercel Check am damaligen Kopf | gruen | gruen |
| Reviews / offene Review Threads | 0 / 0 | 0 / 0 |
| Aenderungsart | nur `scripts/` und `docs/`; keine Anwendung und keine Migration | Anwendungscode fuer Z22, Tests, Dokumentation und getrennte Z22 Migration |

Die lokale Vorschau bestaetigt: #272 passt konfliktfrei auf den aktuellen `main`; #273 ist
ein direkter Nachfolger von #272 und passt konfliktfrei darauf. Die Codepruefung fand keinen
neuen Merge Blocker. Der Rueckfall von #273 vor der Z22 Production Migration fragt genau
einmal ohne Mandatsfilter und behaelt damit das bisherige konservative Verhalten bei.

Am 28.08.2026 wurden #274 bis #277 als getrennte Folge-PRs aufgebaut. Alle sind offen, nicht
Draft, sauber mergefaehig und auf ihren entfernten Koepfen in der Pflicht CI gruen. GitHub
meldet `main` derzeit als ungeschuetzt; Required Checks werden also nicht technisch erzwungen.
Ein erfolgreicher Vercel Status ist in GitHub nur fuer `main` und die Vorschaukoepfe #272/#273 sichtbar;
#274 bis #277 haben wegen der branchgenauen Deployment Sperre keinen Vercel Status. Kein PR
wurde gemergt und kein Deployment oder Production Lauf dadurch ausgeloest.

Spaeterer Vollzug bleibt strikt getrennt:

1. Zuerst das richtige Vercel Production Projekt, den erfolgreichen `main` Stand und den
   konkreten Rollbackweg belegen; Branch Protection und beide Pflichtchecks bestaetigen.
2. Danach alle Basen, Koepfe, Diffs, Mergefaehigkeit und CI der Kette erneut lesen.
3. #272 nur mit eigener Freigabe mergen, sein Production Deployment abwarten und pruefen.
4. #273 auf die neue Basis stellen, erneut pruefen, gesondert mergen und deployen.
5. Erst danach Z22 als eigene Production Migration freigeben, anwenden und pruefen.
6. #274 gesondert mergen und deployen; der naechste natuerliche Fuenferlauf muss den
   Parserbefund schliessen.
7. #275 und danach #276 einzeln mergen; jedes Deployment und die neue Folgebasis pruefen.
8. F9 danach als eigene Production Migration freigeben, anwenden und pruefen.
9. Erst dann #277 auf den finalen `main` Stand bringen, Diff und neue Pflicht CI pruefen,
   gesondert mergen, das Production Deployment abwarten und verifizieren.
10. Git SHA, Deployment, Migrationen, Konfiguration und Mandatsmenge danach einfrieren. Ab
    der naechsten UTC Grenze beginnen sieben volle Tage; zwischen F9 und #277 zaehlt nichts.
11. Jede spaetere Aenderung setzt das Fenster auf Tag 1 zurueck. `20260720` bleibt eine
    getrennte Entscheidung und darf kein laufendes Fenster veraendern.

## Verbindliche Reihenfolge vor der ersten Erweiterung

1. Roten Fuenferbefund durch den in PR #274 geprueften Parserfix beheben und danach natuerlich regressieren.
2. #272 bis #276 und Z22/F9 nur in der kontrollierten Vollzugsfolge oben ausfuehren; kein
   Stapelmerge und keine mit einem Merge still freigegebene Migration.
3. Der dokumentierte entfernte Kopf von PR #277 hat gruene Pflicht CI. Die neuen
   lokalen Haertungen brauchen nach dem Hochladen einen eigenen Lauf; Merge bleibt gesperrt.
4. F9 im Testprojekt nur nach eigener Migrationsfreigabe anwenden. **Erledigt.**
5. Z22 im Testprojekt nicht veraendern. Eine lesende Bestandspruefung fand die korrigierte
   Fassung unter `20260827121931`, obwohl die freigegebene Kette Z22 ausschloss. Der Ursprung
   ist offen; der Supabase Lauf hat keine Migration ausgefuehrt.
6. Supabase Probe ausschliesslich mit synthetischen Testauftraegen stufenweise freigeben und
   auswerten. **A bis D sowie die 200er und 500er Proben sind erledigt und gruen.**
7. Azure bleibt nach dem einmalig freigegebenen, vor Kennworteingabe gesperrten
   Anmeldeversuch extern gesperrt. Erst nach neuer Betreiberbestaetigung der Wartezeit
   die Vorprobe mit drei Aufrufen und eigener Kostenfreigabe ausfuehren.
8. Nur bei gruener Vorprobe die weiteren 21 Azure Aufrufe getrennt freigeben.
9. Aus den echten Werten den KI Deckel, die Understanding Reserve und die Kostenobergrenze
   berechnen. Eine Rechnung setzt keine Production Variable.
10. Notwendige Production Migrationen jeweils separat vorbereiten, freigeben und anwenden.
11. Import und Aktivierung jedes neuen Mandatspakets bleiben zwei getrennte Freigaben.

F9 und Z22 im Testprojekt sind keine Erlaubnis fuer Production. Ebenso ist ein Merge keine
Migrationsfreigabe. Diese Grenzen gelten auch dann, wenn alle Tests gruen sind.

## Neu gemessen: Supabase Laeufe A bis D, 200 und 500

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

Lauf B verarbeitete weitere 25 synthetische Auftraege bei Parallelitaet 8. Der GitHub Actions
Lauf `33115237785` war gruen: 66 von 66 HTTP Anfragen mit Status 200, Dauer 8.759 ms,
p50/p95/p99 323/748/2.452 ms, Maximum 2.568 ms, 0 Fehler, 0 unbekannte oder doppelt
reservierte Auftraege und 0 Lease Verluste. Danach lagen im Testprojekt 50 von 50 Auftraegen
abgeschlossen und keine aktive Lease vor. Auch fuer B wurden GitHub Secret, Supabase Secret
Key und einmaliger Workflow entfernt.

Lauf C verarbeitete weitere 50 synthetische Auftraege bei Parallelitaet 16. Der GitHub Actions
Lauf `33146607736` war gruen: 124 von 124 HTTP Anfragen mit Status 200, Dauer 5.732 ms,
p50/p95/p99 314/718/874 ms, Maximum 1.308 ms, 0 Fehler, 0 unbekannte oder doppelt
reservierte Auftraege und 0 Lease Verluste. Danach lagen im Testprojekt 100 von 100 Auftraegen
abgeschlossen und keine aktive Lease vor. Supabase Secret Key, GitHub Actions Secret und
einmaliger Workflow wurden vollstaendig entfernt.

Lauf D verarbeitete weitere 100 synthetische Auftraege bei Parallelitaet 32. Der GitHub Actions
Lauf `33149820784` war gruen: 240 von 240 HTTP Anfragen mit Status 200, Dauer 7.321 ms,
p50/p95/p99 234/974/1.313 ms, Maximum 1.665 ms, 0 Fehler, 0 unbekannte oder doppelt
reservierte Auftraege und 0 Lease Verluste. Danach lagen im Testprojekt 200 von 200 Auftraegen
abgeschlossen und keine aktive Lease vor. Supabase Secret Key, GitHub Actions Secret und
einmaliger Workflow wurden vollstaendig entfernt; der Bereinigungscommit `98c2a353` startete
keinen zweiten D Lauf.

Die erste 200er Ausfuehrung stoppte vor jeder Mutation durch einen Transportaussetzer. Die
getrennt freigegebene Wiederholung `33154767024` war gruen: 200 von 200 Auftraegen, 440 von
440 HTTP Anfragen mit Status 200, Dauer 6.584 ms, p50/p95/p99/max
172/717/1.409/1.434 ms, 0 Fehler und 0 Lease Verluste. Danach lagen 400 Testauftraege
abgeschlossen vor, sonst 0. Alle temporaeren Bestandteile wurden entfernt; `b21ddac1` startete
keinen zweiten Wiederholungslauf.

Die 500er Probe `33158170030` war beim ersten Versuch gruen: 500 von 500 Auftraegen, exakt
1.040 HTTP Anfragen mit Status 200, Dauer 7.818 ms, p50/p95/p99/max
127/382/440/1.266 ms, Gleichzeitigkeitsspitze 32 und 0 Fehler, Drosselungen oder Lease
Verluste. Jedes der 500 synthetischen Mandate war genau einmal vertreten. Danach lagen 900
Testauftraege abgeschlossen vor, sonst 0. Supabase Schluessel, GitHub Geheimnis und Workflow
wurden entfernt; `8ecff689` startete keinen weiteren Lauf.

## Noch fehlende Z3b Werte

| Bereich | Bereits vorhanden | Noch offen |
|---|---|---|
| Supabase Netzweg | A bis D sowie 200 und 500 gruen, Parallelitaet bis 32 | keine weitere Plattformstufe bis zum Ziel 500 |
| Fachwege 25/50/100 | Z3a abgeschlossen | keine Wiederholung; nur gezielte Regression nach echter Aenderung oder neuen Anbieterwerten |
| Azure | Werkzeug offline gruen; kontrollierte Anmeldung vor Kennworteingabe gesperrt | neue Betreiberbestaetigung nach Wartezeit; Modell, Deploymentart, Region und Kontopreis belegen; danach 3 und getrennt 21 Aufrufe |
| KI Deckel | K1 ergibt mindestens 399 fuer 200 und 999 fuer 500 bei 50 Prozent Globalanteil | echter klassenweiser Tagesbedarf, harte Tokenkostenbegrenzung und Betreiberkostenrahmen fehlen |
| Echter Google Sonderweg | lokaler Fachpfad begrenzt Redirect, Retry und Aufloesung je Hop | `proHttpVersuchGlobal` bleibt falsch; M1, Quote, Versorgung bis 500 und Einbindung in das Kapazitaetstor nicht gemessen; nichts deployt |
| Plattformbetrieb | Supabase Warteschlangenweg isoliert bis 500 gruen; lokale 51er Backup und Retention Vertraege gehaertet | Tarif, PITR, Snapshot, echter Restore, wirksame Aufbewahrung, Vercel Laufzeit und Ereignistransport fehlen |
| Aktivierung bis 100 | Stufenplan und Stopkriterien vorhanden | beweissichere Tagesbelege sowie finale Zahlen fuer Deckel, Kosten und Slotreserve |
| 200 und 500 | strategischer Weg festgelegt; Supabase 200 und 500 gruen | neue vollstaendige Fachwegmessungen und natuerliche Realstufen bleiben offen |

## Stufentore

| Ziel | Technischer Mindestnachweis | Vorheriger Realbetrieb | Zusaetzliche Voraussetzung |
|---:|---|---|---|
| 10 | vorhandene 25er Fachwegmessung als obere Huelle; Supabase A und B gruen; Azure Stichprobe | 5 Mandate, sieben gruene Tage | Fuenferregression, PR #272 bis #276 deployt und notwendige Migrationen abgeschlossen; KI Deckel gesetzt |
| 25 | Z3a 25 bleibt Regression; Supabase Laeufe A und B gruen | 10 Mandate, sieben gruene Tage | eigene Import- und Aktivierungsfreigabe |
| 50 | Z3a 50 bleibt Regression; Supabase 50 gruen | 25 Mandate, sieben gruene Tage | Morgenlage ueber tragfaehigen Warteschlangenpfad; Aufbewahrung aktiv und belegt |
| 100 | Z3a 100 bleibt Regression; Supabase 100 gruen | 50 Mandate, sieben gruene Tage | Slotkapazitaet mit Reserve; Supabase Tarif, PITR und Speichergrenze entschieden |
| 200 | **neue** 200er Fachwegmessung; Supabase 200 gruen | 100 Mandate, sieben gruene Tage | Ereignisantrieb beziehungsweise grosser Transportweg und Kostenrahmen entschieden |
| 500 | **neue** 500er Fachwegmessung; Supabase 500 gruen | 200 Mandate, sieben gruene Tage | Anbieter-, Speicher-, Aufbewahrungs- und Betriebskapazitaet fuer 500 belegt |

Eine neue 200er oder 500er Messung ist keine Wiederholung des abgeschlossenen Z3a Nachweises,
sondern eine neue, bisher ungemessene Stufe. Sie wird trotzdem erst ausgefuehrt, wenn das
vorherige Tor gruen ist.

Die Aktivierung von 500 ist noch kein Production Aufnahmebeweis. Dieser entsteht erst nach
einem eigenen vollstaendigen, gruenen Siebentagefenster mit stabil genau 500 aktiven Mandaten,
belegtem Ereignistransport und gegen unveraenderliche Production Quellen bestaetigten Tageswerten.

### Lokaler Fachwegvertrag fuer 200 und 500

`scripts/skalierung-z3b-fachweg.js` ist fuer genau eine Zielstufe 200 oder 500 und eine
stufenbezogene Laufkennung gebaut. Fuer einen beweissicheren Lauf muss der aeussere Riegel
vor jeder Ausfuehrung Folgendes gegen vertrauenswuerdige Belege pruefen:

1. den vollstaendigen Azure Stichprobenbericht mit genau 7 echten Werten fuer Verstehen, Lage
   und Buero, ohne Wiederholung und mit hoechstens 7 UTC Tagen Alter,
2. sieben lueckenlose, vollstaendige und gruene Production Tage mit 100 aktiven Mandaten vor
   der 200er Messung beziehungsweise 200 aktiven Mandaten vor der 500er Messung,
3. eine gruene Slotreserve der Vorstufe sowie ein neues Ausgabeverzeichnis, damit kein Beleg
   ueberschrieben wird,
4. den vollstaendigen Vollzug von #272 bis #276, F9 und Z22 samt gruener Fuenferregression
   sowie einen gesetzten KI Deckel oberhalb der Fairness Untergrenze der Vorstufe.

Die erste 21er Azure Stichprobe kann wegen des Siebentage Altersriegels nicht die gesamte
natuerliche Stufenkette bis 500 tragen. Vor einem spaeteren 200er oder 500er Fachweg ist daher
eine neue, separat kostenfreigegebene 21er Auffrischung noetig. Der Altersriegel wird nicht
gelockert und es gibt keinen automatischen Wiederholungsaufruf.

Der innere Lauf ist lokal mit 60 Integritaetspruefungen auf feste Parameter, sechs Slots,
vollstaendige Kindbilanzen, Codehashes und neue Ausgaben gehaertet. Hinzu kommen 45 Pruefungen
des aeusseren Vertrags und 18 des konstruktiven Aussenriegels, jeweils ohne Fehler. Weil
externe Azure und Production Herkunft fehlen, kann kein formales Eingabeobjekt den
Prozessstart oder Plattformaufbau freigeben.

Auch die Arbeitsformen sind noch nicht vollstaendig: Der Queue Fachweg fuehrt keinen echten
Buero Handler aus und zaehlt deshalb ehrlich `buero: 0`. Er erzeugt keinen
Tagesbedarfsbericht und keine Deckel oder Kostenentscheidung. Ausgefuehrt wurde weder eine
200er noch eine 500er Fachwegmessung; die natuerlichen Vorstufen 100 und 200 fehlen ebenfalls.

## Wie der KI Deckel bestimmt wird

Der Produktionsdeckel begrenzt Aufrufe, nicht Token. Deshalb werden beide Groessen getrennt
berechnet:

1. Tagesbedarf p95 fuer Verstehen, Lage und Buero addieren.
2. Fuer 25 Prozent freie Kapazitaet den Bedarf durch 0,75 teilen und aufrunden.
3. Die Understanding Reserve innerhalb dieses Gesamtdeckels berechnen; sie wird nie zum
   Gesamtdeckel addiert.
4. Echte Azure p95 Token je Arbeitsform mit dem Tagesbedarf multiplizieren.
5. Mit dem am Lauftag belegten Azure Preis die p95 Schaetzung und das Szenario mit den hoechsten
   beobachteten Tokenwerten berechnen. Beides ist ohne wirksame Production Tokenhartgrenze
   keine mathematische Kostenobergrenze.

Die aktuelle Kapazitaetsauswertung prueft diese Rechnung lokal mit 90 Faellen, bleibt aber
absichtlich `nicht-entscheidungsreif`: Der vollstaendige Fachweg Gesamtbericht, Buero Bedarf,
externe Herkunft, wirksamer Kostenstopp und Production Vollzug sind nicht belegt.

### Fairness-Untergrenze K1

Die reine Bedarfsrechnung reicht nicht. Der wirksame Tagesplan reserviert standardmaessig
50 Prozent des Gesamtdeckels fuer globale Arbeit. Bei Gesamtdeckel 100 bleiben deshalb nur
50 Mandatsplaetze je Tag. Die vollstaendige faire Rotation dauert damit bei 200 Mandaten
4 Tage beziehungsweise 96 Stunden und bei 500 Mandaten 10 Tage beziehungsweise 240 Stunden.
Beides liegt ueber der 48-Stunden-Obergrenze des Budgetwartens; nicht bediente
`tenant_narrative`-Auftraege koennen danach endgueltig scheitern und werden von der
Wiedervorlage nicht automatisch geheilt.

Fuer ein taegliches Narrativ jedes aktiven Mandats muss der Deckel bei unveraendertem
Globalanteil mindestens `2n - 1` betragen: 399 fuer 200 und 999 fuer 500 Mandate. Die spaetere
Empfehlung ist deshalb das Maximum aus gemessenem Tagesbedarf mit 25 Prozent Reserve und
dieser Fairness-Untergrenze. Das Z3b-Entscheidungstor prueft beides fail-closed. Es setzt
keinen Deckel und entscheidet weder den Globalanteil noch die Kosten; das bleiben getrennte
Betreiberentscheidungen.

Das Ergebnis ist eine Betreiberempfehlung. Das Setzen des Deckels ist eine gesonderte
Production Aenderung und bleibt bis zur ausdruecklichen Freigabe gesperrt.

## Gruenes Beobachtungsfenster

Vor jeder naechsten Aktivierungsstufe braucht die vorherige Stufe mindestens sieben
vollstaendige, lueckenlos aufeinanderfolgende UTC Kalendertage. Alle muessen dieselbe
aktive Vorstufe belegen. Jeder einzelne Tag muss folgende Bedingungen erfuellen:

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
