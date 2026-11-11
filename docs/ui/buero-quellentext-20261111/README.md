# Büro: vorhandener Quellentext im kompakten Appstart

Stand: 11.11.2026. Basis `d3694682`. Lokale Korrektur abgeschlossen; Pflicht-CI und Rollout offen.

## Ursache und Korrektur

Die neue Büroansicht meldet „Quellentext fehlt“, wenn keine der übergebenen Originalquellen mindestens 30 Zeichen Text enthält. Der reale V3-Adapter `briefingContract.buildSources` übernimmt den gespeicherten Dokumentkurztext als `source.summary`. Der Backendgenerator akzeptiert genau dieses Feld bereits als Quellenbasis. `/api/app/start` liefert jedoch immer einen kompakten Briefingstand; dessen `compactSource` berücksichtigte nur `excerpt`, `content` und `relevanceReason`. `summary` ging damit auf dem Weg zur App verloren. Die ursprünglichen Browserfixtures enthielten fertige Auszüge und deckten diesen Übergang nicht ab.

Die Korrektur erhält den tatsächlichen Quellenkurztext als begrenzten Auszug auch im kompakten Lesepaket. Die Reihenfolge `excerpt → summary → content` entspricht der vorhandenen Backendprüfung. Eine redaktionelle `relevanceReason` wird dabei nicht mehr als Originalauszug ausgegeben. Die Quellenprüfung bleibt aktiv: weder Titel, Themenzusammenfassung noch Mandatsbegründung ersetzen einen fehlenden Quellentext. Bestehende Längen-/Linkbegrenzungen bleiben erhalten.

Kein erneuter Quellenabruf, keine Nachgenerierung, keine Änderung von Profil, Ranking, Budget, Authentifizierung oder Datenbank. Format und Erstellauftrag bleiben ausdrücklich. Vorhandene Quellen werden korrekt weitergereicht; tatsächlich fehlende Texte bleiben gesperrt.

## Nachweis

Der Regressionstest in `scripts/buero-ehrlichkeit-test.js` führt synthetische gespeicherte Dokumentdaten durch den tatsächlichen V3-Adapter, die tatsächliche serverseitige Appstart-Komprimierung und die tatsächlichen Clientfunktionen einschließlich Karten-HTML. Er bestätigt zunächst, dass der Backendgenerator die kanonische Quellenbasis bereits akzeptiert, und dann, dass Büro nach der Übertragung dieselbe Grundlage erkennt und „Format wählen“ zeigt.

- Unveränderter Baseline-Server `d3694682` mit neuem Test: 70 PASS, 6 FAIL; der Übergabefehler und die irreführende Verwendung der Relevanzbegründung sind reproduziert.
- Korrigierter Server: 76 PASS, 0 FAIL. Enthält auch bestehende manuelle Erstellung, Mandats-/Quellenbindung, Budget-/Fehlergründe und Cache-/Herkunftsprüfungen.
- Keine bezahlten Modelle, keine Production-Datenänderung oder reale Profilsitzung. Synthetische Dokumente belegen den Codepfad; keine zusätzliche Behauptung über den aktuellen Datenbestand der beiden Screenshot-Vorgänge.

```sh
node scripts/lokal.js -- node scripts/buero-ehrlichkeit-test.js
```

Der erste Vorher-Lauf bestätigte die vier fachlichen Übergabefehler, stoppte danach aber an einer nicht gegen fehlende Auszüge abgesicherten Längenassertion. Nach Korrektur des Prüfaufbaus wurde der unveränderte Baseline-Server erneut isoliert geprüft: alle sechs erwarteten Fehlschläge, kein Testabbruch. Die reguläre Arbeitskopie blieb dabei korrigiert.

[Maschinenlesbarer Nachweis](verification.json). Der vorhandene Prüfplan verlangt die volle Pflicht-CI; keine Schutzregel wurde gelockert. Rückweg: gezielter Revert der `compactSource`-Korrektur und regulärer Git-Rollout, keine Datenrücknahme. Der Rückweg stellt auch die falsche Quellenfehlmeldung wieder her.
