# BMG: vorgezogene Originalpruefung und begrenzte Parserkorrektur

Stand 14.11.2026, 23:52 UTC. Teilweise abgeschlossen: lokal repariert und gezielt
geprueft, noch nicht auf `main` oder Production. Bezug: Issue #1202;
Basis `6763dc8e43a17860375f66cc83a528753499716e`.

## Ursache und kleinster Reparaturumfang

Auftrag `3b12db1a-bcf6-4bb4-bed4-f8a880f4155e`, Dokument
`rd-373e2d5f876ea3257735e0450db9fc34033f5d028ce23bdbfa45f22aa5a45b03`,
[BMG-Original](https://www.bundesgesundheitsministerium.de/ministerium/meldungen/deutscher-pflegetag-2026):
Der generische Parser verlangt einen ausreichend strukturierten Artikel. Die
amtliche Meldung verwendet TYPO3-Microdata und einen sichtbaren Datumstag, ohne
JSON-LD/articleBody. Der vorhandene Parser lehnt die lesbare Seite mit
`strukturierter-artikel-mehrdeutig-oder-fehlend` ab.

Die Korrektur ergaenzt ausschliesslich diesen geschlossenen BMG-Meldungspfad und
seinen Provenienzvertrag. Sie liest genau den ersten vollstaendigen Absatz aus
dem eindeutig gebundenen Artikelkopf. Titel, Canonical, og:url, Artikelstruktur,
Sichtbarkeit und der sichtbare Berliner Datumstag muessen zum Quellenstand passen.
Keine erfundene Publikationsuhrzeit und keine Aufwertung des Artikels vom 12.11.
zum Tagesanlass. Folgetexte/Zitate gelten nicht als mitgepruefter Volltext.

Beschaffung, Jobs, Cache-Revisionsrechte, Quoten und Abschlussregeln bleiben
unveraendert. Erfolgreiche Ergebnisse, historische Negative und UNKNOWN werden
nicht zurueckgesetzt. Der vorhandene alte BMG-Fehlauftrag wird damit nicht
automatisch wiedereroeffnet.

## Originalnachweis

Drei einzelne kostenfreie HTTP-GETs auf bereits konkret fehlgeschlagene Quellen;
kein Produktlauf. Das BMG-Original antwortete am 14.11.2026 um
23:35:29.032 UTC mit HTTP 200, 455907 Bytes und SHA256
`ff41c52750e9e7d6d491bc3ff8ccbdd4265dedc61527d2b7a3326e79a05960b1`.
Identische gespeicherte Antwort lokal: vorher obiger Fehler, nachher
`artikel-einstieg-v2`, 362 Zeichen, genau ein bestaetigter Absatz von insgesamt 27.
Dokumentmetadaten unveraendert; keine Modellaufrufe oder Production-Schreibvorgaenge.
Der neue Abruf reproduziert den aktuellen Fehler; er ersetzt keinen fehlenden
historischen Antwortbody. Rohantworten liegen nur im lokalen Diagnoseverzeichnis
`/tmp/helmut-versorgung-originalprobe-20261114/`, nicht in Git.

Die chronologisch davor gepruefte Bundestagsanhoerung scheitert ebenfalls sicher:
kein Canonical, sichtbarer Termin 25.11. ist kein Publikationsdatum. Die ZDF-Seite
hat weder articleBody noch einen gebundenen Artikelbereich. Beide Parser bleiben
unveraendert; keine Lockerung der Quellen- oder Datumssperren.

## Gezielte Pruefungen

Alle Verhaltenspruefungen ueber `scripts/lokal.js`, ohne Netz, Production oder Modelle:

- Quellenlayout: vier neue BMG-Gruppen gruen (`--bmg`), vier unveraenderte
  BReg/DLF-/Provenienzgruppen im ersten Lauf gruen, fuenf Cachegruppen gruen
  (`--cache`). Insgesamt alle 13 betroffenen Gruppen in Teilmengen belegt.
- Ein alter Cachetest scheiterte auch auf unveraendertem `main`: Er erwartete
  einen inzwischen gesperrten Zweitabruf. Nur die veralteten Fixtures wurden an
  den geltenden Schutz angepasst. Alte Negative bleiben explizit unveraendert;
  Tests fuer neue Reservierungen verwenden wirklich fehlende Basisstaende.
- Bestehender `artikelkontext-test.js`: 10 Gruppen gruen;
  `artikelkontext-gewinnung-test.js`: 11 Gruppen gruen.
- Syntax der drei geaenderten JS-Dateien und `git diff --check` gruen.

Die unveraenderte CI-Auswahl wuerde fuer einen PR 87 Quellensuiten plus Schnellkern
starten, darunter nicht betroffene Funktionen. Wegen der ausdruecklichen Vorgabe
gegen Massentests wurde kein PR und keine solche CI gestartet. Die Pflichtchecks
werden nicht umgangen oder abgeschwaecht; Merge und Rollout bleiben offen.

## Erhaltener Bestand und verbleibende Luecke

Rein lesende Nachkontrolle am 14.11.2026, 23:51 UTC: Alle fuenf zuvor erfolgreichen
Auftraege weiter `erledigt`, ihre fuenf Payload-Hashes gegen den Vorbefund gleich.
Der BMG-Auftrag bleibt `fehlgeschlagen`. Die Quellenquittung
`admin-quellen-2026-11-14-7a29cba2-be8f-4bc9-a119-5173462ca3ae` bleibt teilweise:
5 verarbeitet, 58 fehlgeschlagen, 78 zurueckgestellt. Lage- und Morgenquittung
weiter teilweise. Gespeichertes Briefing unveraendert, InhaltHash
`17fbead5dd1e177a8628a923c1c8822cf9c4fda98c5a5716bba6943cd0cdff04`.
Keine vollstaendige Tagesversorgung oder neue Tagesprioritaet bewiesen.

Naechster Schritt: ausdrueckliche Ausnahme fuer die bestehende kostenfreie
Offline-PR-CI einholen, damit die konkrete Reparatur regulaer integriert werden kann.
Regulaere Quellen-/Lage-/Morgen-Crons und der bestehende Nachtauftrag bleiben zeitlich
unveraendert; kein Zusatzfenster, Wiederanlauf alter Jobs oder bezahlter Modelltest.
