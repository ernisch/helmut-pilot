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

| Gruppe am 19.11. | Geplant | Technisch erledigt |
| --- | ---: | ---: |
| Übrige Google-Tagesquellen | 144 | 28 |
| Google-Archivsuche | 1 | 0 |
| Amtliche PDF-/ICS-Morgenpflichten | 5 | 1 |
| DIP | 1 | 1 |
| Übrige Anbieter | 11 | 11 |

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
In 31 von
35 belasteten Minuten wurde die Grenze von 30 erreicht. Acht Fünfminutenfenster
berühren höchstens 48 feste Minuten der Anbieterquote. Selbst bei 1.440
Reservierungen würden beim beobachteten Mix höchstens 84 Google-Aufträge
abgeschlossen. Gegenüber den 2.475 benötigten Reservierungen fehlen selbst
dann 1.035. Die am 19.11. gemessenen 500 Buchungen sind der Ist-Verbrauch.
Für 754 Altaufträge in fünf Tagen wären bei 162 neuen Aufträgen je Tag
mindestens 313 Abschlüsse pro Tag nötig, davon 151 für den Rückstand.

Seit 13.11. sind 632 bestätigte direkte Google-Fundstellen für aktive
öffentliche Katalogsuchwege gespeichert. Sie enthalten 610 verschiedene
Proxy-Adressen. Alle 632 Bestandszeilen haben eine leere Abrufweg-ID und
qualifizieren sich deshalb nicht für die Wiederverwendung. Der neue Leser
verlangt die passende Abrufweg-ID, Fund-URL, Titel, Publikationszeit und
den Herausgeberhost. Der Feed bleibt eine aktuelle Beobachtung. Ein
Offline-Fall mit bestätigter Bindung spart einen von zwei Abrufen.
Personensuchen prüfen den aktuellen Profilbezug vor der Linkauflösung.
Ein POST mit bestätigter Antwort ohne
Artikellink wird mit derselben Eingabe nicht wiederholt. Eine belastbare
Wiederverwendungsrate folgt erst aus regulären Abrufbelegen.

## Abgleich von Katalog und Ausgabe

Der Katalog enthält 262 Abrufwege. Neun Pakete stehen in der Datenbank auf
`active`. Der vorhandene Profilresolver und die Paketreferenzen ergeben sechs
aktive Pakete für das aktuelle Mandat und 154 aktive Abrufdefinitionen nach
Status- und Modusfilter. 146 exakte URLs finden sich im Tagesmanifest. Die
acht übrigen Katalog-IDs sind im Manifest mit jeweils abweichenden
Google-Abfragen vertreten. Die Legacy-Zuordnung übergibt deren Such-URLs.
Die Abweichungen betreffen Bau/Wohnen, Bildung, Digitales, Familie,
Klima/Umwelt, Landwirtschaft, Recht und Sport. Der neue Mapper übernimmt
für solche bereits aktivierten öffentlichen Einzelabfragen die exakte
Katalog-URL innerhalb desselben Google-RSS-Abrufwegs. Alle acht Abweichungen
sind mit den gelesenen Katalog- und Manifestdaten offline reproduziert und
im Mapper behoben. Der erste reguläre Manifestbeleg steht aus. Der amtliche
BA-Originalweg fehlt weiterhin.

Das am 19.11. gespeicherte Lageobjekt hat den Zeitstempel **05:00:51.628 UTC**,
das Mandatsbriefing **05:15:44.627 UTC**. Damit liegen diese Artefakte 51,628
beziehungsweise 44,627 Sekunden hinter den Fristen. Die regulären
Vercel-Termine begannen um 05:00 und 05:15 UTC. Die Ausgabeprüfung verwendet
die gespeicherten Zeitstempel und die getrennte Morgenquittung. Der
Artefaktzeitpunkt allein belegt keine einzelne Quelle in der Ausgabe.

## Bedarfsrechnung für 100 und 500 Mandate

Der 19.11. enthält 159 geteilte Abrufaufträge, davon 143 Google, einen
DIP-Auftrag sowie je eine persönliche Tages- und Archivsuche. Der neue Plan
bündelt DIP einmal je Tagesfenster. Issue #1266 setzt die aktuelle Betriebsgröße
auf 100 Mandate. Die angeforderte Rechnung für 500 nutzt denselben Bedarf pro
berechtigtem Bundestagsmandat und dieselben gemeinsam genutzten Abrufwege.

| Mandate | Aufträge im Tagesmittel | Aufträge am Archivwechsel | Google-Feeds im Tagesmittel | Google-Feeds am Archivwechsel |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 274,29 | 360 | 257,29 | 343 |
| 500 | 731,43 | 1.160 | 714,43 | 1.143 |

Bei 30 Reservierungen je Minute entsprechen die Google-Feeds für 100
Mandate mindestens 8 min 35 s im Mittel und 11 min 26 s am Archivwechsel.
Bei 500 Mandaten sind es 23 min 49 s und 38 min 06 s. Artikelauflösung,
Wiederholungen und weitere Paket-, Rollen-, Wahlkreis- und Landesdefinitionen
erhöhen den Bedarf. Für das 100er-Szenario mit beispielhaften 25 Prozent
Reserve braucht es im Mittel mindestens 343 Abrufabschlüsse und zum
Archivwechsel 450. Die fünf amtlichen Originalwege und DIP werden je
Tagesfenster einmal als Auftrag eingeplant. Die Zahl ausgabefähiger Lagen
wächst mit der Mandatszahl.

Aus den paarweise beobachteten Modellkosten des 18. und 19.11. ergeben sich
bei täglich neu zu erzeugenden und zu prüfenden Lagen **1,905–1,913 USD** für
100 und **7,264–7,506 USD** für 500 Mandate. Das Szenario enthält keine
zusätzlichen Radar- oder Bürokosten. Nach den beobachteten globalen Kosten
lassen sich im Rahmen von 1 USD täglich rechnerisch bis zu 32–34 Lagen neu
erstellen und prüfen. Für 100 Mandate müssten also mindestens 66–68 Lagen
ohne dieses neue Aufrufpaar auskommen. Kostenreservierungen senken den
verfügbaren Anteil weiter. Der Rahmen von **1 USD pro UTC-Tag, 30 USD gesamt**
gilt. Reale Einsparungen und Kapazität nach der Bündelung müssen im Regelbetrieb
belegt werden.

## Freigabe und Rückweg

Der netzlose PostgreSQL-17.6-Nachweis prüft Rollenzugriffe, den amtlichen
Vorrang, alte und neue Fälligkeiten, die Wiederaufnahme abgelaufener Leases,
den atomaren Abschluss und das Zurückrollen. Gezielt geprüft sind außerdem
der reguläre Tageswechsel, Rechte, PDF- und ICS-Teilfortschritt, einmalige
Ergebnisbelege, der Katalogabgleich und die Mandatsausgabe.

Die Ausgabeprüfung liest vorhandene, mandatsgefilterte Pakete für den
Pflichttag. Bei übrigen Tagesquellen kann auch ein späteres Paket die
Verarbeitung belegen. Eine verfehlte Frist bleibt sichtbar. Ein amtlicher
Beleg in der Lage und derselbe Beleg in der gebundenen Morgenausgabe sind
getrennte Bedingungen. Der bestätigte Sitzungskalender ist über die
gespeicherte Morgenquittung an das Paket gebunden.

[PR #1271](https://github.com/ernisch/helmut-pilot/pull/1271) hat die
Pflicht-CI ohne historische Mengenläufe auf `main` gebracht. Die neue
Queue-Migration ist als gezielte Prüfung in der regulären
netzlosen PostgreSQL-Prüfung eingebunden.

Die vorbereitete Migration ergänzt genau die Funktion
`public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)` mit Ausführungsrecht
für `service_role`. Sie ersetzt keine bestehenden RPCs und
ändert keine Queue-Zeilen bei der Installation. Der lesende Nachweis nach
einer freigegebenen Anwendung prüft Funktionskörper, Rechte und Migrationsversion.
Das Rückweg-SQL entfernt den Einsprung. Bereits bestätigte Manifeste,
Teilstände und Ergebnisse bleiben bei einem Rückweg erhalten. Der Betreiber
hat die einmalige Anwendung nach grüner Pflicht-CI und Review freigegeben.

Die freigegebene Terminänderung verschiebt die Lage auf 04:55 und die
Morgenausgabe auf 05:10 UTC. Das letzte Quellenfenster läuft auch bei
zulässiger Zustellverzögerung vor 04:55 UTC aus. Beide Termine geben den
Ausgabepfaden je fünf Minuten bis zur Frist. Die Betriebsprüfung muss den
Puffer unter regulärer Last bestätigen. Der Rückweg setzt die Termine auf
05:00 und 05:15 UTC zurück.

Die Abnahme erfordert zusammenhängende lesende Belege aus mehreren regulären
Tageswechseln und einem Archivwechsel. Der vorbereitete Stand liefert keine
Produktionsrate nach dem Umbau.
