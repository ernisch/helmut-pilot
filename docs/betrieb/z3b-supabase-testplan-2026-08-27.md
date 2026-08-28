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

Der begrenzte Messlaeufer steht offline bei 51 PASS und 0 FAIL. **A bis D sowie die 200er und
500er Proben wurden gegen PostgREST ausgefuehrt und sind gruen:** 25, 25, 50, 100, 200 und
500 synthetische Auftraege bei Parallelitaet 4, 8, 16 und 32 sowie exakt 62, 66, 124, 240,
440 und 1.040 HTTP Anfragen. Alle 900 Testzeilen sind abgeschlossen; es gibt keine aktive
Lease. Die Supabase Testschluessel, GitHub Actions Secrets und einmaligen Workflows wurden
danach vollstaendig entfernt. Ein Schluessel erschien weder in Chat, Code noch Protokollen.
Es gab keinen Import und keine Production Aenderung.

Der Messlaeufer prueft die Mandatszuordnung jeder vom Claim gelieferten Zeile und stoppt bei
jeder Abweichung vor dem Abschluss. Im echten 500er Plattformlauf endeten 500 von 500
Auftraegen korrekt und jedes synthetische Mandat war genau einmal vertreten.

Das strategische Skalierungsziel ist jetzt **500 Mandate**. Der isolierte Supabase Plattformweg
ist bis 500 abgeschlossen. Die sichere echte Aktivierung bleibt trotzdem gestuft; insbesondere
sind neue Fachwegmessungen und der Realbetrieb nicht durch diesen Plattformtest ersetzt.

## Was noch gemessen werden muss

Z2 und Z3a sind abgeschlossen. Sie werden nicht wiederholt. Der neue Nachweis misst nur die
noch unbekannten Eigenschaften der echten Supabase Plattform:

| Wert | Messung |
|---|---|
| Datenschnittstelle | bis 500 gemessen; 500 bei p50/p95/p99 127/382/440 ms |
| Stabilitaet | A bis D, 200 und 500: 0 HTTP Fehler, Zeitueberschreitungen, 429 und 5xx |
| Parallelitaet | 4, 8, 16 und 32 gemessen |
| Warteschlange | bis 500 vollstaendig gemessen; alle 900 Testauftraege abgeschlossen |
| Z22 | Funktion lesend mit globaler und eigener Mandatssicht gegengeprueft; Herkunft der Migration offen |

Die Zahlen aus Z3a fuer 5, 25, 50 und 100 Mandate sind nur Vergleichswerte. Sie werden nicht
als neuer Nachweis ausgegeben und der Fachlauf wird nicht erneut gefahren. Fuer 200 und 500
existieren jetzt echte Supabase Plattformwerte, aber noch keine neuen Fachwegwerte. Diese
beiden Beweisarten werden nicht vermischt.

## Stufen bis zum Ziel 500

| Stufe | Zweck | Nachweisstand |
|---:|---|---|
| 5 | bestehender Production Betrieb | technischer Betrieb belegt; natuerliche Fuenferregression rot |
| 10 | erste Aktivierungsstufe | kein eigener Volltest, nur kontrollierte Production Stufe |
| 25 | erste Verkaufsstufe | Z2 und Z3a abgeschlossen, Z3b Laeufe A und B gruen |
| 50 | Zwischenstufe | Z2 und Z3a abgeschlossen, Z3b Lauf C gruen |
| 100 | erstes sicheres Kapazitaetstor | Z2 und Z3a abgeschlossen, Z3b Lauf D gruen |
| 200 | neue Messstufe | Supabase Plattform gruen; Fachweg und Realstufe offen |
| 500 | strategisches Ziel | Supabase Plattform gruen; Fachweg und Realstufe offen |

## Kleinste Migrationskette

Das gesamte Helmut Schema ist fuer diese Plattformmessung nicht erforderlich. Es gibt drei
getrennte Pakete. Basis und F9 wurden freigegeben angewendet; Z22 wurde als ungeklärter
Vorbestand gefunden:

| Paket | Reihenfolge | Zweck |
|---|---|---|
| Basis | `20260808_scalable_job_queue.sql`, `20260808_jobqueue_abhaengigkeiten.sql`, `20260812_jobqueue_altersmessung.sql` | angewendet und geprueft; 900 abgeschlossene synthetische Zeilen |
| Ankunft | `20260825101500_jobqueue_ankunftskennzahl.sql` | angewendet und lesend geprueft |
| Z22 | `20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` | als Vorbestand unter `20260827121931` gefunden und lesend geprueft; Herkunft offen |

Zu jeder Datei ist der vorhandene Rueckweg fest zugeordnet. `20260720`, das Vollschema und
alle Repository Seeds sind ausgeschlossen.

## Testdaten

Es gibt keinen Import und keine Kopie aus Production. A bis D, 200 und 500 erzeugten ausschliesslich
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

Die Paketgrenzen sind nur die aeusserste Plausibilitaetsgrenze fuer einen Plan. Im ausgefuehrten
Messlauf sperrt der Zaehler technisch an der kleineren, fuer den einzelnen Lauf exakt
vorausberechneten HTTP Obergrenze: 62 fuer A, 66 fuer B, 124 fuer C, 240 fuer D,
440 fuer 200 und 1.040 fuer 500 Auftraege.

## Kleinste genaue Messfolge bis 100

Die vier erlaubten Parallelitaetswerte werden mit insgesamt nur 200 synthetischen Auftraegen
abgedeckt. Damit bleibt die gesamte Folge deutlich unter beiden Riegeln des Pakets bis 100.
Jede Zeile ist ein eigener Lauf mit eigener Laufkennung und eigener Freigabe. Ein gruener Lauf
startet den naechsten niemals automatisch.

| Lauf | Messstufe | Auftraege | Parallelitaet | HTTP Obergrenze |
|---:|---:|---:|---:|---:|
| A | 25 | 25 | 4 | 62, **erledigt und gruen** |
| B | 25 | 25 | 8 | 66, **erledigt und gruen** |
| C | 50 | 50 | 16 | 124, **erledigt und gruen** |
| D | 100 | 100 | 32 | 240, **erledigt und gruen** |
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

### Ergebnis Lauf B

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33115237785`, erfolgreich |
| Dauer | 8.759 ms |
| Einreihen / Reservieren / Abschliessen | 25 / 25 / 25 |
| Anfragen | 66 von hoechstens 66, alle HTTP 200 |
| RPC Verteilung | Kennzahlen 2, Ankunft 2, offene Auftraege 4, Einreihen 25, Reservieren 8, Abschliessen 25 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 101 / 323 / 748 / 2.452 / 2.568 / 356,7 ms |
| hoechste Gleichzeitigkeit | 8 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Laufendstand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 25 / 0 / 0 / 0 / 0 |
| Gesamtbestand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 50 / 0 / 0 / 0 / 0 |

Der Lauf erreichte eine Abflussquote von 1 und hinterliess keine aktive Lease. GitHub Secret,
Supabase Secret Key und einmaliger Workflow wurden danach vollstaendig entfernt. Die insgesamt
50 synthetischen Zeilen bleiben wie freigegeben erhalten. Es wurde kein weiterer Lauf, kein
Deployment und keine Production Aenderung ausgeloest.

### Ergebnis Lauf C

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33146607736`, erfolgreich |
| Dauer | 5.732 ms |
| Einreihen / Reservieren / Abschliessen | 50 / 50 / 50 |
| Anfragen | 124 von hoechstens 124, alle HTTP 200 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 97 / 314 / 718 / 874 / 1.308 / 309,3 ms |
| hoechste Gleichzeitigkeit | 16 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Laufendstand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 50 / 0 / 0 / 0 / 0 |
| Gesamtbestand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 100 / 0 / 0 / 0 / 0 |

Der Lauf erreichte eine Abflussquote von 1 und hinterliess keine aktive Lease. Der temporaere
Supabase Secret Key und der einmalige Workflow wurden entfernt. Nach erneuter GitHub
Identitaetsbestaetigung wurde auch das GitHub Actions Secret sichtbar und nachweisbar entfernt.
Der Bereinigungscommit `544d2943` startete keinen weiteren Actions Lauf. Die insgesamt 100
synthetischen Zeilen bleiben wie freigegeben erhalten. Es gab kein Deployment und keine
Production Aenderung.

### Ergebnis Lauf D

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33149820784`, erfolgreich |
| Dauer | 7.321 ms |
| Einreihen / Reservieren / Abschliessen | 100 / 100 / 100 |
| Anfragen | 240 von hoechstens 240, alle HTTP 200 |
| RPC Verteilung | Kennzahlen 2, Ankunft 2, offene Auftraege 4, Einreihen 100, Reservieren 32, Abschliessen 100 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 167 / 234 / 974 / 1.313 / 1.665 / 391,7 ms |
| hoechste Gleichzeitigkeit | 32 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Laufendstand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 100 / 0 / 0 / 0 / 0 |
| Gesamtbestand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 200 / 0 / 0 / 0 / 0 |

Der Lauf erreichte eine Abflussquote von 1 und hinterliess keine aktive Lease. Supabase Secret
Key, GitHub Actions Secret und einmaliger Workflow wurden vollstaendig entfernt. Der
Bereinigungscommit `98c2a353` startete keinen zweiten D Lauf. Die insgesamt 200 synthetischen
Zeilen bleiben wie freigegeben erhalten. Production, Azure und echte Mandatsdaten blieben
unberuehrt.

### Erster Versuch mit 200 Auftraegen

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33153166940`, abgebrochen |
| Vorbereitung | 51 PASS, 0 FAIL |
| Fehlerstelle | `helmut_job_ankunft`, Zeitgrenze nach 10 Sekunden |
| Supabase API | `helmut_job_metrics` um 07:53:39 UTC mit HTTP 200; kein Eingang des folgenden Ankunftsaufrufs protokolliert |
| Schreibarbeit | 0 Einreihungen, 0 neue Zeilen |
| Datenbankgegenprobe | Funktion 3,627 ms; Bestand 200 erledigt, sonst 0 |
| Production / Anbieter / echte Mandatsdaten | unberuehrt / 0 / 0 |

Der Befund liegt im Transport zwischen GitHub und Supabase, nicht in der Datenbankfunktion.
Der Lauf stoppte vor der ersten Mutation korrekt geschlossen. Workflow, GitHub Secret und
Supabase Secret Key wurden vollstaendig entfernt. Der Bereinigungscommit `c5f92540` startete
keinen zweiten Lauf. Dieser Versuch ist rot und kein 200er Kapazitaetsnachweis. Eine neue
Ausfuehrung braucht eine neue laufbezogene Freigabe.

### Erfolgreiche Wiederholung mit 200 Auftraegen

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33154767024`, erfolgreich |
| Dauer | 6.584 ms |
| Einreihen / Reservieren / Abschliessen | 200 / 200 / 200 |
| Anfragen | 440 von hoechstens 440, alle HTTP 200 |
| RPC Verteilung | Kennzahlen 2, Ankunft 2, offene Auftraege 4, Einreihen 200, Reservieren 32, Abschliessen 200 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 135 / 172 / 717 / 1.409 / 1.434 / 262,8 ms |
| hoechste Gleichzeitigkeit | 32 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Gesamtbestand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 400 / 0 / 0 / 0 / 0 |

Jedes der 200 synthetischen Mandate war genau einmal vertreten. Der Lauf erreichte eine
Abflussquote von 1 und hinterliess keine aktive Lease. Workflow, GitHub Secret und Supabase
Secret Key wurden vollstaendig entfernt. Der Bereinigungscommit `b21ddac1` startete keinen
zweiten Wiederholungslauf. Production, Azure und echte Mandatsdaten blieben unberuehrt.

### Ergebnis mit 500 Auftraegen

| Kennzahl | Ergebnis |
|---|---:|
| GitHub Actions Lauf | `33158170030`, beim ersten Versuch erfolgreich |
| Dauer | 7.818 ms |
| Einreihen / Reservieren / Abschliessen | 500 / 500 / 500 |
| Anfragen | 1.040 von hoechstens 1.040, alle HTTP 200 |
| RPC Verteilung | Kennzahlen 2, Ankunft 2, offene Auftraege 4, Einreihen 500, Reservieren 32, Abschliessen 500 |
| Latenz min / p50 / p95 / p99 / max / Mittel | 107 / 127 / 382 / 440 / 1.266 / 162,2 ms |
| hoechste Gleichzeitigkeit | 32 |
| Zeitueberschreitungen / Netzfehler / Drosselungen / 5xx | 0 / 0 / 0 / 0 |
| unbekannt / doppelt reserviert / Lease Verlust | 0 / 0 / 0 |
| Gesamtbestand abgeschlossen / offen / wartend / laufend / fehlgeschlagen | 900 / 0 / 0 / 0 / 0 |

Jedes der 500 synthetischen Mandate war genau einmal vertreten. Der Lauf erreichte eine
Abflussquote von 1 und hinterliess keine aktive Lease. Workflow, GitHub Secret und Supabase
Secret Key wurden vollstaendig entfernt; der Schluesselwert wurde auch aus Browserzustand und
Zwischenablage entfernt. Der Bereinigungscommit `8ecff689` startete keinen weiteren Lauf.
Production, Azure und echte Mandatsdaten blieben unberuehrt.

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
Die Supabase Schluessel und GitHub Actions Secrets aller erfolgreichen Laeufe bis 500 wurden
geloescht. Ohne einen neuen, getrennt freigegebenen Schluessel kann und soll der Plan nichts
ausfuehren.

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
4. Lauf B — erledigt; Zugang und Workflow entfernt
5. Lauf C — erledigt und gruen; Zugang und Workflow vollstaendig entfernt
6. Lauf D — erledigt und gruen; Zugang und Workflow vollstaendig entfernt
7. Probe fuer 200 — nach rotem Transportaussetzer erfolgreich wiederholt; vollstaendig gruen
8. Probe fuer 500 — erledigt und gruen; Zugang und Workflow vollstaendig entfernt
9. Ausschliesslich synthetische Testzeilen entfernen — offen und nicht freigegeben

Jeder Schritt bleibt bis zu seiner ausdruecklichen Freigabe gesperrt. Kein Schritt beruehrt
Production, fuehrt einen Import aus oder aktiviert ein Mandat.
