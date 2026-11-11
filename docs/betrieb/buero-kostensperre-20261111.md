# Büro: irreführende Kostensperre, 11.11.2026

Der Betreiber meldete per Handyfoto „Die aktuelle KI-Kostengrenze ist erreicht“ und erteilte nach der Diagnose ein ausdrückliches „Go“ zur Korrektur. Umfang: quellengebundene Büroentwürfe innerhalb der bestehenden Grenzen ermöglichen und die Ursache eines Stopps korrekt anzeigen. Keine neue Kostenfreigabe oder Budgeterhöhung.

## Ursache und gelesener Productionstand

- Aktuelle Productionbasis: `d76a72e545449e5b461976478a29217a515e0eac`, Deployment `dpl_5JvfbuHBXfrqZp9FzpVbDZFpPTfG`, READY, Hauptdomain `helmut-pilot.vercel.app`. Der ursprüngliche Workspace lag noch auf einem älteren Stand; Entwicklung erfolgt im getrennten aktuellen Worktree.
- Rein lesender Datenbankbeleg am 11.11.,08:34:12 UTC: zwei heutige Aufrufe; 0,012394 USD abgerechnet, heute keine offene Reserve. Gesamtbindung 1,197701 USD, davon 0,349701 USD abgerechnet und 0,848 USD in vier erhaltenen alten Reserven. Tageslimit 1 USD, Gesamtlimit 30 USD, Buch nicht eingefroren.
- `betriebskosten-budget.pruefeAnfrage` erlaubte `communicationDraft` nicht. Der nachgelagerte Fehler `betriebskosten-profil-oder-aufgabe-gesperrt` hatte denselben übergeordneten Code wie ein echter Budgetstopp. `generateCommunicationDraft` machte daraus pauschal `budget-erschoepft`.
- Lokale Reproduktion auf exakt der Productionbasis: dieselbe Ablehnung vor Speicher- und Providerzugriff. Kein echter Modelltest.

## Korrektur und Schutzgrenzen

`generateCommunicationDraft` setzt einen internen `office:true`-Marker ausschließlich nach erfolgreicher Büro-Quellen-/Formatprüfung. Der bestehende HTTP-Pfad löst den Anlass zuvor eindeutig aus dem aktuellen mandantenbezogenen Briefing auf und verwirft Request-Fakten. Nur dieser markierte `communicationDraft` ist für ein bereits zugelassenes Profil im Betriebsvertrag erlaubt. Freie Kommunikationsprompts, fremde Profile und unbelegte Anlässe bleiben gesperrt.

Die bestehende Reservierung, Senderprüfung, bestätigte Nutzungsabrechnung und beide Geldgrenzen bleiben wirksam. Geldvertrag und Vertragshash werden nicht verändert; kein Reset und keine Freigabe alter Reserven. Kein Profil-, Daten-, Konfigurations-, Cron-, Anbieter- oder Schemaeingriff.

Die Anzeige unterscheidet unzureichendes Kontingent, fehlende Aufgabenfreigabe und unbestätigte Kostenprüfung. Nur bei letzterer wird erneutes Versuchen angeboten. Auch geschützte Verstehensreserven oder zu wenig Rest für eine vollständige Modellreserve werden nicht mehr als vollständig verbrauchte Kostengrenze bezeichnet. Freie Anbieterfehlermeldungen gelangen nicht in die Oberfläche.

## Gezielte Abnahme

Alle lokalen Tests laufen durch `scripts/lokal.js` mit entfernten Productionkennungen:

- `betriebskosten-budget-test.js`: 16/16 Gruppen. Echter Generator und echte Kostennaht bis zu simuliertem HTTPS samt Abrechnung; Büro erhält genau einen gebundenen Versuch, freier Prompt/unbelegter Anlass keinen. Parallelreservierungen halten den Tagesdeckel; Tageswechsel setzt den Gesamtdeckel nicht zurück.
- `buero-ehrlichkeit-test.js`: 64 PASS, 0 FAIL; echte Gründe einschließlich unbestätigter Prüfung, ungültigem Vertrag und Aufgabenverbot bleiben unterscheidbar.
- `llm-reservation-test.js`: 38 PASS, 0 FAIL; `tenant-llm-cap-test.js`: 33 PASS, 0 FAIL.
- Isolierter Chromiumlauf über `ui-preview-isolated.py --only ui-office-binding-browser-test.js`: 193 PASS, keine Browserfehler und keine erfüllte externe Anfrage; Desktop1440 und Mobil390/360. Neue Meldungen, Wiederholungsangebot, Quellen-/Mandatsbindung und Teilen mit simulierten Antworten geprüft.
- Unabhängiger lesender OpenAI-Review: keine Sicherheitsblocker; Hinweis zum Restkontingenttext übernommen und danach Chromium erneut erfolgreich geprüft.

Beide Pflichtchecks auf Kopf `e0473aed0340c149c86a2b13c6880ad471c8d65e` erfolgreich: [CI42989820999](https://github.com/ernisch/helmut-pilot/actions/runs/42989820999), 189/189 Standardsuiten, 362/362 Bereichssuiten, Chromium sowie Z22 mit 48 PASS/0 FAIL. Der gesonderte große Mock100-Lauf wurde bewusst übersprungen. Keine Wiederholung bezahlter Modelltests.

## Regulärer Rollout und rein lesende Nachkontrolle

[PR1127](https://github.com/ernisch/helmut-pilot/pull/1127) nach dem Betreiber-GO und grünen Pflichtchecks regulär gemergt: `1a37100e680d86a35d0d37d14432546751b388bb`. Gesamter Mergebaum identisch zum geprüften PR-Kopf. Unmittelbarer Vorcheck 09:19:33 UTC: Hauptbranch noch auf ursprünglicher Basis, PR-Kopf unverändert und mergebar, keine laufenden Productionprozesse oder aktiven Pipeline-Sperren; Geldvertrag und Gesamtbindung unverändert.

Automatisches Vercel-Deployment `dpl_A7b7pE3crkGPpFKMY32MpZ7BvJCo`, target production, READY am 11.11.,09:20:39.900 UTC, Alias `helmut-pilot.vercel.app`, aliasError null. Kein manueller Zusatzdeploy.

Öffentliche Nachkontrolle 09:21:18 UTC: Startseite, versionierter Client und öffentlicher Releasecheck HTTP200. HTML bindet `1a37100e`; Client bytegleich zum geprüften Stand, SHA256 `dbda5cf8bbdb0a18c94d8aa14149a3dabea615d003d4780c7c6f69eae3164ee2`. Alle drei korrekten Meldungen enthalten, alte pauschale Kostengrenzenbehauptung entfernt. Release `ok=true`, `storage=true`, `ready=false`; dieselbe offene allgemeine Frischebereitschaft war unmittelbar vor dem Rollout bereits vorhanden. Kein vollständiger neuer Betriebsbereitschaftsnachweis behauptet.

Native Nachkontrolle 09:21:23 UTC: Geldvertragfingerprint `7b72ac08cbc3c289d52b4583f09659fd` und 56 historische Kostenbuchungen mit Fingerprint `bd671357e1816f9368fd2dbd06bdacee` unverändert zum Vorcheck. Weiterhin 58 gebuchte Aufrufe, 1,197701 USD konservative Gesamtbindung, Buch nicht eingefroren; keine laufenden Prozesse/aktiven Sperren. Keine neue Buchung oder Reservenfreigabe durch die Prüfung. Vercel error/fatal-Abfrage für genau dieses Deployment vom 09:20:21.326 bis 09:21:08.310 UTC ohne Treffer; Aussage nur für dieses begrenzte Fenster.

Ein authentifizierter echter Production-Entwurf oder natives Teilen wurde nicht ausgelöst und ist damit nicht nachgewiesen. Der Funktionsnachweis verwendet simulierte Anbieterantworten, echten Generator/Kostenpfad, isolierte Routenprüfung und echten Chromium. Die ausgerollte Version und Kostenintegrität sind zusätzlich live rein lesend belegt.

## Wirkung, Nachkontrolle und Rückweg

Regulärer Merge dieses begrenzten Reparaturstands hat das normale Vercel-Deployment ausgelöst. Risiko: zusätzlich erlaubte, ausdrücklich angeforderte Büroentwürfe verbrauchen innerhalb des unveränderten Betriebsbudgets Modellkosten. Kein automatischer Generierungslauf wurde gestartet. Die rein lesende Nachkontrolle ist oben belegt.

Rückweg: gezielter Revert-PR oder bei bestätigter Regression vorheriges READY-Deployment `dpl_5JvfbuHBXfrqZp9FzpVbDZFpPTfG` wieder zuweisen. Keine Datenmigration, Nachabrechnung oder Budgetänderung erforderlich. Noch nicht ausgeführt.
