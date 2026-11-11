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

## Folgefehler: zu kurzes Client-Zeitfenster, 11.11.2026

Der Betreiber meldet nach dem Rollout erneut einen fehlenden Büroentwurf, jetzt mit der generischen Fehlermeldung und Wiederholungsknopf. Damit ist die bisherige Abnahme als durchgängiger Funktionsnachweis unzureichend; der erfolgreiche Kostenfix bleibt davon getrennt belegt.

Native Leseaufnahme09:59UTC: fünf echte `communicationDraft`-Aufrufe des Nutzers09:57–09:58UTC, alle mit Anbieterstatus erfolgreich, etwa3s Providerdauer und bestätigter Kostenabrechnung. Vier Aufrufe hatten2960 Eingabetokens und298–321 Ausgabetokens, der fünfte3310/335. Der Erfolg des Anbieters beweist keine erfolgreiche JSON-Auswertung oder Anzeige. Die eigentlichen Antworttexte werden bewusst nicht im Nutzungslog gespeichert. Abgefragte Vercel-Fehlerprotokolle liefern für diese Versuche keinen zusätzlichen Fehlergrund.

Der bestehende Client wartet auf `/api/communication/generate` nur12s. Das `Promise.race` beendet allein das Warten; der laufende Serverauftrag wird weiter bearbeitet und kann bereits Kosten verursachen. Eine danach erfolgreich eintreffende Antwort wird verworfen, `generateSelectedOfficeDraft` zeigt `ki-fehler`. Unabhängige lesende Clientprüfung und virtuelle Negativkontrolle reproduzieren genau diesen Ablauf mit einer15s-Erfolgsantwort. Profil-/Anlassänderungen allein verwerfen die Antwort ohne diesen Fehlerzustand.

Rein lesender Abruf des aktuellen App-Vertrags10:06UTC: HTTP200 in6,522s, davon Briefing5,221s. Hinzu kommen im Entwurfsweg Kostenreservierung, der etwa3s-Providerabruf und bestätigte Abrechnung. Die vollständige HTTP-Dauer der fünf alten Anfragen ist damit weiterhin nicht nachgewiesen; die Zuordnung des Nutzerfehlers zum Zeitfenster bleibt ohne echte Einzelprobe begrenzt.

Kleinste Korrektur: ausschließlich Büroanfragen erhalten60s Wartezeit; andere Kommunikation behält12s. Keine automatische Wiederholung, kein geänderter Modell-, Kosten-, Profil- oder Quellenpfad. Neuer `office-antwortzeit-ui-test.js` prüft mit echten Clientfunktionen und virtueller Zeit11/11 Gruppen: alter15s-Fehler als Negativkontrolle, erfolgreiche Übernahme bei3/15/59,999s, nur ein POST auch bei Mehrfachklick, ehrlicher Timeout nach60s, keine Übernahme alter Texte bei Profil-/Mandanten-/Sitzungs-/Anlasswechsel. Bestehende64 Ehrlichkeitsprüfungen und193 isolierte Chromiumprüfungen ebenfalls bestanden. Helfer schrieb ausschließlich den neuen Test; Hauptlauf änderte ausschließlich Clientaufruf und Dokumentation.

Eine gesondert freizugebende Einzelprobe ist vorbereitet: genau ein Büroauftrag zum Anlass „Linke, SPD und Grüne beginnen Sondierungsschritte nach Berliner Abgeordnetenhauswahl“, nur das bereits aktive betroffene Profil, höchstens0,21USD Vollreserve innerhalb1USD/UTC-Tag und30USD insgesamt, maximal60s, keine Wiederholung, keine Profiländerung. Skript außerhalb Git liest vorher Vertrag und Kostenbestand, stoppt bei unbekanntem/abweichendem Vertrag oder fehlendem Spielraum und verwendet denselben normalen Kostenpfad ohne Budgetausnahme. Fester Einmalmarker verhindert versehentliche Wiederholung. Erfolg nur bei gebundener abgerechneter Einzelbuchung und nichtleerer erfolgreicher API-Antwort; Originalantwort bleibt privat. Nutzerfreigabe ist angefragt und noch nicht als erteilt angenommen.

### Rollout dieser Folgekorrektur und offene Abnahme

[PR1129](https://github.com/ernisch/helmut-pilot/pull/1129) nach beiden grünen Pflichtchecks [CI43001755133](https://github.com/ernisch/helmut-pilot/actions/runs/43001755133) regulär gemergt. Kopf `bd93450b3b1eb5e99111efec6c5f13a9359b8f11`, Merge `ca9a3fc68e9fda61260c6a70db0d1b96a738e45e`, gesamter Baum identisch. Prüfplan gezielt:14/14 Schnellkern,135/135 Bereich und verpflichtender Chromiumcheck; keine erneute große Datenbank-/Standardabnahme bei dieser zugeordneten Clientänderung. Vorcheck10:17:42UTC: Hauptbranch/PR-Kopf konfliktfrei und unverändert,0laufende Prozesse/0aktive Sperren, unveränderter Geldvertrag,63Buchungen und1,211628USD Bindung.

Automatisches Productiondeployment `dpl_D1FUJYGfyqbQLGuegcihdjaq9Usr` READY auf demselben Merge. Hauptdomain-Nachkontrolle10:18:55UTC: HTML bindet `ca9a3fc6`, Client bytegleich zum geprüften Stand, SHA256 `37873ea49464ebf8e90a9b145f3ce068962b394249e9d4a8bc56c25688131b0a`. Explizites Bürozeitfenster60s und sonst12s bestätigt. Öffentlicher Status weiterhin `ok=true`, `storage=true`, `ready=false` wie zuvor; keine neue allgemeine Frischeabnahme.

Native Nachkontrolle10:19UTC: weiterhin63Buchungen/1,211628USD Gesamtbindung, Vertragshash `8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348` unverändert, keine laufenden Prozesse/aktiven Sperren. Keine weitere bezahlte Anfrage durch den Hauptlauf; Einmalmarker der vorbereiteten Probe fehlt weiterhin. Vercel error/fatal-Abfrage genau dieses Deployments10:18:12–10:19:01UTC ohne Treffer, nur für dieses kurze Fenster belegt.

**Status: teilweise abgeschlossen.** Der Clientdefekt ist korrigiert, getestet und live bytegleich belegt. Die tatsächliche Ursache der fünf konkreten Fehlanzeigen ist ohne vollständige HTTP-Antwort weiterhin nicht abschließend zugeordnet. Genau eine kostenpflichtige gebundene Einzelprobe wartet auf die bereits angefragte ausdrückliche Nutzerfreigabe. Ohne diese wird kein neuer Anbieteraufruf gestartet und kein vollständiger Live-Funktionserfolg behauptet.

Rückweg dieser begrenzten Clientkorrektur: Revert von PR1129 oder vorheriges READY-Deployment `dpl_A7b7pE3crkGPpFKMY32MpZ7BvJCo`. Keine Datenmigration oder Kostenbuchbereinigung. Das abschließende reine Dokumentations-PR aktualisiert nur diese Nachweise und benötigt gemäß `CLAUDE.md` keinen rekursiven Folgebericht.
