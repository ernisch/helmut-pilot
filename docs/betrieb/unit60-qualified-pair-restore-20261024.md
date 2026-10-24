# Qualifiziertes U/Parts-Paar wiederhergestellt

Stand24.10.2026. Eigener Branch `codex/unit60-restore-qualified-pair-20261024`,
Ausgang exakt PR939/`e36233249fd1f22f4666430684cd634aee41b251`.
Die beiden Laufzeitdateien entsprechen bytegenau PR936/`2fc821fd` und den
unveränderten vorhandenen nativen Quellenbindungen. Pflicht-CI des endgültigen
Kopfes wird am zugehörigen PR geprüft; kein neuer nativer Lauf ist erfolgt.

| Datei | Bytes | SHA256 |
| --- | ---: | --- |
| `lib/helmut/auth-state-parts.js` | 27356 | `0ff039245d60ceb7f5855f62433feab0ae0eea989606d3ad8022510a8d1d80a3` |
| `lib/helmut/llm-usage-atomic.js` | 32050 | `dc12a5c8abf7a7b4f4334ff0b886106b42381efa864ac13d4374285242886d0a` |

## Umfang und Rückweg

Zurückgenommen ist ausschließlich die zusätzliche Hash-/Knotenwiederverwendung
aus PR938. Parts liefert wieder den vollständigen Capture; Atomic bildet daraus
das exakte Transportdelta. Originalvalidierung, CAS, History, ACK-Prüfung,
Einmalzeugen, Grenzen, Zeiten und unbekannte Writes ohne Retry bleiben erhalten.

Die zusätzliche Arbeitsersparnis-Erwartung im Strukturtest entfällt mit der
verworfenen Optimierung. Stattdessen prüft derselbe Fall vollständigen Capture,
Root, erreichbare Hashmenge und das tatsächliche CAS-Transportdelta gegen den
kalten Vollaufbau. Frische Payloadprüfung, neue Payloadhashes und die beiden
zusätzlichen Sicherheitsfälle aus PR938 bleiben erhalten; weiter22Fallgruppen.

Alle anderen Dateien der Diagnose-/Motorimplementierung sind unverändert gegen
PR939, insbesondere PR937-Source/Controller/Host/Worker und der dort korrigierte
Guard-/JSON-Abschluss. Die fünf Pins der unabhängigen Integrationsprüfung aus
PR939 stimmen weiterhin exakt. Kein neuer Router-, SQL-, Konfigurations- oder
Qualifikationsmechanismus wurde eingeführt.

PR938, PR939, ihre Branches/Commits, bisherigen Quelldossiers und Rohbelege bleiben
erhalten. Rückweg ist das Wiederherstellen der zwei Dateien und des betroffenen
Tests aus `e3623324` auf einem Entwicklungsbranch; keine Datenmigration oder
Originalwiederherstellung nötig. Die verworfene Variante wäre danach erneut
unqualifiziert. Kein Merge oder Deployment gehört zu diesem Auftrag.

## Tatsächliche gezielte Prüfung

Alle Testaufrufe über `scripts/lokal.js`, Node v24.19.0.

- `control-cache-integration.acceptance()` nimmt das echte vorhandene Fünffall-
  Paket wieder an: qualified/acceptedLocalCacheDelta true, production/full500 false.
- `control-cache-source-integration-test.js`: PASS,99abgewiesene Negativmutationen,
  kein SOURCE-only-Override, keine DB-/Anbieter-/Original-Auth-Zugriffe.
- `synthetik-500-runtime-artifact-attestation-test.js`:10PASS; alle89Quellpins
  stimmen wieder, Drift-/Pfad-/Budget-/Schlüsselnegative unverändert.
- `local-unit-diagnostic-atomic-small-mutation-test.js`:22PASS einschließlich
  exaktem Capture/Delta, CAS-Konflikt, unbekanntem ACK, Fristen und Einmalverbrauch.

Der erste lokale Quellenintegrationstest erreichte die nachgelagerte Descriptor-
Prüfung und scheiterte dort an einem nicht eingerichteten absoluten Reviewpfad.
Die bestehende CI stellt vier öffentliche versionierte SAFE-Reviewdateien an
genau diesen Pfaden bereit. Diese Vorbereitung wurde lokal mit ihren bestehenden
Größen-/SHA256-Pins und Bytevergleich nachvollzogen; keine privaten Originale.
Danach bestand der vollständige Test. Weder Gate, Beleg noch erwarteter Hash wurde
geändert. Manifest und native Qualifikationsartefakte bleiben byteidentisch zu936.

## Aussagegrenze und nächster Schritt

Die vorhandene native U/Parts-Komponentenqualifikation gilt für dieselben exakten
Bytes weiter. Sie wird geprüft und wiederverwendet, nicht auf neue Bytes übertragen
und nicht durch neue native Vergleichsläufe ersetzt. Der Blocker der neuen
Quellenvariante aus PR938 entfällt damit für diesen Branch. Die endgültige
gemeinsame CI-Annahme bleibt an den tatsächlichen PR-Kopf gebunden.

Kein 60s-, Auth30-, gemeinsamer Speicher-/500MB- oder vollständiger500er-Nachweis
entsteht daraus. Für den anschließenden einmaligen nativen Einzeltest müssen im
bestehenden Quellkontext Originale/Code/Runtime, Prozesse und tatsächliche
Kapazität frisch gebunden und die neue Einmalfreigabe geprüft werden. Alle alten
GOs/Claims bleiben verbraucht. Der ursprüngliche Zeitanker einschließlich
Autorisierung, zweimal19.900ms,16Kontrollen,dreiPositionen,FinalACK/Rücklesungen
und vollständige Original-/Prozess-/EOF-Abschlüsse bleiben zwingend.

Keine Speicherbereinigung, Löschung von Beständen, Originaldatenübertragung,
vollständiger nativer Test oder Productionaktion wurde vorgenommen.
