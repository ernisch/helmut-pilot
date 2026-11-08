# Sichere Validierungsdiagnose erhalten · 08.11.2026

[PR #1105](https://github.com/ernisch/helmut-pilot/pull/1105) nach ausdrücklicher
Freigabe des geprüften Kopfes `77ae3e6b12d81d15a0a224ba18514dfcb418e3a1`
am 08.11.2026, 08:42:24 UTC, auf `ec223b77c56a7f0683304ad72c1e69910fb14bca`
gemergt und regulär auf Production ausgerollt. Der ursprüngliche Auftrag bis
zum ungemergten PR bleibt historisch; die spätere konkrete Mergefreigabe
ersetzt ausschließlich diese Grenze für PR1105.

## Befund und Ursache

Übergebener historischer Befund, in diesem Auftrag nicht neu produktiv erhoben:
`vg-pflegeversicherung-20261105-0c59e8` steht auf `pending`/`failed`, die
Reservierung auf `zustand=unbekannt`, `letzter_grund=validierung-fehlgeschlagen`.
Für `crawl-20261106001605-ksxrl` ist am 06.11.2026 um 00:17:25 UTC ein
erfolgreicher Modellaufruf im Authspeicher belegt; anschließend lehnte die
Validierung ab. Der konkrete historische Feldfehler bleibt unbekannt.

Auf Main `915d15b6` bestätigt: `sichereFehlerFuerBericht` liefert bereits
wertfreie Codes. `buildOutcomeTelemetry` übernahm sie nicht in die
Auffälligkeiten, `sanitizeProcessRun` verwarf deren einzelne Einträge.
Auch die relationale Hin-/Rückprojektion führte nur deren Gesamtzahl.

## Kleinster Fix und Schutzgrenzen

- Bestehender Weg: Motorergebnis → `buildOutcomeTelemetry` →
  `recordProcessRun`/`sanitizeProcessRun` → Authspeicher und optional
  `process_runs.telemetrie` → bestehender Dual-Read.
- Gemeinsamer reiner Filter in `understanding-diagnose.js`: feste Codeklassen,
  Feldpfade ausschließlich aus dem vorhandenen festen Schema, feste
  Quellenbelegcodes und Erwähnungsfelder. Keine freie Präfixfreigabe.
- Höchstens 25 Auffälligkeiten, je höchstens fünf bereits vorhandene Codes;
  geprüft werden nur die ersten fünf Eingabecodes. Duplikate fallen weg.
  Unbekannte Codes/Pfade werden verworfen. Gesamtzahl und bestehende Zähler
  bleiben unverändert, auch bei gekappter Stichprobe.
- Vorgangszuordnung ausschließlich über 64-stelligen SHA-256-Hash der
  zulässigen, höchstens 123 Zeichen langen Kennung; bestehende Redaction prüft
  vor dem Hashen. Kein Kennungsslug im gespeicherten Detail. Für die Zuordnung
  den SHA-256 derselben bekannten Vorgangskennung vergleichen. Dies ist eine
  pseudonyme Zuordnung, keine Anonymisierung.
- Feste Status-/Grundlisten; keine Prompts, Antworten, Quellentexte, Namen,
  Zugangsdaten, URLs oder freien Fehlermeldungen in den neuen Details.
  Beide relationalen Projektionsgrenzen filtern ebenfalls.
- Bestehendes JSONB-Feld, keine Migration, neue Infrastruktur oder Testsysteme.
  Keine Wiederverarbeitung, Modellanfrage, Produktionsmutation, Budget-,
  Schalter-, Zeitplan-, Radarfilter- oder Validierungsregeländerung.

PR #1104 (`codex/quelleninhalt-20261107`, bei Start Kopf `947add8d`)
behandelt Quelleninhalt separat. Dessen Branch und Runtime-/Testdateien
bleiben unverändert. Die gemeinsame Statusdatei erhält nur diesen Link.
Der ursprüngliche lokale Checkout samt unversioniertem Bestand bleibt erhalten.

## Gezielte Nachweise

Alle Tests über `node scripts/lokal.js -- node scripts/<suite>-test.js`:

| Vorhandene Suite | Ergebnis |
| --- | --- |
| `understanding-schema-diagnose` | 90 erfolgreich |
| `prozesslauf-telemetrie` | 60 PASS, 0 FAIL |
| `verstehen-einmalig` | 117 bestanden, 0 fehlgeschlagen |
| `vorgangs-lebenszyklus` | 82/82 |
| `lauf-bilanz` | 149 PASS, 0 FAIL |

Zusätzlich Schnellkern 14/14 Suiten, Syntax aller acht betroffenen JS-Dateien,
Statusgrößenprüfung 4/4 (29.980 Zeichen, 348 Zeilen) und `git diff --check`
bestanden.

Erweitert: echter Motorfehler bis zur relationalen Rückprojektion; echte lokale
Auth-Datei durch den regulären Writer/Reader; bestehender relationaler
Writer/Reader mit injizierter Tabelle, einschließlich Dual-Read-Vorrang;
Kappung, unsichere Nachbarwerte, unbekannte Feldpfade, Status-/Grundtexte,
Zählergleichheit, Idempotenz und unveränderter historischer Eintrag.
Die lokale Auth-Datei wird anschließend bytegenau wiederhergestellt.
Kein neuer produktiver Datenbanknachweis wird daraus abgeleitet.

Umgebungsgrenzen: Der erste Prozesslauf-Test stoppte nach den neuen
Diagnoseprüfungen an `listen EPERM` des vorhandenen lokalen Testservers.
Die vollständige gezielte Suite bestand außerhalb der Sandbox, weiterhin mit
dem Schutzstarter ohne Produktionskennungen. Ein nicht unterstützter
`--help`-Aufruf startete versehentlich einen breiten Offline-Lauf; dieser wurde
beendet und gilt nicht als PASS. Darin trat ebenfalls `listen EPERM` auf.
Die konservative vollständige Pflichtprüfung erfolgte durch die bestehende
[CI 42430319921](https://github.com/ernisch/helmut-pilot/actions/runs/42430319921):
beide Pflichtchecks SUCCESS am geprüften Kopf, Standard-/Bereichssuiten und
erforderliche isolierte Datenbanknachweise einschließlich Z22 erfolgreich.
Browserlauf planmäßig übersprungen; kein ausgeführter Browsernachweis.
Der zusätzliche vollständige Mock100-Job war SKIPPED. Prüfplan unverändert.

Die anschließende Nachprüfung fand keine blockierenden Befunde. Fünf weitere
reine Offline-Gegenproben bestanden: Steuerzeichen an Hash/Kennung, freie
Codepräfixe/Zusatzpfade, ungültige Einträge an den Stichprobengrenzen und
stabile Zuordnung nach erneuter Filterung. Das war eine Nachprüfung durch
den ausführenden Lauf, kein unabhängiges GitHub-Approval.

## Freigegebener Merge und rein lesende Nachkontrolle

[Maschinenlesbarer Beleg](validierungsdiagnose-20261108-rollout.json).
Frische Vorprüfung 08:42:11.900280 UTC: 0 laufende Prozesse, 0 aktive
relationale Sperren und 0 aktive oder unklare Auth-Sperren, genau eine
Auth-Store-Zeile. Main `915d15b6`, grüner Kopf und paralleler PR1104
unverändert. Normaler Merge mit exakter Kopfbindung; keine Schutzumgehung.
Der Merge-Tree ist bytegleich zum geprüften PR-Tree.

- Vercel `dpl_9rTzEnjjdkro8wCyQ3U7pKKWJpZU`: READY, Target Production,
  Commit exakt `ec223b77`; Hauptalias `helmut-pilot.vercel.app` bestätigt.
- Hauptseite und `/api/release/public`: HTTP200; `ok`, `ready`, `storage` true.
- Hauptseite referenziert Client/CSS mit Version `ec223b77`; beide Dateien
  bytegleich zum Merge-Stand. Hashes im Beleg, keine privaten Inhalte.
- Deploymentgebundene Logabfrage 08:42:27.544 bis 08:44:53 UTC lieferte keine
  `error`-/`fatal`-Gruppen. Das ist ein begrenztes Beobachtungsfenster.

Kein authentifizierter Klicktest oder absichtlich ausgelöster Modell-/Fehlerfall.
Keine Wiederverarbeitung, zusätzlichen Modellaufrufe, produktiven
Datenmutationen, Migrationen, Budget-, Schalter- oder Zeitplanänderungen.
PR1104 blieb auf `947add8d` offen und ungemergt. Sicherer Rückweg bei
freigegebener Rücknahme: vorheriges READY-Deployment
`dpl_4kg3SDXfWtVYupcR2UyTwsNchKWa` auf `9b00ebce` oder gezielter Revert;
keine Datenrücknahme erforderlich.

## Grenzen und nächster Schritt

Der Fix für künftige Diagnosen ist ausgerollt. Er stellt
weder den historischen Feldfehler noch Radarinhalte automatisch wieder her.
Mehr als fünf Fehler je Fall bzw. Details jenseits der ersten 25 Auffälligkeiten
bleiben bewusst außerhalb der Stichprobe. Kein Live-Modell- oder
Produktionsdatenbanktest. Rückweg: die kleinen Runtimeänderungen zurücknehmen;
keine Daten- oder Schemaänderung zurückzusetzen.

Der ursprüngliche nächste Schritt war das Review bei gesperrtem Merge.
Review und der anschließend ausdrücklich freigegebene Merge/Rollout sind
abgeschlossen. Offen ist nur die Übernahme dieses reinen Dokumentationsnachtrags;
er ändert weder Runtime noch Konfiguration oder Daten und ist kein neuer
Funktionstest. Genau nächster Schritt: den Dokumentationsnachtrag abnehmen.
