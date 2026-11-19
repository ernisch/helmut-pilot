# HELMUT Quellenprüfstand

Unter **Actions → HELMUT manuelle Quellenprüfung → Run workflow** den zu prüfenden Branch und `produktionsnah` mit `mandat=ohne` auswählen. Das Szenario legt ein synthetisches Bundestagsmandat in einer frischen lokalen Datenbank an. Die bisherigen Einzeladapter bleiben auswählbar. Der Lauf veröffentlicht `bericht.md` und `bericht.json` mit Git-SHA, Szenario, Konfiguration, Lauf-ID und Versuch. Das Jobresultat beschreibt die Ausführung des Szenarios. Die fachliche und kapazitative Abnahme steht separat im Bericht.

Der Prüfstand startet `api/index.js` und ruft die vorhandenen Cron-Routen aus `vercel.json` auf. Der relationale Quellenkatalog, Mandatsresolver, Planungsjournal, Queue, Belege, Modellkostenwachen, Matching und Ausgabepfade laufen gegen das vorhandene Schema und die ausgewiesenen Migrationen. Die PostgreSQL-Uhr läuft gemeinsam mit der Testuhr. Das kontrollierte Loopback liefert synthetisches RSS, DIP, PDF, ICS und Modellantworten. Der Bericht führt gebuchte Reservierungen, einzelne Abruf- und Produktbefunde, Fristlücken und alte Fälligkeiten aus persistierten Daten auf.

Die am 19.11. gemessenen 754 offenen Fälligkeiten sind ein nachgelagerter Produktionssnapshot. Im Szenario bilden 754 erzeugte Google-Altaufträge den Startbestand. Die neuen 162 Fälligkeiten entsprechen am Archivwechsel der dokumentierten Mengenverteilung. Der Katalog enthält fiktive Entsprechungen für die Google- und direkten RSS-Wege. Die fünf amtlichen Terminadapter und DIP behalten ihre echten Abrufdefinitionen und lesen ausschließlich lokale Antworten. Die Modellantworten prüfen den technischen Vertrag. Die fachliche Qualität, reale Reuse-Quote und Kosten bleiben live zu belegen. [Betriebsausgang](quellenfaelligkeit-20261119.md) · [Infrastrukturabgleich](quellenpruefstand-infrastruktur-20261119.md)

## Gezielte Korrektur

Für einen bestätigten leeren RSS-Feed, dessen Startadresse die Feed-Adresse ist, entfällt der zweite Abruf als HTML. Dieselbe leere RSS-Antwort ergab auf `7b1f55b0` zwei Abrufe mit einer als Meldung interpretierten XML-Hülle. Die Korrektur ergibt einen Abruf und null Fundstücke. Fehler eines Feeds und eine abweichende HTML-Adresse behalten den bisherigen Pfad. Der gezielte Fälligkeitstest prüft die Korrektur. Der Gegenversuch und die Wiederholbarkeit sind im Laufbericht sichtbar.

Die Einsparung betrifft direkte, bestätigte Leerabrufe. Die erreichte Google-Reservierungsrate, die Ausgabefristen und der Rückstand haben eigene Abnahmekriterien. Der Bericht berechnet den Bedarf für 100 Mandate aus gemeinsam genutzten Abrufen und persönlichen Suchen. Ein tatsächlicher Lauf mit 100 Mandaten gehört nicht zu diesem Prüfstand.

## Google-Originaladressen und unveränderte Rohfassungen

Ein neuer öffentlicher Google-Feed im vorhandenen Fixture-Mix belegt 17 Reservierungen. Das sind ein Feed-Abruf, zwölf Artikel-GETs und vier Auflösungs-POSTs. Acht GETs leiten zum belegten Verlag weiter. Bei der Wiederholung wurde nur für acht der zwölf Feed-Einträge nach gespeicherten Adressen gesucht. Vier bestätigte Umleitungen mussten deshalb erneut durchlaufen werden. Die Suche folgt jetzt für alle Einträge demselben Speicherzeitbudget mit größenbegrenzten Abfragen. Quelle, Abrufweg, bekannter Verlag, Titel und Publikationszeit müssen weiterhin übereinstimmen. Bei fehlender eindeutiger Bestätigung bleibt der normale Abrufweg zuständig.

Die Messreihe verwendet den Feed `fixture-ressort-9` aus dem Prüfstand an zwei aufeinanderfolgenden Tagen, jeweils mit neuem Prozesscache. Crawler, HTTP-Weiterleitungen, Reservierungs-RPC und Ablage laufen über den bestehenden Produktionscode mit isoliertem PostgreSQL/PostgREST. Alle drei Stände liefern zwölf identische Fundstücke, acht direkte Adressen und dieselben zwölf unveränderlichen Rohfassungen. Am zweiten Tag wird in allen Ständen eine Quelle abgeschlossen. [Basislauf aus #1274](https://github.com/ernisch/helmut-pilot/actions/runs/44542084621)

| Messwert am zweiten Tag | Basis `b193b44` | Alle Adressen nachschlagen | Bestätigte Rohfassungen einmal lesen |
| --- | ---: | ---: | ---: |
| Google-Reservierungen und Google-HTTP-Anfragen | 13 | 9 | 9 |
| Abrufe am Verlag | 4 | 0 | 0 |
| Wiederverwendete Originaladressen | 4 | 8 | 8 |
| Lesezugriffe auf den Rohfassungsspeicher | 48 | 48 | 24 |

Die Inhaltsprüfsumme aller Fundstücke ohne Abrufuhrzeit ist `e1e0402c44dd82cbc110051bce6d951dca139c7576cac28af1ef31234b7c99f5`. Die Prüfsumme der sortierten Kennungen mit Versionshash ist `cda27a606f9e807c56b8804bbe224843d786d2c43bb983bb269b81a0288ad20d`. Die zweite Korrektur beendet die Sicherung nach der ersten vollständigen Lesebestätigung. Für eine neue Fassung bleibt der nachgelagerte Rücklesebeleg verbindlich. Der Fälligkeitstest prüft lange Google-Listen, fremde Fundstellen und den Rücklesepfad auch bei verlorener Schreibantwort.

Der Replay misst die Ersparnis bei bestätigten Wiederbeobachtungen. Der Erstabruf bleibt bei 17 Google-Reservierungen. Die 632 im Produktionsausgang dokumentierten Altbelege ohne Abrufweg-ID sind für diesen Nachweis unbrauchbar. Kapazität, Rückstand und Morgenversorgung werden über den normalen Zwei-Tage-Lauf bewertet. [Produktionsausgang](quellenfaelligkeit-20261119.md)
