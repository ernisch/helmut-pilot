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

Pflicht-CI und Productionnachkontrolle stehen bei Erstellung dieses Dokuments noch aus. Ein authentifizierter echter Production-Entwurf oder natives Teilen wurde nicht ausgelöst und ist damit nicht nachgewiesen.

## Wirkung, Nachkontrolle und Rückweg

Regulärer Merge dieses begrenzten Reparaturstands löst das normale Vercel-Deployment aus. Risiko: zusätzlich erlaubte, ausdrücklich angeforderte Büroentwürfe verbrauchen innerhalb des unveränderten Betriebsbudgets Modellkosten. Kein automatischer Generierungslauf wird gestartet. Nachkontrolle rein lesend: geprüfter Commit/READY/Alias, ausgelieferte Clientbytes und Meldungen, unveränderte Geldvertrags-/Reservebindung sowie Fehler im begrenzten Deploymentfenster.

Rückweg: gezielter Revert-PR oder bei bestätigter Regression vorheriges READY-Deployment `dpl_5JvfbuHBXfrqZp9FzpVbDZFpPTfG` wieder zuweisen. Keine Datenmigration, Nachabrechnung oder Budgetänderung erforderlich. Noch nicht ausgeführt.
