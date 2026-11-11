# Kontrollierter Adminstart: Rollout 11.11.2026

Das Betreiber-Go in diesem Thread wurde auf PR1126 und dessen regulären Rollout
bezogen. Ein manueller Production-Quellenlauf ist davon ausgenommen und wurde
nicht gestartet. Keine Quellenabrufe, Modellaufrufe, Migrationen, Budget-,
Reserve-, Quellen- oder Profiländerungen durch diesen Rolloutauftrag.

## Geprüfter Stand und Integration

PR1126, Kopf `9c1ed3866479092f2eeb1e095339b5210811ee5b`,
[Pflicht-CI42996054820](https://github.com/ernisch/helmut-pilot/actions/runs/42996054820):
beide Pflichtchecks SUCCESS, Standard-/Bereichsregression und erforderliche
isolierte Datenbanknachweise einschließlich Z22 ausgeführt. Großer Mock100
übersprungen. Gezielter Adminstartnachweis einschließlich Originalverwaltung
im Chromium17/17; Rollen, CSRF, Idempotenz, Lease, Kontingente, Status und
Reload geprüft. Unabhängige Code-, Korrektur- und Integrationsprüfungen ohne
verbleibenden Befund. Details und Prüfgrenzen im PR.

Während der Arbeit bereits auf main vorhandene Büro-Änderungen bleiben erhalten.
Der letzte main-Abgleich vor Merge ergab `ec6fe87c`; dessen zusätzliche Änderungen
betreffen nur Büro-Clientwartezeit, Tests und Dokumentation. Lokaler
Merge-Tree war konfliktfrei. Merge mit gebundenem erwarteten PR-Kopf, ohne
Adminumgehung, Ergebnis `3cf5379ec5264340570ee3c055e7af0d79b66a61`.

## Rein lesende Productionkontrolle

Vorprüfung11:42:46UTC:0 laufende Prozesse (running, ohne Ende, letzte20min),
0 aktive Pipeline-Sperren,0 aktive Klassenleases. Vorherige Runtime
`ca9a3fc6`, Production=true. Kostenbuch-MD5
`245877b3239ec1f1f6ae9734abb4af08`, Vertrag-MD5
`7b72ac08cbc3c289d52b4583f09659fd`,64 Buchungen.

Vercel-Gitdeployment `dpl_6KNAhys7UF7qNcHYEfEHAUVYi5Ur`, Production/fra1,
READY, Hauptdomain `https://helmut-pilot.vercel.app`, aliasError=null.
Runtime nach Rollout bestätigt exakt `3cf5379e`, production=true, ok=true.
Startseite HTTP200, Assetversion3cf5379e. Client bytegleich zum Mergebaum,
SHA256 `37873ea49464ebf8e90a9b145f3ce068962b394249e9d4a8bc56c25688131b0a`.
Verwaltung und neue Adminroute ohne Sitzung jeweils HTTP401.
Kein authentifizierter Production-Klicktest; Browsernachweis ist isoliert.

Releasecheck HTTP200,ok=true,storage=true,ready=false. Die bereits vorher
dokumentierte allgemeine Frischelücke ist damit nicht geschlossen. Kein neuer
Quellenversorgungs-, Ergebnisqualitäts- oder allgemeiner Betriebsbereitschaftsnachweis.

Nachprüfung11:45:46UTC:0 laufende Prozesse,0 aktive Pipeline-Sperren und
Klassenleases. Kostenbuch und Vertrag hashgleich, weiterhin64 Buchungen.
Keine Erstattung oder Änderung historischer Zähler. Deploymentbezogene
error/fatal-Abfrage11:43:39–11:45:15UTC ohne Treffer; nur dieses Zeitfenster belegt.

## Grenze und Rückweg

Der Knopf nutzt denselben Queuepfad außerhalb der morgendlichen Uhrzeit.
Ausgeschöpfte Kontingente bleiben gesperrt. Kein automatischer Neustart oder
Sonderbudget. Ein bestätigter Arbeitslauf beweist keine vollständige Versorgung.

Bei bestätigter Regression bisheriges READY-Deployment
`dpl_D1FUJYGfyqbQLGuegcihdjaq9Usr` wieder zuweisen oder einen gezielten
Revert nur der Adminstartänderungen vorbereiten. Bereits vorhandene Bürofixes,
Kostenbuch, Reservierungen und Daten erhalten; kein Schema-/Zählerreset.
Dieser Rückweg wurde nicht ausgeführt. Ein tatsächlicher manueller Quellenlauf
benötigt weiterhin eine gesonderte konkrete Freigabe und die bestehenden Gates.
