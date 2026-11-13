# Lage und Radar: einmaliger Sachstand, ergänzende Hinweise

Auftrag: 13.11.2026. Wiederholte Sachinformationen innerhalb von Lage vermeiden
und den eigenen Nutzen von Radar mit einem direkten Verweis zur Lage zeigen.

## Verhalten

- Enthält eine Sammelkarte sämtliche Artikel einer spezifischeren Lagekarte,
  bleibt die spezifische Karte erhalten. Die übrigen Artikel der Sammelkarte
  erscheinen einzeln mit ihren Originaltiteln und vorhandenen Originalauszügen.
  Ohne nutzbaren Auszug bleibt ein ausdrücklich beschrifteter Quellenhinweis.
- Die Artikelteilung ist ausschließlich eine lesende Anzeigeprojektion. Keine
  neuen Vorgänge, Texte, Quellenabrufe oder gespeicherten Profil-/Fachänderungen.
  Eigene Anzeigeadressen halten die einzelnen Quellenhinweise anwählbar;
  Herkunftskennung und Originalquelle bleiben erhalten. Die alte Sammelprosa,
  Gesamtbewertung, Empfehlung und Büroaktion werden nicht auf Teilquellen übertragen.
- Ein gemeinsames Thema, eine einzelne gemeinsame Reportquelle oder identische
  Quellensätze allein vereinigen keine Vorgänge. Explizit gebundene redaktionelle
  Teilrollen und gebundene historische Eingaben behalten ihren eigenen Vertrag.
- Radar berücksichtigt bei Dynamiken auch einen durch Profil **und** Originalquelle
  belegten Fachbezug. Der vorhandene Zeit-/Veränderungs-/Fristbeleg bleibt Pflicht.
  Ein bloßer Themenbezug, Quellenzähler oder heutiges Verarbeitungsdatum genügt nicht.
- Ein Radar-Hinweis zum vorhandenen Lagevorgang erhält „Sachstand in der Lage
  öffnen“. Die Quelle bleibt separat verlinkt; kein verschachtelter Knopf im
  Quellenlink. Der Verweis bleibt nach Filterwechseln bedienbar. Ohne vorhandene
  Lagekarte wird kein leerer Verweis angezeigt.
- Prüfzeitraum und Quellenabdeckung werden durch diesen Fix nicht erfunden.
  Der ehrliche Radar-Leerzustand bleibt erhalten. Kein Versprechen täglicher Treffer.

## Prüfung

Gezielt über `scripts/lokal.js`: zehn neue Fallgruppen, vorhandene Lage-/Radar-
Regressionen und Schnellkern. Die neue Browserprüfung führt echte Klicks auf
Desktop und Mobil aus: Radar → richtiger Lagevorgang und getrennte Auswahl der
Quellenhinweise. Die bestehende Browserprüfung bleibt Teil des Pflichtchecks.
Bundestag und Landtag werden mit rein synthetischen Profilen geprüft; daraus
folgt keine reale Landtagsabnahme. Keine privaten Pilotinhalte als Testfixture.

Lokales Chromium kann über `HELMUT_BROWSER_EXECUTABLE_PATH` gewählt werden;
ohne diese optionale Einstellung verwendet die CI unverändert Playwright Chromium.

Lokal bestanden: 42/42 Lage-/Radar-Bereichssuiten, 14/14 Schnellkern und 182
Browserchecks ohne Fehler. Zehn neue Fallgruppen decken insbesondere erhaltene
Originalmeldungen, getrennte Reportereignisse, Artikelidentitäten sowie Fachbezug
mit echten und fehlenden zeitlichen Beobachtungsbelegen ab. Beim lokalen Replay
des ausdrücklich freigegebenen Pilotstands bleiben alle 24 unterschiedlichen
Originalartikel erhalten: neun bisherige Karten werden zu elf Anzeigeeinträgen,
davon drei Quellenhinweisen statt der wiederholenden Sammelkarte. Keine privaten
Texte oder Profilangaben werden als Fixture oder im Repository gespeichert.

Vor Merge müssen beide Pflichtchecks auf dem endgültigen PR-Kopf grün sein.
Die tatsächlichen Ausführungsnachweise stehen im PR/CI; dieses Dokument ist kein
behaupteter Deployment- oder Live-Inhaltsnachweis.

## Wirkung, Grenze und Rückweg

Das reguläre Deployment ändert nur die lesende Aufbereitung und Bedienung.
Eine Sammelkarte kann dadurch mehrere Quellenhinweise ergeben; die Kartenzahl
ist deshalb keine Zahl neuer politischer Entwicklungen. Eine neue persönliche
Erwähnung darf trotz derselben Originalquelle in Radar erscheinen, wenn sie einen
eigenen belegten Beobachtungszweck hat. Freie semantische Gleichheit verschiedener
Artikel wird nicht behauptet und nicht durch pauschales Löschen ähnlicher Themen gelöst.

Nach dem Deployment rein lesend Version und aktuelle Lage-/Radar-Ausgabe des
ausdrücklich freigegebenen aktiven Pilotmandats kontrollieren. Keine neue
Generierung, Profilaktivierung, Migration, Cron-, Budget- oder Env-Änderung.
Rückweg bei einem belegten Fehler: gezielter Revert dieses Code-Commits über
denselben Pflicht-CI-/Mergeweg; gespeicherte Quellen und Texte sind unverändert.

## Bestätigter Rollout

[PR1178](https://github.com/ernisch/helmut-pilot/pull/1178) gemergt auf
`f18298ad0b7375e129f4f82b5a2e66de377fd8d3`. Beide Pflichtchecks auf PR-Kopf
`1e86518f99221eda66dd9124eef92554d63a254c` erfolgreich:
[CI43392398587](https://github.com/ernisch/helmut-pilot/actions/runs/43392398587),
189/189 Standard- und 372/372 Bereichssuiten sowie Browser-/Mobile-Smoke.

Production READY für `dpl_5dHQL4qCDSsV9ANJeXfMaCfC5tGW`, Hauptdomain auf
genau diesem Merge. Öffentliches `client.js?v=f18298ad` bytegleich zum geprüften
Client. Lesender Pilotabruf 13.11.2026, 09:49:38 Europe/Berlin (08:49:38 UTC):
Version `f18298ad`, elf Lageeinträge, davon drei Quellenhinweise, vorhandener
Textcache genutzt. Alle 24 unterschiedlichen Originalartikel des vorigen Stands
erhalten; wiederholende Sammelprosa entfernt, spezifische Karte erhalten.

Radar zeigt einen Fachhinweis mit einem vorhandenen echten Lagevorgang als Ziel,
leeren allgemeinen Zusammenfassungsfeldern und wirklichem Beobachtungstag
08.11.2026. Kein künstlicher heutiger Quellenstand und keine zweite Artikelliste.
Die Browserbedienung wurde synthetisch geprüft; die reale Nachkontrolle liest
App-Antwort und ausgelieferten Client. Keine angemeldete Kundensitzung bedient,
kein realer Landtagsnachweis behauptet, keine neue Modellgenerierung oder
Production-Datenänderung durch die Kontrolle.

Status: erfolgreich abgeschlossen für den beauftragten Fix und den konkreten
Pilotnachweis. Nächster Schritt: App neu öffnen und die neue Nutzerführung ansehen.
Ein reiner Abschluss-Doku-PR benötigt nach seinem belegten Merge/Build-Skip
keinen weiteren Dokumentations-PR.
