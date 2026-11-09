# Büro: ein Vorschlag je Anlass

Stand 09.11.2026, Entwicklungsbranch `codex/buero-schreibassistent-20261109`,
Basis frisch gelesen: main `954358fe872d73b71b0d0911d66007a5cf80428c`.
Dies ist ein Implementierungs- und Offlinebeleg, kein Production-Rollout.

## Bedienung

Büro zeigt je geeignetem, eindeutig gebundenem Anlass genau ein empfohlenes
vorhandenes Format mit kurzer Begründung. Die Empfehlung verwendet die bestehende
Kommunikationsempfehlung; andernfalls Statement für eine Reaktion und Büroauftrag
für einen zu beobachtenden Vorgang. Es gibt keine Themen- oder Prompteingabe,
keinen Chat und keine Textbearbeitung. Die bisherige Formatkonfiguration entfällt.

Der ausgewählte Text entsteht bei Nutzung von Büro bzw. beim Öffnen des Anlasses.
Das allgemeine Laden der App erzeugt keine Bürotexte. Die zunächst verborgene
Formatwahl erzeugt ausschließlich die ausdrücklich gewählte Alternative.
Gültige KI-Entwürfe werden bei unverändertem Profil, Anlass, Quellenbasis und
Format am selben Berliner Tag wiederverwendet, höchstens 24 Stunden. Alte,
ungebundene oder regelbasierte Cachetexte gelten nicht als fertige Büroentwürfe.

Statement, Social Media und Büroauftrag verwenden vorhandene Kanäle.
Der vorhandene parlamentarische Kanal heißt konkret „Fragen für den Ausschuss“
und wird als Arbeitsentwurf bezeichnet, nicht als formgerechte Anfrage.
Er setzt ausdrücklich hinterlegte Mandatsebene (`parliamentType` oder
`politische_ebene`), Ausschuss und bei Landtag ein Bundesland voraus. Der alte
Profilstandard `politicalLevel: Bund` ist dafür kein Beleg; widersprüchliche
explizite Ebenen bleiben unbekannt. Ungesicherte Rollen- und Ministeriumsdefaults
erreichen den Büro-Prompt nicht.
Das bisher als Rede bezeichnete interne Stichpunktformat wird nicht angeboten.

„Teilen“ öffnet nach Nutzeraktion die native Auswahl. Ein Abbruch kopiert nichts.
Ohne native Funktion wird der Text mit vorher sichtbarem Hinweis kopiert;
nach einem nativen Fehler steht ein ausdrücklicher Button „Text übernehmen“ bereit.
Fehlschläge werden ehrlich angezeigt. Keine Veröffentlichung, kein Mailto,
kein Versand und keine Messengerintegration im neuen Ablauf.

## Fachliche und technische Grenzen

Die bestehende Kommunikationsroute löst im Büro-Modus den Anlass erneut über
den mandantenbezogenen, rein lesenden Briefingpfad auf. Request-Fakten und freie
Request-Prompts sind keine Generatorgrundlage. Widersprüchliche, fremde, fehlende,
mehrdeutige oder nicht mehr geeignete Vorgangs-/KO-Zuordnungen stoppen vorher.
Originalauszüge sind vom analysierten Sachstand und den KI-Empfehlungen getrennt.
Eine HTTPS-Artikeladresse ohne nutzbaren Quellentext genügt nicht.
Fehlende Grundlage oder Zuständigkeit sowie Budgetstopps liefern keinen
scheinbar fertigen Text. Technische Fehler erlauben einen ausdrücklichen Retry.

Budgetprüfung, atomare Reservierung, Authentifizierung, CSRF, Rate-Limit und
Mandantenscope werden weiterverwendet. Keine neue Route, Infrastruktur, Jobs,
Provideränderung oder Datenmigration. Der Quellenvertrag wird importiert;
die Quellenverarbeitung selbst wird nicht verändert.

PR #1110 sowie #1106/#1109 wurden vor Beginn auf Schreibkonflikte geprüft.
Kein Quellen-/Crawler-/Understanding-/Matching-/Storage-/Schedulercode geändert.
`docs/CURRENT_STATE.md` bleibt dem parallelen Quellenauftrag vorbehalten.
In `vercel.json` wird ausschließlich das Deployment dieses Featurebranches gesperrt.

## Gezielte Prüfungen

Alle lokalen Nodeprüfungen liefen über `scripts/lokal.js`, ohne Productionzugang.

| Prüfung | Ergebnis |
| --- | --- |
| Büro-Ehrlichkeit, Quellen/Mandate, echter Routeblock mit injizierten Reads, Generator mit gemocktem Modell | 53/53 |
| Quellenpflicht-Vertrag | 58/58 |
| Kostenlimits einschließlich einzelnem Büroaufruf/Cache | 20/20 |
| Budget-Rollout mit Fake-Transport, einschließlich atomarem Parallelgrenzfall | 20/20 |
| Mandantenbezogene LLM-Deckel | 33/33 |
| Cache-Isolation | 10/10 |
| Mandantentrennung | 20/20 |
| Syntax und Whitespace-Diffprüfung | bestanden |

Der gezielte Browsernachweis verwendet echtes Chromium mit synthetischen
API-Antworten in einem vor Appstart nachgewiesenen netzlosen Kernel-Namensraum.
Er besteht auf dem finalen UI-Stand mit **191/191 Prüfungen** und prüft
Desktop 1440, Mobil 390 und 360 Pixel, Quellen-/Kennungslücken,
Empfehlungen, keine Appstart-Modellaufrufe, explizite Alternativen, Cache und
Invalidierung, native Teilenfunktion/Abbruch/Fehler und Zwischenablagefehler.
Screenshots zeigen synthetische Inhalte; kein echter politischer Entwurf.
Der [Browserbericht](belege/buero-20261109/BROWSER_RESULT.json),
[Netzisolationsbeleg](belege/buero-20261109/NETWORK_PROOF.json) und
[Generator-/Routenlog](belege/buero-20261109/buero-ehrlichkeit-test.log)
sowie Screenshots liegen im selben Belegordner.

Der zusätzliche bestehende UI-Integrationstest bestätigt die betroffenen
Büro-/CSRF-/429-/Budgetfälle und blockierten Startzustände. Sein Gesamtlauf
stoppt später an einer alten, vom Büro unabhängigen Quiet-Briefing-Textassertion;
dafür wird kein Gesamt-PASS behauptet. Eine bereits in main veraltete
Radar-Zeiterwartung wurde nur im Test auf das vorhandene Frischelabel präzisiert.

Vor PR-CI wurden alle automatischen Trigger und der Prüfplan gelesen.
Es wird ausschließlich reguläre Pflicht-CI gestartet: Offline-/isolierte
Datenbankprüfungen und Browser-Smoke, keine `mode=mock100`-Ausführung,
kein Mock500, keine kostenpflichtigen Modellaufrufe und keine Originalquellenabrufe.
Die vorhandene CI-Auswahl bleibt unverändert. Die dortige kleine synthetische
Drei-Profil-Anschlussprüfung ist kein erneuter Mock100-Lauf.

Offen bleibt die fachliche Qualität realer generierter Texte im späteren Betrieb;
gemockte Antworten belegen keine Modellbefolgung. Merge, Production-Deployment,
Produktionsdaten- und Flagänderungen sind in diesem Auftrag nicht freigegeben.


## CI-Integration mit aktuellem main (09.11.2026)

Merge `013c5fb99cb3febf5b7fe7bb36670384739f4deb` integriert main
`03d1fc28b6bc2fabd185dc83a3ce63d93821f209` ohne Konflikte und ohne
Historienumschreibung. Die Quellenkorrekturen aus PR #1110/#1112 sind bytegleich
erhalten; die weitere Quellenarbeit PR1113 blieb zum Integrationszeitpunkt offen.
Bürointegration 53/53 und der neue reguläre Versuch1 sind bestätigt.

CI 42579177776 besteht Werkzeugdownload, kleine Anschlussprobe, Browsercheck
und vorgeschaltete Datenbanknachweise. Die Standardsuite endet mit 188/189:
Der Quellenfalltest erwartet die ausgeschriebene Anzahl „Basiert auf 1 Quelle“.
Die Quellenregion erhält diese korrekte, deduplizierte Zahl in ihrer vorhandenen
barrierefreien Beschriftung (Singular/Plural); ohne Quelle wird keine Basis behauptet.
Die sichtbare Oberfläche bleibt gleich. Keine Testassertion, Pflichtprüfung,
Workflowauswahl oder Mock100-Schutzbindung wurde dafür geändert.

Danach gezielt 28/28 Quellenfälle und 58/58 Quellenpflichtvertragsprüfungen
bestanden. Der isolierte Büro-Browsernachweis ist auf dem geänderten Client
mit 191/191 erneut erstellt und per SHA256 gebunden; ältere Screenshots
illustrieren weiterhin die unveränderte sichtbare Darstellung. Der abschließende
reguläre PR-Lauf wird auf dem folgenden tatsächlichen Fehlerfix ausgewertet,
kein alter Job wiederholt.
