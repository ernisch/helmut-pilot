# Planungszeitbudget Härtung vom 28.08.2026

## Sprintzustand

**Lokal abgeschlossen, insgesamt teilweise abgeschlossen.** Der getrennte Branch
`codex/planung-zeitbudget-hardening` steht auf dem lokalen, baumgleichen Stand
von PR #274. Die gezielten Regressionen und der lokale Gesamtcheck sind gelaufen.
**PR #275 ist offen, ungemergt und hat einen vollständig grünen Pflicht CI Beleg.** Production, Supabase, echte Mandatsdaten,
Migrationen, Umgebungswerte und Geheimnisse wurden nicht verändert.

Diese Härtung ist kein Lastnachweis. Insbesondere wiederholt sie weder den
isolierten Supabase Nachweis mit 200 noch den mit 500 synthetischen Mandaten.

## Anlass und belegter Fehler

Der Warteschlangen Cron begrenzte die Planungsphase mit `Promise.race`. Ein
solches Rennen beendet die unterlegene Promise jedoch nicht. Nach Ablauf des
Budgets konnte der Cron deshalb bereits `geplant: 0` und `neu: 0` als angebliche
Zähler verwenden, während dieselbe Planungs Promise weiter idempotente
Einreihungen in die Datenbank startete.

Damit waren zwei Zusagen falsch:

1. Die Laufquittung konnte unbekannte Zähler als belegte Null ausgeben.
2. Planer und Worker konnten nach dem Zeitablauf unbeobachtet gleichzeitig
   Datenbankarbeit beginnen.

Bei großen Auftragsmengen ist das ein Aufnahmeblocker: Der Betreiber kann weder
den tatsächlichen Planungsstand noch das Ende der schreibenden Planungsphase
zuverlässig aus der Antwort ableiten.

## Korrektur

1. Der Cron reicht eine absolute Deadline in den echten Planer ein.
2. Der Planer prüft sie unmittelbar vor jedem neuen Einreihen.
3. Ein bereits gestarteter, durch den Supabase Adapter selbst zeitbegrenzter
   Aufruf wird beobachtet zu Ende geführt. Danach startet kein weiterer.
4. `versucht` und `ausstehend` machen Teilstände ausdrücklich sichtbar.
5. Ein erschöpftes Budget liefert `ok: false` und den festen Grund
   `planung-zeitbudget`.
6. Bei einem unerwarteten Planungsfehler bleiben unbekannte Zähler unbekannt.
   Sie werden weder in der relationalen Quittung noch im Log als Null erfunden.

Planer, Auftragsinhalte, Reihenfolge, Idempotenzschlüssel, Workergrenzen,
Tagesdeckel und Datenbankvertrag bleiben unverändert. Es gibt keine Migration.

## Abhängigkeit und Pull Request Reihenfolge

Die Korrektur wird als eigener Branch auf PR #274 aufgebaut. Sie darf nicht in
PR #272, #273 oder #274 hineingemischt werden. Die Reihenfolge ist damit:

1. PR #272
2. PR #273
3. PR #274
4. PR #275 für das Planungszeitbudget

Der Branch ist in `vercel.json` gegen automatische Vorschau Deployments
gesperrt. Ein späterer Merge ist weiterhin ein Production Deployment und bleibt
gesondert freigabepflichtig.

## Lokaler Beweis

Alle Läufe gingen über `scripts/lokal.js`. Production Kennungen standen den
Kindprozessen damit nicht zur Verfügung.

| Prüfung | Ergebnis |
|---|---:|
| `planungs-zeitbudget-test.js` | grün |
| `pipeline-zeitbudget-test.js` | grün |
| `scalable-pipeline-flag-test.js` | grün |
| `queue-ende-zu-ende-test.js` | grün |
| `warteschlangen-abfluss-test.js` | grün |
| vollständiger Offline Lauf | 281 von 287 Suiten grün |
| GitHub Actions Lauf 33168919486 | Syntax, Offline Suiten und Browser Smoke grün |

Der neue Vertrag prüft am echten Planer insbesondere: vorverbrauchtes Budget
startet keinen Schreibvorgang; ein laufender Aufruf wird vor Rückgabe beendet;
danach entsteht auch in späteren Microtasks kein weiterer Schreibvorgang; der
Teilstand bleibt rot und zählergenau; der Server enthält kein Planungs
`Promise.race` mehr.

Die sechs roten Suiten des vollständigen Laufs liegen außerhalb des
Änderungssatzes:

| Suite | sichtbarer lokaler Befund | isolierte Wiederholung |
|---|---|---:|
| `admin-nutzer-loeschen-test.js` | Playwright Browser fehlt | nicht wiederholt |
| `passwort-setzen-login-fix-test.js` | Playwright Browser fehlt | nicht wiederholt |
| `kalender-ics-test.js` | npm Abhängigkeit fehlt | nicht wiederholt |
| `lambda-paket-test.js` | AWS SDK Paket fehlt | nicht wiederholt |
| `quellen-mehrfachabruf-test.js` | Zeitvergleich um 55 ms gedreht | 19 PASS, 0 FAIL |
| `werkzeug-lesefehler-test.js` | Verbindungsfixture lief in den Timeout | 43 PASS, 0 FAIL |

Damit ist die relevante Regression grün. Die beiden Zeitbefunde sind als lokale
Flanken sichtbar und nicht als bewiesene Ursache klassifiziert. Eine vollständig
grüne lokale Gesamtsuite wird nicht behauptet.

## Beweisgrenzen

| Ebene | Stand |
|---|---|
| lokal bewiesen | kooperative Deadline, ehrliche Zähler und kein neues Einreihen nach der Deadline |
| isoliert gegen Supabase bewiesen | unverändert der frühere Plattformnachweis bis 500; nicht Teil dieses Fixes |
| vollständig im Fachweg bewiesen | offen |
| in Production bewiesen | offen |

Der lokale Test beweist nicht, wie viele echte Aufträge 200 oder 500 Mandate
erzeugen und nicht, ob deren vollständige Facharbeit in den verfügbaren Slots
endet. Diese Messungen bleiben getrennte Z3b Schritte.

## Risiko und Rückweg

Ein langsamer, bereits begonnener Supabase Aufruf darf die Planungsdeadline noch
um höchstens seinen bestehenden Adapter Timeout überschreiten. Das ist bewusst:
Nur so bleibt sein Ergebnis beobachtet. Die globale Slotreserve bleibt davon
getrennt bestehen.

Der Rückweg ist das Revert des späteren Fixcommits mit anschließendem,
freigegebenem Production Deployment. Es gibt keine Datenbereinigung, Migration,
Flagänderung oder Geheimnisrotation.

## Noch offen

1. Merge erst nach #272, #273 und #274 sowie eigener Betreiberfreigabe
2. Wirkung erst in einem später freigegebenen Production Lauf messen
