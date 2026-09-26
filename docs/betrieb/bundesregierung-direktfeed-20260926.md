# Amtlicher Regierungsfeed und Radar-Original

Roadmap3.3,26.09.2026. Die letzte vollständige lokale Auswertung echter
Production-Leseprojektionen enthält127 Tagesprioritäten und373 ohne.
499 Radaransichten sind leer; nur Cem Ince hat einen älteren persönlichen und
einen Parteihinweis, aber keine Tagespriorität. Keine neue500er Messung.

## Direkter Feed: neu belegter Zugang

Die [amtliche RSS-Seite](https://www.bundesregierung.de/breg-de/service/newsletter-und-abos/rss-newsfeed)
verlinkt den [Gesamtfeed1151242](https://www.bundesregierung.de/service/rss/breg-de/1151242/feed.xml).
Beide am26.09. direkt mit HTTP200 gelesen. Der bestehende Helmut-Parser liest
16 Meldungen;7 liefern einen vollständigen Satzpräfix innerhalb48h. Vier liegen
im aktuellen Fenster seit25.09.14:00UTC: Olympia-Bewerberregion, Henkel-Jubiläum,
Energiesteuersenkung und Bundeserprobungsgesetz. Originalzeiten bleiben erhalten.
Keine der vier Artikeladressen liegt laut Production-Lesung bereits in
`raw_documents`. Das ist ein Kandidatenbeleg, kein Import oder Funktionsnachweis.

Private Belege: `/private/tmp/helmut-breg-frische4-beleg.json` mit vollständigen
Kandidaten und Hashes der amtlichen Indexseite und des Feeds;
`helmut-breg-feedbewertung-20260926.json` enthält alle Parserablehnungen.

Der bisherige Laufzeitkatalog verwendet eine Google-Nachrichtensuche. Der
relationale Production-Datensatz`rp-bundesregierung` steht dagegen noch auf
`broken`, Methode`googlenews_search`, alter URL`/breg-de/service/rss`.
Vollzeilenhash des gelesenen Standes:
`622cf8e6280781e52b007aa13511a60acf6e7a753fffbf053a173f17fae1ea0f`.
Der Modus`on` lässt defekte Wege bewusst nicht laufen. Beide Konfigurationen
müssen deshalb getrennt korrigiert und nachgelesen werden.

Lokale Korrektur: direkte Feedadresse in Laufzeitkatalog und Seedbelegen,
passende Methode und aktualisierter externer Lesebeleg. Bestehende Abrufmenge16,
Quellidentität und übrige Quellen bleiben unverändert. Gezielte Katalogprüfungen:
77 und99 Fälle bestanden. Seedkorrektur allein ändert keinen Production-Datensatz.

## Begrenzter Production-Schritt nach Deployment

Nur `rp-bundesregierung`: URL auf den amtlichen Gesamtfeed, Methode`rss`,
Status`needs_review` und Änderungszeit. Kein erfundener Production-Crawlerfolg
in`last_success_at`. Der bestehende globale Kernweg wird wieder abrufbar;
Profile bleiben500/0, keine Cron-/Environment-/Budgetänderung. Vorher exakten
Altstand, ruhenden Bestand und tatsächlichen Laufzeit-Kostenschutz lesen.
Der erste reguläre Crawl ist ein eigener Nachweis und darf nicht als bereits
geschehen dargestellt werden.

Risiko: der normale Quellenlauf kann neue Dokumente und spätere Modellarbeit
auslösen. Deshalb erst nach Abschluss des parallelen Lage-Nachweises und nur
bei nachgewiesen aktivem atomarem6USD-Tages- und kumulativem6USD-Auftragsriegel
anwenden. Keine kostenpflichtige Ressource oder unbeschränkte Testserie.
Nachkontrolle: exakt geänderte Felder, alle anderen Zeilenfelder gleich,
Profilschutzhashes/Jobs/Locks/Kosten lesen; tatsächlichen Crawl separat bilanzieren.
Rückweg: bei Transaktionsfehler Rollback; anschließend erforderlichenfalls diesen
einzelnen Weg wieder auf`broken` setzen, bereits entstandene Dokumente und
Kostenbelege nicht automatisch löschen. Dieser Schritt ist noch nicht ausgeführt.

## Persönliche Radarbindung extern nachgelesen

Die [verlinkte Bundestags-Mediathekseite](https://www.bundestag.de/mediathek/video?videoid=7657592)
war direkt mit HTTP200 lesbar. Titel, sichtbare Hauptüberschrift und Navigation
nennen Cem Ince,25.09.2026,97. Sitzung,TOP37/ZP8. Die konkrete gespeicherte
Artikelbindung ist damit extern bestätigt; der frühere Web-Leserfehler war kein
fehlender Inhalt. HTML-SHA256:
`d7828c1d7a72157d0ad3e5482e6159fd64d58d5dedf21e5ba45c9ca183a89f83`,
privat`/private/tmp/helmut-cem-original-20260926.html`.
Keine gesprochene Rede transkribiert und keine Aussage über deren Inhalt.
Das schließt nur diese konkrete persönliche Artikelbindung, keine frische
Drei-Bereiche-Abnahme oder vollständige500er Radarprüfung.
