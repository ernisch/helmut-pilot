# KI Antwortumschlag Parserfix vom 28.08.2026

## Sprintzustand

**Teilweise abgeschlossen.** Der kleine Folgebranch
`codex/ki-antwortumschlag-hardening` steht lokal auf dem Kopf von PR #273
`2a01ea9e`. Code und gezielte Regressionen sind grün. Der Branch ist noch nicht
hochgeladen, ein Pull Request existiert noch nicht, und Production wurde nicht
verändert. Der rote natürliche Fünferbefund gilt daher weiterhin als offen.

## Anlass und belegte Grenze

Der natürliche Understanding Lauf am 27.08.2026 um 21:30 UTC endete ohne
laufweiten Fehler, hinterließ aber nach zwei Versuchen und zwei KI Aufrufen einen
Vorgang erneut im Zustand `unbekannt`. Ein Ergebnis wurde nicht gespeichert.

Die Fehlermeldung passt zu einem reproduzierbaren Transportpfad: Der Anbieter
lieferte im eingebetteten Modelltext ein rohes Steuerzeichen. Dadurch war schon
der äußere JSON Umschlag ungültig. Die vorhandene Rettung für Modelltext konnte
noch nicht greifen, weil der Umschlag vorher mit `JSON.parse` abbrach.

Dieser Befund ist eine Regression im Betrieb mit fünf Mandaten. Er ist kein
neuer Skalierungsnachweis und kein Beleg für 10 bis 500 Mandate.

## Korrektur

1. Der Anbieterumschlag wird zuerst normal als JSON gelesen.
2. Nur nach einem Syntaxfehler folgt genau ein zustandsbasierter Rettungsversuch,
   der rohe Steuerzeichen innerhalb von JSON Zeichenketten korrekt escaped.
3. Führende Prosa, Markdown und strukturell kaputtes JSON bleiben verboten.
4. Nur eine Anbieterantwort mit `status: completed` gilt als fachlicher Erfolg.
5. Ein unvollständiger HTTP 200 Lauf bleibt kostenwirksam, wird aber mit
   `success: false` und seinem Usage Block erfasst.
6. Syntaxfehler aus Anbieterumschlag und Modelltext verlassen die zentrale
   KI Engstelle nur noch als feste, inhaltsfreie Fehlerkategorie. Antwortfragmente
   gelangen weder in den Fachpfad noch in das Nutzungsprotokoll.

Die Korrektur verändert weder Prompts noch JSON Schemas, Modellwahl, Tagesdeckel,
Parallelität, Datenbankvertrag oder Wiederholungslogik.

## Abhängigkeit und Pull Request Reihenfolge

Der Fix ist fachlich unabhängig von Z3a und Z22. Sein Regressionstest benötigt
aber die lokale KI Attrappe aus PR #272. Deshalb ist der saubere Branch auf PR
#273 aufgebaut. Die Reihenfolge bleibt:

1. PR #272
2. PR #273
3. eigener Pull Request für diesen KI Antwortvertrag

Der Fix wird nicht in PR #272 oder #273 hineingemischt. Nach jedem Merge muss das
automatische Deployment rein lesend geprüft werden. Die Z22 Migration bleibt eine
eigene spätere Freigabe und wird durch keinen Merge erlaubt.

## Prüfungen

Alle Läufe gingen über `scripts/lokal.js`. Damit waren Production Kennungen aus
den Kindprozessen entfernt.

| Prüfung | Ergebnis |
|---|---:|
| `ai-json-parse-test.js` | 25 PASS, 0 FAIL |
| `ki-antwortvertrag-test.js` | 10 PASS, 0 FAIL |
| `budget-rollout-test.js`, isoliert | 20 PASS, 0 FAIL |
| `z3-realistiklauf-vertrag-test.js` | 48 PASS, 0 FAIL |
| `understanding-live-smoke.js`, lokaler HTTPS Mock | vollständig grün |
| vollständiger Offline Lauf | 279 von 286 Suiten grün |

Der erste parallel ausgeführte Budgettest hatte 18 PASS und 2 FAIL. Die
unmittelbar danach isolierte Ausführung war 20 zu 0 grün. Das spricht für eine
Überschneidung am lokalen Testzähler, beweist die Ursache aber nicht vollständig.
Der parallele Befund ist kein Produktnachweis und wird nicht verschwiegen.

Die sieben roten Suiten des vollständigen Laufs liegen außerhalb des
Änderungssatzes:

| Suite | sichtbarer lokaler Fehler |
|---|---|
| `admin-nutzer-loeschen-test.js` | Playwright Browser fehlt |
| `passwort-setzen-login-fix-test.js` | Playwright Browser fehlt |
| `kalender-ics-test.js` | npm Abhängigkeit fehlt |
| `lambda-paket-test.js` | AWS SDK Paket fehlt |
| `p1-security-check.js` | Login antwortet 401, Browserattrappe unvollständig |
| `resend-transport-test.js` | Kontoanlage liefert lokal keinen Einladungslink |
| `reset-timing-seitenkanal-test.js` | wiederverwendete lokale E Mail |

Damit ist die relevante Regression grün. Eine vollständig grüne Gesamtsuite wird
nicht behauptet.

## Wirkung, Risiko und Rückweg

Erwartete Wirkung nach einem später freigegebenen Merge: Ein ansonsten gültiger
Responses API Umschlag mit rohen Steuerzeichen im eingebetteten Modelltext kann
verarbeitet werden. Unvollständige oder strukturell kaputte Antworten bleiben
fail closed.

Das wichtigste Risiko ist ein Anbieter, der entgegen dem Responses API Vertrag
keinen `status` liefert. Dieser Fall wird bewusst abgelehnt statt als Erfolg
gebucht. Die vorhandenen lokalen Anbieterattrappen wurden entsprechend dem echten
Vertrag ergänzt.

Der Rückweg ist das Revert des späteren Fixcommits mit anschließendem
Production Deployment. Es gibt keine Migration, keine Datenänderung, kein Flag
und keine Umgebungsvariable zurückzusetzen.

## Noch offen

1. Branch committen und hochladen
2. eigenen Pull Request auf Basis von PR #273 erstellen
3. Pflicht CI vollständig grün belegen
4. Merge nur nach eigener Betreiberfreigabe
5. automatisches Production Deployment rein lesend prüfen
6. erst im nächsten natürlichen Understanding Lauf den Fünferbefund regressieren

Ein künstlicher Production Lauf ist dafür nicht freigegeben und nicht nötig.
