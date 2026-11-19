# Quellenfälligkeiten am 19.11.2026

**Abnahme offen.** Die bestehende Architekturentscheidung gilt. Die Codeänderung
liegt auf `codex/quellenfaelligkeiten-1266`, ausgehend von `main` auf `13d21b85`.
Der öffentliche Produktionsalias hat lesend `24a626ff` als `READY` bestätigt.
Die Messungen stammen aus dem regulären Betrieb, vor der Änderung in diesem
Branch. [Entscheidung](https://github.com/ernisch/helmut-pilot/issues/1266#issuecomment-7004523155)
· [Produktionsbericht](https://github.com/ernisch/helmut-pilot/issues/1266#issuecomment-7004176533)
· [Deployment](https://vercel.com/nohut/helmut-pilot/FztRk3Hi2pHUaEEy6ngYLweNXBCP)

## Ein aktives Mandat

| UTC-Tag | Geplante Abrufaufträge | Technisch erledigt | Wartend |
| --- | ---: | ---: | ---: |
| 16.11. | 155 | 29 | 126 |
| 17.11. | 156 | 41 | 115 |
| 18.11. | 156 | 42 | 114 |
| 19.11. | 162 | 41 | 121 |
| Summe | 629 | 153 | 476 |

Die lesende Datenbankabfrage am 19.11. um 09:08 UTC bestätigt 754 fällige
wartende Abrufe. 278 davon stammen aus früheren Fenstern. Am 19.11. lagen
145 Google-Aufträge im Plan, 28 wurden technisch abgeschlossen. Damit fehlen
an diesem Tag 117 Google-Abschlüsse und 121 Abschlüsse insgesamt. Die
Warteschlange, Quotenbuchungen und Originalbelege wurden zur Auswertung gelesen.

8 Fenster, 2.400 reservierte Sekunden und 16 Originalreservierungen sind am
19.11. ausgeschöpft. Drei der fünf amtlichen Wege wurden an der Originalquote
vertagt. Das entspricht in diesem Ablauf mindestens drei weiteren verweigerten
Originalzulassungen. Ein PDF-Lesefehler bleibt ein eigener Befund. Die neue
Teilablage spart im gezielten PDF- und ICS-Fall je eine von zwei erneut
benötigten Reservierungen. Die Einsparung im Regelbetrieb ist offen.

Am 18. und 19.11. gingen 990 Google-Reservierungen mit 58 technischen
Google-Abschlüssen einher. Der beobachtete Mix ergibt 17,07 Reservierungen
je Abschluss. Bei demselben Mix würden 145 Abschlüsse 2.475 Reservierungen
brauchen, 1.975 mehr als die am 19.11. gebuchten 500. Mit diesen 500 Buchungen
müsste der Mix auf höchstens 3,45 Reservierungen je Abschluss sinken.
Öffentliche Weiterleitungen lassen sich im Slot wiederverwenden. Die Quote
von 30 pro Minute und die nutzbare Workerzeit begrenzen den tatsächlichen
Durchsatz. 500 ist ein beobachteter Verbrauch, kein konfigurierter Tagesdeckel.

## Abgleich von Katalog und Ausgabe

Der Katalog enthält 262 Abrufwege. Neun Pakete stehen in der Datenbank auf
`active`. Der vorhandene Profilresolver und die Paketreferenzen ergeben sechs
aktive Pakete für das aktuelle Mandat und 154 aktive Abrufdefinitionen nach
Status- und Modusfilter. 146 exakte URLs finden sich im Tagesmanifest. Die
acht übrigen Katalog-IDs sind im Manifest mit jeweils abweichenden
Google-Abfragen vertreten. Die Legacy-Zuordnung übergibt deren Such-URLs.
Die Abweichungen betreffen Bau/Wohnen, Bildung, Digitales, Familie,
Klima/Umwelt, Landwirtschaft, Recht und Sport. Der Abgleich meldet die
abweichende Definition. Die gültige fachliche Fassung muss je Weg belegt
werden, bevor eine Katalog- oder Abrufänderung die Abweichung schließen kann.
Der amtliche BA-Originalweg fehlt weiterhin.

Das am 19.11. gespeicherte Lageobjekt hat den Zeitstempel **05:00:51.628 UTC**,
das Mandatsbriefing **05:15:44.627 UTC**. Damit liegen diese Artefakte 51,628
beziehungsweise 44,627 Sekunden hinter den Fristen. Die regulären
Vercel-Termine beginnen um 05:00 und 05:15 UTC. Die Ausgabeprüfung verwendet
die gespeicherten Zeitstempel und die getrennte Morgenquittung. Der
Artefaktzeitpunkt allein belegt keine einzelne Quelle in der Ausgabe.

## Bedarfsrechnung für 500 Mandate

Der 19.11. enthält 159 geteilte Abrufaufträge, davon 143 Google, einen
DIP-Auftrag sowie je eine persönliche Tages- und Archivsuche. Bei 500
berechtigten Bundestagsmandaten mit derselben Menge geteilter Definitionen
bündelt der neue Plan DIP einmal je Tagesfenster. Das Szenario erfordert
durchschnittlich **731,43 Abrufaufträge je Tag** und **1.160** am
Archivwechsel. Davon sind mindestens **714,43** beziehungsweise **1.143**
Google-Feedreservierungen nötig, bereits vor Artikelauflösung und Retries.
Bei 30 Reservierungen je Minute entspricht das mindestens 23 min 49 s
beziehungsweise 38 min 06 s Anbieterzeit. Weitere Paket-, Rollen-, Wahlkreis-
und Landesdefinitionen erhöhen den Bedarf. Die gemessenen Schwankungen
geben noch keine belastbare Rate nach Bündelung vor.

Aus den paarweise beobachteten Modellkosten des 18. und 19.11. ergeben sich
bei 500 neu zu erzeugenden und zu prüfenden Lagen **7,264–7,506 USD pro Tag**.
Das Szenario verwendet dieselben globalen Kosten wie je Beobachtungstag und
enthält keine zusätzlichen Radar- oder Bürokosten. Caches können die Kosten
senken. Der geltende Rahmen bleibt **1 USD pro UTC-Tag, 30 USD gesamt**.

## Freigabe und Rückweg

Der netzlose PostgreSQL-17.6-Nachweis prüft Rollenzugriffe, den amtlichen
Vorrang, alte und neue Fälligkeiten, die Wiederaufnahme abgelaufener Leases,
den atomaren Abschluss und das Zurückrollen. Gezielt geprüft sind außerdem
der reguläre Tageswechsel, Rechte, PDF- und ICS-Teilfortschritt, einmalige
Ergebnisbelege, der Katalogabgleich und die Mandatsausgabe.

Die Ausgabeprüfung liest vorhandene, mandatsgefilterte Pakete für den
Fälligkeitstag. Ein amtlicher Beleg in der Lage und derselbe Beleg in der
gebundenen Morgenausgabe sind getrennte Bedingungen. Die ursprüngliche
Bestätigung bleibt auch beim Tageswechsel maßgeblich.

Die vorhandene Pflicht-CI wählt bei der SQL- und Kernänderung den vollen
Datenbankpfad einschließlich der 500er-Suiten. Die gezielte Verifizierung
läuft lokal. Eine PR-Eröffnung würde die Vollprüfung automatisch auslösen.

Die vorbereitete Migration ergänzt genau die Funktion
`public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)` mit Ausführungsrecht
für `service_role`. Sie ersetzt keine bestehenden RPCs und
ändert keine Queue-Zeilen bei der Installation. Der lesende Nachweis nach
einer freigegebenen Anwendung prüft Funktionskörper, Rechte und Migrationsversion.
Das Rückweg-SQL entfernt den Einsprung. Bereits bestätigte Manifeste,
Teilstände und Ergebnisse bleiben bei einem Rückweg erhalten. Änderungen an
Produktionskatalog und Cron benötigen ihre jeweils konkrete Freigabe.

Für eine getrennte Terminfreigabe kommen 04:55 UTC für die Lage und 05:10 UTC
für die Morgenausgabe in Betracht. Das letzte Quellenfenster hat bei später
regulärer Zustellung bis 04:54 UTC Zeit. Die beiden neuen Zeiten geben den
Ausgabepfaden je fünf Minuten bis zur Frist. Vor einer Anwendung sind die
gemessenen Laufzeitgrenzen und die Überschneidung mit dem Quellenfenster
gegen den zu integrierenden Stand abzugleichen. Der Rückweg wären die
vorhandenen Termine 05:00 und 05:15 UTC.

Die Abnahme erfordert zusammenhängende lesende Belege aus mehreren regulären
Tageswechseln und einem Archivwechsel. Der vorbereitete Stand liefert keine
Produktionsrate nach dem Umbau.
