# Büro: vorhandener Quellentext im kompakten Appstart

Stand: 11.11.2026. Basis `d3694682`. **Korrektur live und nachkontrolliert.**

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


## Liveabschluss

[PR1153](https://github.com/ernisch/helmut-pilot/pull/1153), Kopf `de8dfbcd`, nach grüner [Pflicht-CI 43090784967](https://github.com/ernisch/helmut-pilot/actions/runs/43090784967) gemergt: 189/189 Standard- und 367/367 Bereichssuiten, isolierte Datenbanknachweise und Browser-/Mobilcheck erfolgreich. Merge `1b031b58` am 11.11., 20:11:59 UTC.

[Öffentlicher Rolloutbeleg](live-verification.json): Production `dpl_A6BqXSPARJhfZ9ys3wf4CCCF3kA2` READY, Hauptdomain auf dem geprüften Commit, Client/CSS bytegleich mit Assetversion `1b031b58`. Der unveränderte Client und der gemergte Server stimmen mit den Hashes der lokalen Datenwegprüfung überein. Keine error/fatal-Gruppen im kurzen Fenster seit Deployment. Der öffentliche Release-Endpunkt meldet `ok=true`, `storage=true`, weiterhin `ready=false`; kein allgemeiner Inhaltsbereitschaftsnachweis.

Keine authentifizierte Production-Profilsitzung, kein tatsächlicher Kundenvorgang und kein bezahlter Entwurf wurden dafür abgerufen/erstellt. Der Datenweg ist mit synthetischen gespeicherten Dokumenten und tatsächlichen Funktionen belegt; Production ist über Deployment-/Commitbindung und öffentliche Assets bestätigt. Der erste öffentliche Abruf scheiterte am nicht erreichbaren Sandbox-Proxy; derselbe rein lesende Befehl außerhalb der Sandbox gelang. Kein zusätzlicher Rollout oder Quellenlauf dadurch.
