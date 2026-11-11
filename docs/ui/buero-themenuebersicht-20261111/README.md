# Büro: vollständige Themen, einfache Übersicht

Stand: 11.11.2026, nach Rollout geprüft. Basis `21eede5b`. Umsetzung des nach dem [Gegencheck](../buero-redaktionscheck-20261111/README.md) ausdrücklich bestätigten Auftrags.

## Verhalten

Büro zeigt die vollständige Anzahl der aktuell verfügbaren, eindeutig quellengebundenen Arbeitsanlässe sowie die tatsächlich vorhandenen gültigen Entwürfe. Zunächst erscheinen zwei kompakte Zeilen; „Weitere Themen“ klappt den Rest in derselben Liste auf. Keine zusätzliche Mandatsbegründung oder wiederholte Briefing-Zusammenfassung.

Der eigene Büro-Pool nutzt die vollständigen verfügbaren Empfehlungen und ergänzt weitere vorhandene Items/situative Einträge, bevor die Darstellung begrenzt wird. Gleiche KO-/Vorgang-Paare aus anderen Darstellungen werden als Aliasse zusammengeführt, widersprüchliche Zuordnungen weiterhin abgewiesen. Die Briefing-Auswahl bleibt unverändert auf drei begrenzt. Die Anzahl bezieht sich auf die vom bestehenden Lesepfad gelieferten geeigneten Vorgänge, nicht auf ein unbegrenztes Nachrichtenarchiv.

Ein geeigneter Lage-Vorgang öffnet über „Im Büro öffnen“ genau seinen aktuellen Arbeitsanlass. Briefing-Übergabe, bestehende Entwürfe und Cachebindung bleiben erhalten. Kein Abgleich über Titel, keine freie Übernahme von Nachrichtentexten.

Die Formatwahl benennt fehlenden Originalquellentext und deaktiviert die Erstellung. Der Generator prüft dies nochmals vor dem HTTP-Aufruf. Ein primärer Link ohne Text verdeckt keinen ausreichend belegten Quellenalias. Der Server prüft weiterhin unabhängig die kanonische Mandats-/Vorgangsbindung und die Quellenbasis.

Öffnen, Aufklappen, Formatwahl und Rückkehr erzeugen keinen Text. Erst die ausdrückliche Format-/Erstellaktion sendet einen einzelnen Auftrag. Keine automatischen Wiederholungen, keine Profil-, Ranking-, Budget-, Datenbank- oder Quellenlaufänderung. Die separat belegten Profilfehler werden in dieser Änderung nicht behoben.

## Abnahme

- [Browserbeleg](browser-verification.json): 300 Prüfungen bestanden. [Mobile Übersicht](mobile-overview.png). Netzloses Chromium mit tatsächlichem Bootstrap/Client/CSS und synthetischen API-Antworten: Desktop 1440×900, Mobil 390×844 und 360×780. Geprüft werden vollständiger Pool bei weiterhin drei Briefing-Themen, Alias-/Mehrdeutigkeitsschutz, zwei sichtbare Zeilen, Aufklappen per Tastatur/Touch, Fokus-/Aufklappzustand bei Rückkehr, exakte Lage-Übergabe zum sechsten Thema, vollständige Entwurfszählung, vierter Vorgang nach drei ungeeigneten Empfehlungen, fehlender Quellentext und Mandatsreset. Bisherige Format-/Cache-/Fehler-/Kosten-/Teilenfälle bleiben Teil derselben Abnahme.
- Büro-Ehrlichkeit: 68 Prüfungen bestanden.
- Büro-Antwortzeit: 13 Gruppen mit virtueller Uhr bestanden; unverändert 60s, kein Auto-Retry.
- Keine bezahlten Modellaufrufe oder Production-Datenänderungen. Die simulierten Erstellungen sind kein Nachweis tatsächlicher Modellqualität oder einer authentifizierten Endkundensitzung.

Befehle jeweils aus der Repositorywurzel:

```sh
node scripts/lokal.js -- python3 scripts/ui-preview-isolated.py --only ui-office-binding-browser-test.js
node scripts/lokal.js -- node scripts/buero-ehrlichkeit-test.js
node scripts/lokal.js -- node scripts/office-antwortzeit-ui-test.js
```

Die erste direkte Browserausführung wurde vor Appstart vom erforderlichen Netzisolationsnachweis gestoppt. Die normale Sandbox erlaubte anschließend keine `uid_map`; der unveränderte Isolationsstarter lief außerhalb dieser Sandbox erfolgreich. Der Prüfaufbau wurde an den eigenständigen Büro-Pool und den persistierten Ansichtsstand angepasst; für native Enter-Aktivierung benötigt CDP auch den Enter-Text. Die neue Quellenprüfung wurde in den vorhandenen reduzierten Antwortzeittest aufgenommen.

## Liveabschluss

[PR1145](https://github.com/ernisch/helmut-pilot/pull/1145) auf geprüftem Kopf `ca5172e2` nach vollständig grüner [Pflicht-CI 43067288401](https://github.com/ernisch/helmut-pilot/actions/runs/43067288401) gemergt: 189/189 Standard- und 366/366 Bereichssuiten, isolierte Datenbanknachweise und Browser-/Mobilcheck erfolgreich. Merge `3d19f426` am 11.11., 17:54:23 UTC.

[Öffentlicher Livebeleg](live-verification.json): Production `dpl_Cf5FP5sBHfg5tC58E4ooASk21B26` READY; Hauptdomain liefert Client/CSS bytegleich zum geprüften und gemergten Stand mit Assetversion `3d19f426`. Rein lesende Kontrolle 17:55 UTC. Keine error/fatal-Gruppen im kurzen deploymentgebundenen Fenster. Der öffentliche Release-Endpunkt meldet `ok=true`, `storage=true`, weiterhin `ready=false`; das ist kein Nachweis vollständiger Inhaltsbereitschaft. Keine authentifizierte Production-Bedienabnahme oder echte Modellerstellung durchgeführt.

Die erste öffentliche HTTP-Kontrolle scheiterte vor dem Abruf am nicht erreichbaren Sandbox-Proxy; derselbe lesende Befehl außerhalb der Sandbox bestätigte anschließend die ausgelieferten Dateien. Keine Umgebungsänderung oder neue Veröffentlichung dadurch ausgelöst.

Rückweg: gezielter Revert dieses UI-Commits und reguläres Deployment, keine Datenrücknahme erforderlich.
