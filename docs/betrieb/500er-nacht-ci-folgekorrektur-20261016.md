# Lokale CI-Folgekorrektur vom16.10.2026

Die Pflicht-CI für `5c238b6189a931ff8afb7c44c53b60e7467edd90` ist [im Offlineblock fehlgeschlagen](https://github.com/ernisch/helmut-pilot/actions/runs/38837504579). Die öffentlichen Check-Annotationen nennen genau fünf Suiten. Browser-/Mobile-Smoke und die vorher ausgeführten Datenbankprüfungen sind grün; Bereichsregression und Z22 wurden nach dem Offlinefehler übersprungen. Eine vollständige grüne CI wird nicht behauptet.

## Ursachen und begrenzte Korrektur

- `current-state-groesse-test.js`: 41.686 statt maximal30.000Zeichen. Vollständiger alter Status bytegleich archiviert (SHA256 `d1262f8b7df129848d4f0d754b019754dd6a9cfe4457aed99864fc3de439e3a5`); historische Abschnitte im aktuellen Cockpit durch Archivlink ersetzt. Größenlimit unverändert.
- `env-inventar-test.js`: Beschreibung der nicht geheimen Publikations-Hold-Policy und des öffentlichen Inhaltsnachweis-Schlüssels ergänzt; keine Variable gesetzt.
- `provider-runtime-attestation-test.js` und `provider-runtime-auth-rebind-test.js`: Beide reinen VM-Tests kennen die neuen optionalen Optimierungsimporte des echten Canonical-Hashers noch nicht. Nur für diese zwei exakt benannten Importe innerhalb des Hashers bleibt das Optimierungsnamespace ausdrücklich inaktiv. Die reale kanonische SHA-Berechnung, EU-/Profilmodule, Auth-/Fristprüfungen und alle übrigen engen Importlisten bleiben bestehen. Unabhängiger SHA-Vergleich und Zähler belegen den echten Fallback; der Optimierungshasher ist eine werfende Sperre und wird nie aufgerufen. Kein FS-/Runtimegraph wird in die reinen Tests freigegeben. Diese Tests behaupten keine Abnahme des aktiven Optimierungspfads.
- `scalable-pipeline-flag-test.js`: Die bisherige Volltextsuche verwechselte eine gebündelte Workerdatei mit einer Cronroute. Jetzt werden die tatsächlich frisch gelesenen Cronpfade geprüft; Worker-/Scalable-/Jobqueue-Routen sowie fehlende oder ungültige Cronstrukturen bleiben gesperrt. Zusätzliche Negativfälle und ein zulässiges Worker-Bundle sichern die Trennung. Die echte `vercel.json` bleibt unverändert.

DeepSeek Flash High hat die Dokumentationskorrektur lesend geprüft; DeepSeek V4 Pro High hat den eng begrenzten VM-/Cron-Ansatz unabhängig sicherheitlich geprüft. Sol hat die gezielten Änderungen umgesetzt und die tatsächlichen Tests ausgeführt.

## Tatsächliche lokale Prüfung

Alle fünf genannten Suiten laufen über den unveränderten lokalen Starter erfolgreich: Größenprüfung4/0, Variableninventar38/0, Runtime-Attestation13PASS, Auth-Rebind einschließlich2echter Handler und20negativer Bindungen, Scalable-Schutz64/0. Die geänderten Tests werden zusätzlich auf Syntax geprüft; `git diff --check` ist sauber.

Anwendungscode, Worker, Quellenpins, RPC-Proposals und Production-Konfiguration sind gegenüber dem CI-Commit unverändert. Die500fachlich geprüften Eingaben und ihre Originaldateien werden nicht erneut erzeugt oder fachlich geprüft. Kein neuer Auftrag, keine Aktivierung der vorbereiteten500erKohorte, keine Migration und keine Production-Aktion.

Der vollständige neue Offline90/Unit60/Auth30/16Kontrollpunkte-/Gesamtspeichernachweis bleibt offen. Er benötigt weiterhin den frischen gebundenen lokalen Originalpfad und die getrennte, ausdrücklich begrenzte lokale Aktivierungsfreigabe. Zusätzlich muss die vollständige Pflicht-CI nach Veröffentlichung dieses Fixes grün werden.

## Zweite CI: ausschließlich zwei Prosa-Fehler

Der [Folgelauf für0e7c504f](https://github.com/ernisch/helmut-pilot/actions/runs/38840366852) hat die vollständige Standard-Offlineregression und Browser/Mobile bestanden. Die anschließende Bereichsregression meldet nur `prosa-modellversuch-test.js` und `prosa-denktiefe-test.js`; Z22 wurde deshalb noch nicht ausgeführt. Beide Fehler sind lokal über den Originalstarter mit `PROSA_PROMPT` reproduziert.

Ursache ist ausschließlich der neue PDF-Dokumentdatum-Satz im allgemeinen Understanding-Prompt. Die geschlossenen historischen Prosa-Verträge erkennen diese unangeforderte Promptänderung korrekt. Jetzt wählt Understanding die Zusatzregel anhand seiner tatsächlich ausgewählten und vollständig geprüften Originalquellen. Jede ausgewählte Quelle durchläuft den echten geschlossenen PDF-Verifizierer; eine gültige Quelle verdeckt keine später ungültige. Bei gewöhnlichen Quellen bleibt der historische Prompt exakt erhalten. Die vollständigen statischen Regeln bleiben für Briefing-Erzeugung und Quellenreview unverändert erhalten, da diese typisierte D-Kontexte statt Originalzeilen erhalten.

Kein eingefrorener Prosa-Hash, Manifest, Schema, operatives Versuchsscript, Zeit- oder Budgetlimit wird geändert. Der geprüfte Original-PDF-Prompt bleibt bytegleich (SHA256 `43e4b630abda235f92d99bcc1d1bccba3951610ab82e511e1230206fc19a63fc`). Der tatsächlich betroffene Inhaltsgraph-Pin für `quellen-zeitvertrag.js` wird auf den neuen Code gebunden; alte signierte Inhaltsnachweise werden nicht weiterverwendet. Die500 Eingabedateien und alle fachlichen Urteile bleiben bytegleich.

Tatsächlich lokal bestanden: beide unveränderten Prosa-Suiten13/14Schutzgruppen einschließlich aller17Original-Prompthashes; Quellenzeitvertrag14Gruppen mit neuen positiven und negativen Fällen; Artikelkontext10Gruppen; geschlossener PDF-Vertrag31Fälle; kanonische Inhaltsfakten31Fälle und gespeicherte Command-Bindung72Fälle. Das sind gezielte Offline-Regressionen, kein neuer500erEndlauf oder Zeit-/Speichernachweis. ProHigh hat die Ursache und den Ansatz unabhängig geprüft; FlashHigh hat die konkrete Umsetzung unabhängig lesend angenommen. Sol hat die Herkunft von `selected` aus dem unveränderten12-Dokumente-Selektor und den schon zuvor fail-closed werfenden Originalquellenpfad bestätigt. Vollständige Pflicht-CI bleibt bis zu einem grünen Folgelauf offen.
