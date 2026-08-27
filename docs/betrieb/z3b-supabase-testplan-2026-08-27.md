# Z3b Supabase Testplan vom 27.08.2026

## Stand

Das isolierte Projekt `Helmut Z3b Test` mit der Kennung `ffzaxdbatoamsovncrym` ist aktiv und
verursacht laut Kostenabfrage derzeit 0 USD pro Monat. Production hat die Kennung
`ddckuvvpcytqbyfmbvie` und ist fuer diesen Test ausdruecklich gesperrt.

Am 27.08.2026 wurden nach ausdruecklicher Freigabe genau die drei Basismigrationen und danach
F9 angewendet. Eine spaetere rein lesende Bestandspruefung fand ausserdem Z22 in der
Migrationshistorie unter `20260827121931`. Die fuer die aktuelle Arbeit freigegebene Kette
schloss Z22 aus, und Lauf A hat keine Migration ausgefuehrt. Deshalb bleibt die Herkunft dieses
Vorbestands offen. Die installierte Funktion entspricht der korrigierten Fassung, ist ein
Security Invoker mit festem Suchpfad und zaehlt global sowie mandatsbezogen wie erwartet. Sie
wird ohne eigene Freigabe weder veraendert noch zurueckgebaut.

Der begrenzte Messlaeufer steht offline bei 46 PASS und 0 FAIL. **Lauf A wurde einmal gegen
PostgREST ausgefuehrt und ist gruen:** 25 synthetische Auftraege bei Parallelitaet 4, genau
62 HTTP Anfragen, 25 Reservierungen und 25 Abschluesse. Alle Testzeilen sind abgeschlossen;
es gibt keine aktive Lease. Der temporaere Testschluessel, das GitHub Actions Secret und der
einmalige Workflow wurden danach entfernt. Der Schluessel erschien weder in Chat, Code noch
Protokollen. Die 25 Testzeilen bleiben gemaess Freigabe erhalten. Es gab keinen Import und
keine Production Aenderung.

Das strategische Skalierungsziel ist jetzt **500 Mandate**. Die sichere Aktivierung bleibt
gestuft. Zuerst wird die Stufe bis 100 abgeschlossen, danach folgen 200 und 500 als eigene,
noch ungemessene Stufen. Dafuer ist kein weiteres Supabase Projekt erforderlich.

## Was noch gemessen werden muss

Z2 und Z3a sind abgeschlossen. Sie werden nicht wiederholt. Der neue Nachweis misst nur die
noch unbekannten Eigenschaften der echten Supabase Plattform:

| Wert | Messung |
|---|---|
| Datenschnittstelle | Lauf A gemessen; p50/p95/p99 gesamt 339/654/808 ms; B bis D offen |
| Stabilitaet | Lauf A: 0 HTTP Fehler, Zeitueberschreitungen, 429 und 5xx; B bis D offen |
| Parallelitaet | 4 gemessen; Verhalten bei 8, 16 und hoechstens 32 gleichzeitigen Anfragen offen |
| Warteschlange | Lauf A vollstaendig gemessen; dieselben Endzustaende in B bis D offen |
| Z22 | Funktion lesend mit globaler und eigener Mandatssicht gegengeprueft; Herkunft der Migration offen |

Die Zahlen aus Z3a fuer 5, 25, 50 und 100 Mandate sind nur Vergleichswerte. Sie werden nicht
als neuer Nachweis ausgegeben und der Fachlauf wird nicht erneut gefahren. Fuer 200 und 500
existieren noch keine Messwerte. Sie werden nicht erfunden oder aus einer linearen Rechnung
als Beweis ausgegeben.

## Stufen bis zum Ziel 500

| Stufe | Zweck | Nachweisstand |
|---:|---|---|
| 5 | bestehender Production Betrieb | technisch belegt, natuerlicher Abschlusscheck noch offen |
| 10 | erste Aktivierungsstufe | kein eigener Volltest, nur kontrollierte Production Stufe |
| 25 | erste Verkaufsstufe | Z2 und Z3a abgeschlossen, Z3b Lauf A gruen und Lauf B offen |
| 50 | Zwischenstufe | Z2 und Z3a abgeschlossen, Z3b Plattformwerte offen |
| 100 | erstes sicheres Kapazitaetstor | Z2 und Z3a abgeschlossen, Z3b Plattformwerte offen |
| 200 | neue Messstufe | erst nach gruenem 100er Tor |
| 500 | strategisches Ziel | erst nach gruenem 200er Tor |

## Kleinste Migrationskette

Das gesamte Helmut Schema ist fuer diese Plattformmessung nicht erforderlich. Es gibt drei
getrennte Pakete. Basis und F9 wurden freigegeben angewendet; Z22 wurde als ungeklärter
Vorbestand gefunden:

| Paket | Reihenfolge | Zweck |
|---|---|---|
| Basis | `20260808_scalable_job_queue.sql`, `20260808_jobqueue_abhaengigkeiten.sql`, `20260812_jobqueue_altersmessung.sql` | angewendet und geprueft; seit Lauf A 25 abgeschlossene synthetische Zeilen |
| Ankunft | `20260825101500_jobqueue_ankunftskennzahl.sql` | angewendet und lesend geprueft |
| Z22 | `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` | als Vorbestand unter `20260827121931` gefunden und lesend geprueft; Herkunft offen |

Zu jeder Datei ist der vorhandene Rueckweg fest zugeordnet. `20260720`, das Vollschema und
alle Repository Seeds sind ausgeschlossen.

## Testdaten

Es gibt keinen Import und keine Kopie aus Production. Lauf A erzeugte ausschliesslich
kuenstliche Auftraege mit Kennungen wie `z3b-synth-mandat-0000`; spaetere Laeufe duerfen nur
dasselbe Datenmuster verwenden. Die Nutzlast enthaelt nur Laufnummern und die Markierungen
`z3b` und `synthetisch`. Namen, Dokumente, Quelleninhalte und sonstige personenbezogene Daten
sind nicht Teil der Probe.

Die Groessenklassen sind getrennt. Keine groessere Klasse startet automatisch:

| Freigabepaket | Kuenstliche Auftraege maximal | HTTP Anfragen maximal |
|---|---:|---:|
| bis 100 | 250 | 1000 |
| 200 | 200 | 500 |
| 500 | 500 | 1250 |

Alle Pakete haben keine automatischen Wiederholungen und stoppen nach zwei aufeinanderfolgenden
429 oder 5xx Antworten. Eine hoehere Parallelitaet als 32 ist nicht Teil dieses Plans. Echte
Quellen oder Azure Aufrufe sind in diesen Supabase Proben ausgeschlossen.

## Kleinste genaue Messfolge bis 100

Die vier erlaubten Parallelitaetswerte werden mit insgesamt nur 200 synthetischen Auftraegen
abgedeckt. Damit bleibt die gesamte Folge deutlich unter beiden Riegeln des Pakets bis 100.
Jede Zeile ist ein eigener Lauf mit eigener Laufkennung und eigener Freigabe. Ein gruener Lauf
startet den naechsten niemals automatisch.

| Lauf | Messstufe | Auftraege | Parallelitaet | HTTP Obergrenze |
|---:|---:|---:|---:|---:|
| A | 25 | 25 | 4 | 62, **erledigt und gruen** |
| B | 25 | 25 | 8 | 66, offen |
| C | 50 | 50 | 16 | 124, offen |
| D | 100 | 100 | 32 | 240, offen |
| **Gesamt** | bis 100 | **200** | hoechstens 32 | **492** |

Die zweite 25er Messung ist keine Wiederholung des Fachnachweises. Beide 25er Laeufe messen
ausschliesslich den echten Supabase Netzweg bei zwei verschiedenen Parallelitaetswerten. Z2 und
Z3a werden dabei nicht gestartet.

### Ergebnis Lauf A

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33105081744`, erfolgreich |
| Dauer | 8.218 ms |
| Einreihen / Reservieren / Abschliessen | 25 / 25 / 25 |
| Anfragen | 62 von hoechstens 62, alle HTTP 200 |
| RPC Verteilung | Kennzahlen 2, Ankunft 2, offene Auftraege 4, Einreihen 25, Reservieren 4, Abschliessen 25 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 128 / 339 / 654 / 808 / 1.265 / 319,7 ms |
| hoechste Gleichzeitigkeit | 4 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Endstand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 25 / 0 / 0 / 0 / 0 |

Eine getrennte rein lesende Datenbankabfrage bestaetigte denselben Endstand. Die erste Zeile
entstand um 18:46:02 UTC, der letzte Abschluss um 18:46:06 UTC. Die Zeilen wurden nicht
geloescht. GitHub Secret, Supabase Secret Key und Workflow sind vollstaendig entfernt; der
Bereinigungscommit startete keinen weiteren Actions Lauf und kein Deployment.

### Lesende Datenbankhinweise nach Lauf A

Die Supabase Advisor Pruefung um 19:38 UTC meldete keine Warnung und keinen kritischen Befund,
sondern vier Hinweise:

1. **Security, INFO:** RLS ist auf `helmut_jobs` aktiv, aber es gibt keine Policy. Die
   Gegenprobe bestaetigt den beabsichtigten reinen Serverzugang: `anon` und `authenticated`
   haben kein Leserecht, nur `service_role` hat es. Damit ist keine Korrektur erforderlich.
   Referenz: [RLS aktiv ohne Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
2. **Performance, dreimal INFO:** `helmut_jobs_tenant_idx`, `helmut_jobs_window_idx` und
   `helmut_jobs_fenster_typ_idx` stehen bei jeweils 0 registrierten Scans. Bei nur 25 Zeilen
   ist das kein belastbarer Entfernungsgrund; PostgreSQL darf hier den kurzen Tabellenscan
   waehlen. Der groessere PostgreSQL 17.6 Nachweis hatte den Fensterindex bereits benutzt.
   Deshalb wird kein Index entfernt. Erneute Bewertung erst mit einer groesseren,
   freigegebenen Stufe. Referenz: [unbenutzter Index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

Die Pruefung war ausschliesslich lesend. Es gab keine DDL, Migration oder Bereinigung.

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

Ein Dienstschluessel wird fuer jeden spaeteren Testlauf neu benoetigt. Er darf nur in einer
geschuetzten Laufzeitvariable liegen und weder in Git noch in einem Bericht oder Chat erscheinen.
Der Schluessel fuer Lauf A wurde nach dem Lauf geloescht. Ohne einen neuen, getrennt
freigegebenen Schluessel kann und soll der vorbereitete Plan nichts ausfuehren.

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

1. Ankunftsmigration im Testprojekt anwenden — erledigt
2. Z22 Vorbestand nicht veraendern und Herkunft getrennt klaeren — offen, kein Laufblocker
3. Lauf A mit eigenem Testzugang — erledigt; Zugang und Workflow entfernt
4. Lauf B, danach C und D jeweils getrennt freigeben — offen
5. Bei gruenem 100er Ergebnis die neue Probe fuer 200 getrennt freigeben
6. Bei gruenem 200er Ergebnis die neue Probe fuer 500 getrennt freigeben
7. Ausschliesslich synthetische Testzeilen wieder entfernen

Jeder Schritt bleibt bis zu seiner ausdruecklichen Freigabe gesperrt. Kein Schritt beruehrt
Production, fuehrt einen Import aus oder aktiviert ein Mandat.
