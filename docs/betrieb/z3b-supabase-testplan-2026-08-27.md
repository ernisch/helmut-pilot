# Z3b Supabase Testplan vom 27.08.2026

## Stand

Das isolierte Projekt `Helmut Z3b Test` mit der Kennung `ffzaxdbatoamsovncrym` ist aktiv und
verursacht laut Kostenabfrage derzeit 0 USD pro Monat. Production hat die Kennung
`ddckuvvpcytqbyfmbvie` und ist fuer diesen Test ausdruecklich gesperrt.

Am 27.08.2026 wurden nach ausdruecklicher Freigabe genau die drei Basismigrationen angewendet.
Vorhanden ist eine leere Warteschlangentabelle mit 0 Zeilen. F9 und Z22 fehlen weiterhin.
Es gab keinen Import, keine Testdaten und keinen Zugriffsschluessel im Repository oder im Chat.

Der begrenzte Messlaeufer ist inzwischen **nur lokal vorbereitet**, aber nicht gegen Supabase
gestartet. Sein Offline Vertragstest steht bei 46 PASS und 0 FAIL. Er verlangt F9 und Z22 als
lesbar nachgewiesene Voraussetzungen. Im heutigen Basiszustand bricht er deshalb vor dem ersten
synthetischen Auftrag ab. Es wurde weiterhin kein Testschluessel angefordert oder verwendet.

Das strategische Skalierungsziel ist jetzt **500 Mandate**. Die sichere Aktivierung bleibt
gestuft. Zuerst wird die Stufe bis 100 abgeschlossen, danach folgen 200 und 500 als eigene,
noch ungemessene Stufen. Dafuer ist kein weiteres Supabase Projekt erforderlich.

## Was noch gemessen werden muss

Z2 und Z3a sind abgeschlossen. Sie werden nicht wiederholt. Der neue Nachweis misst nur die
noch unbekannten Eigenschaften der echten Supabase Plattform:

| Wert | Messung |
|---|---|
| Datenschnittstelle | Antwortzeit p50, p95 und p99 je RPC |
| Stabilitaet | HTTP Fehler, Zeitueberschreitungen, 429 und 5xx |
| Parallelitaet | Verhalten bei 4, 8, 16 und hoechstens 32 gleichzeitigen Anfragen |
| Warteschlange | Einreihen, Reservieren, Abschliessen und lesende Kennzahlen |
| Z22 | getrennte Gegenprobe mit und ohne Mandatsfilter |

Die Zahlen aus Z3a fuer 5, 25, 50 und 100 Mandate sind nur Vergleichswerte. Sie werden nicht
als neuer Nachweis ausgegeben und der Fachlauf wird nicht erneut gefahren. Fuer 200 und 500
existieren noch keine Messwerte. Sie werden nicht erfunden oder aus einer linearen Rechnung
als Beweis ausgegeben.

## Stufen bis zum Ziel 500

| Stufe | Zweck | Nachweisstand |
|---:|---|---|
| 5 | bestehender Production Betrieb | technisch belegt, natuerlicher Abschlusscheck noch offen |
| 10 | erste Aktivierungsstufe | kein eigener Volltest, nur kontrollierte Production Stufe |
| 25 | erste Verkaufsstufe | Z2 und Z3a abgeschlossen, Z3b Plattformwerte offen |
| 50 | Zwischenstufe | Z2 und Z3a abgeschlossen, Z3b Plattformwerte offen |
| 100 | erstes sicheres Kapazitaetstor | Z2 und Z3a abgeschlossen, Z3b Plattformwerte offen |
| 200 | neue Messstufe | erst nach gruenem 100er Tor |
| 500 | strategisches Ziel | erst nach gruenem 200er Tor |

## Kleinste Migrationskette

Das gesamte Helmut Schema ist fuer diese Plattformmessung nicht erforderlich. Es gibt drei
getrennte Pakete. Nur das Basispaket ist bereits angewendet:

| Paket | Reihenfolge | Zweck |
|---|---|---|
| Basis | `20260808_scalable_job_queue.sql`, `20260808_jobqueue_abhaengigkeiten.sql`, `20260812_jobqueue_altersmessung.sql` | angewendet, leer und geprueft |
| Ankunft | `20260825101500_jobqueue_ankunftskennzahl.sql` | nicht angewendet, eigene Freigabe erforderlich |
| Z22 | `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` | nicht angewendet, eigene Freigabe erforderlich |

Zu jeder Datei ist der vorhandene Rueckweg fest zugeordnet. `20260720`, das Vollschema und
alle Repository Seeds sind ausgeschlossen.

## Testdaten

Es gibt keinen Import und keine Kopie aus Production. Der spaetere Lauf erzeugt ausschliesslich
kuenstliche Auftraege mit Kennungen wie `z3b-synth-mandat-0000`. Die Nutzlast enthaelt nur
Laufnummern und die Markierungen `z3b` und `synthetisch`. Namen, Dokumente, Quelleninhalte und
sonstige personenbezogene Daten sind nicht Teil der Probe.

Die Groessenklassen sind getrennt. Keine groessere Klasse startet automatisch:

| Freigabepaket | Kuenstliche Auftraege maximal | HTTP Anfragen maximal |
|---|---:|---:|
| bis 100 | 250 | 1000 |
| 200 | 200 | 500 |
| 500 | 500 | 1250 |

Alle Pakete haben keine automatischen Wiederholungen und stoppen nach zwei aufeinanderfolgenden
429 oder 5xx Antworten. Eine hoehere Parallelitaet als 32 ist nicht Teil dieses Plans. Echte
Quellen oder Azure Aufrufe sind in diesen Supabase Proben ausgeschlossen.

## Kapazitaetsfragen fuer 500

Vor einer Aktivierung von 500 muessen fuenf Werte aus echten, begrenzten Messungen feststehen:

1. Supabase Antwortzeit, Fehlerquote und Poolverhalten
2. echter KI Bedarf und echte Tokenmenge
3. notwendiger KI Tagesdeckel
4. notwendige Zahl und Dauer der Verarbeitungsslots
5. Speicherwachstum, Aufbewahrung und passender Supabase Tarif

Eine gruene Warteschlange allein reicht fuer die Aktivierung nicht.

## Sicherheitsgrenzen

Der lokale Vertrag akzeptiert nur die exakte HTTPS Basis URL des Testprojekts. Die Production
Kennung, jede andere Projektkennung, URL Pfade, Parameter und Zugangsdaten in der URL fuehren
vor dem ersten Netzaufruf zum Abbruch.

Ein Dienstschluessel wird erst fuer den spaeteren Testlauf benoetigt. Er darf nur in einer
geschuetzten Laufzeitvariable liegen und weder in Git noch in einem Bericht oder Chat erscheinen.
Ohne diesen Schluessel kann und soll der vorbereitete Plan nichts ausfuehren.

Der Messlaeufer verwendet eigene `HELMUT_Z3B_*` Variablen und verweigert den Start, wenn daneben
allgemeine Supabase oder Anbieterkennungen sichtbar sind. Zusaetzlich ist fuer jeden einzelnen
Lauf eine Kennung aus Testprojekt, Messstufe und Laufkennung erforderlich. Eine Freigabe fuer eine
Stufe schaltet keine groessere Stufe frei.

Nach der aktuellen Supabase Schluesselregel wird ein neuer `sb_secret_...` Schluessel bevorzugt
und ausschliesslich im `apikey` Kopf gesendet. Ein alter JWT basierter `service_role` Schluessel
bleibt nur als gepruefter Rueckfall moeglich. Publishable und Anon Schluessel werden abgelehnt.
Der Wert selbst ist im Konfigurationsobjekt nicht aufzaehlbar; Antwortruempfe, Auftragskennungen
und Nutzdaten werden nicht in den Messbericht uebernommen.

Der Messlaeufer besitzt keinen Loesch oder Aufraeumpfad. Synthetische Zeilen zu entfernen bleibt
damit technisch und organisatorisch ein eigener, ausdruecklich freizugebender Schritt.

## Getrennte Freigaben fuer die naechsten Schritte

1. Ankunftsmigration im Testprojekt anwenden
2. Z22 Migration im Testprojekt separat anwenden
3. Testzugang sicher bereitstellen und die begrenzte Probe bis 100 starten
4. Bei gruenem 100er Ergebnis die neue Probe fuer 200 getrennt freigeben
5. Bei gruenem 200er Ergebnis die neue Probe fuer 500 getrennt freigeben
6. Ausschliesslich synthetische Testzeilen wieder entfernen

Jeder Schritt bleibt bis zu seiner ausdruecklichen Freigabe gesperrt. Kein Schritt beruehrt
Production, fuehrt einen Import aus oder aktiviert ein Mandat.
