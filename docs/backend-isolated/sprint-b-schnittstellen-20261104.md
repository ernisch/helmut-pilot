# Sprint B: bestehende Produktschnittstellen offline geprüft

Stand: 04.11.2026, Europe/Istanbul. **Gezielte Offline-Vertragsprüfung bestanden;
keine Live-, HTTP-, Datenbank- oder Production-Abnahme.**

Arbeitsbereich ausschließlich `/workspace/helmut-backend-sprint-b-20261104`,
eigener lokaler Klon des vorhandenen Branches `feat/claude-backend-isolated` auf
`ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`. Vor Beginn sauberer Git-Stand,
keine zusätzlichen `AGENTS.md`; die Hauptsitzung hat die vollständigen
Pflichtdateien gelesen und unveränderte Hashes bestätigt. Die besonderen
Offline-/Isolationsgrenzen des Betreiberauftrags haben Vorrang vor älteren
Autonomie-/Merge-/Helferfreigaben.

## Unveränderter gemeinsamer Anschluss

`GET /api/app/start` in `server.js:667` liefert den gemeinsamen Einstieg:
`{ profile, briefing, tasks, notes, aiStatus, version }`. Das Profil trägt
`profilValidierung`. Die Mandatsidentität wird **vor** der Route aus Session und
zulässigen Zuordnungen aufgelöst (`server.js:589–658`), nicht aus einer freien
Kundenkennung im Body. Die URL-Kennung ist Auswahl innerhalb dieser Berechtigung.
Fehlt die notwendige Zuordnung im Accountmodus, bleibt der vorhandene
403/`no-mandate`-Schutz erhalten. Der nachgelagerte mandatslose Auswahlvertrag
ist ein anderer Zustand als ein vorhandenes leeres Briefing.

| Produktansicht | Bestehender Vertrag | Bedeutung für die bestehende UI |
| --- | --- | --- |
| Briefing | `briefing.currentHelmutState`, `items`, `personalizedRecommendations`, Quellen; `available`, `reason`, `generatedAt` | Tagesanlass und Handlung aus dem vorhandenen deterministischen Adapter; keine zweite Briefingberechnung im Client |
| Lage | `briefing.lageBriefing`: `available`, `reason`, `paragraphs`, `vorgaenge`, `latestUpdatedAt` | Der Appstart ruft `buildLageBriefing(..., { cacheOnly: true })` auf. Leer und Fehler bleiben unterscheidbar; keine Narrativerzeugung durch diesen Appstartpfad |
| Radar | `briefing.currentRadarState`, insbesondere `anzeige` mit `mentions`, `environment`, `dynamics`, `articles` | Bestehender paketierter Lesevertrag; kein zusätzlicher Radar-Generator oder neuer Endpunkt nötig. Leere persönliche Resonanz darf korrekt sein |
| Büro | Entscheidungen/Quellen/Formate aus dem vorhandenen Kontext; `POST /api/communication/generate` | Vorhandener Kommunikationsweg, siehe unten; keine bloße Leseaktion und kein neuer paralleler Büro-Backendpfad |

Das direkte `GET /api/briefing/latest` in `server.js:767` gibt den Briefingvertrag
direkt zurück, nicht den gesamten Appstart-Umschlag. Der vorhandene UI-Client
konsumiert die genannten Felder (`client.js:438`, `:4558`, `:4567`, `:9550`).
Eine Umbenennung, neue Datenbank oder neue Erzeugungsroute ist für diese
Anbindung nicht erforderlich.

Der Radar-/Briefingadapter in `lib/helmut/briefingContract.js:1108–1156` ist
deterministisch; `currentHelmutState` und `currentRadarState` bleiben getrennte
Sichtrollen. `lib/helmut/briefing-speicher.js:103–106` setzt seine strukturelle
Prüfung ausdrücklich nicht mit vollständiger Faktenprüfung gleich. Ein
fachliches Qualitätsurteil und eine vollständige Tagesbilanz sind keine
automatische Folge eines erfolgreichen Appabrufs.

## Büro: vorhandene zwei Wege nicht vermischen

Der bestehende UI-Client `generateStatementWithBackend` (`client.js:12419`)
verwendet:

```text
POST /api/communication/generate?politicianId=<erlaubte Auswahl>
{ prompt, channel, decision }
→ { text, aiEnabled, channelLabel, ... }
```

Der Server (`server.js:1059`) begrenzt den Prompt auf 1.200 Zeichen und verwendet
das **serverseitig aufgelöste** Profil samt vorhandenem Lernkontext. Die Route
hat die bestehende Drosselung von 18 Anfragen pro Stunde. Die gemeinsame
CSRF-Prüfung liegt vor dem Handler (`server.js:663`, `:5999`). Ein erfolgreicher
POST ist nicht durch einen GET-Verwaltungsleser ersetzbar.

`lib/helmut/ai.js:208–320` führt den vorhandenen Kommunikationsweg aus.
Mandantenbudget in `:234`, Anbieteraufruf mit `callType: communicationDraft` in
`:299`; der allgemeine Reservierungs-/Kostenpfad bleibt unverändert. Bei
fehlendem KI-Schlüssel entsteht ein ausdrücklich als regelbasiert markierter
Fallback (`aiEnabled:false`, `degraded`, `fallbackReason`, `sourceNote`), kein
belegter KI-Entwurf. Die neuen Prüfungen benutzen keine Provider-Identität.

Zusätzlich existiert `POST /api/office/generate` (`server.js:829`) mit
`{ vorgangId, outputType }`. Dieser separate Weg verwendet
`lib/helmut/office.js`: vorhandenes Office-Flag, abgeschlossene KO-Analyse,
mandantenbezogenen Cache, Tageslimit und dann den bestehenden KI-Pfad. Die Route
weist vorhandenen Previewbetrieb zurück. Er wird von der oben untersuchten
UI-Funktion **nicht** benutzt und wird nicht als Ersatz angeschlossen.

Wichtige Nebenwirkung: `GET /api/app/start` erfasst Aktivität über
`accounts.recordUserActivity` (`server.js:669`). Der bestehende Büroclient ruft
`generateOfficeDraftsInBackground` an `client.js:431/:485` auf und begrenzt einen
Durchlauf auf sechs Generierungen (`:12814`). Eine vollständige Kunden-UI live
zu öffnen ist deshalb keine garantierte rein lesende Prüfung. In diesem Sprint
wurde weder diese UI gestartet noch ein solcher API-/Provideraufruf ausgeführt.

## Tatsächlich durchgeführte Prüfungen

Alle Befehle im eigenen Klon mit einer expliziten kleinen Environment-Allowlist
(`PATH`, Sprache, Zeitzone, ggf. temporäres Verzeichnis); keine geerbten
Zugangsdaten. `NODE_PATH` liest ausschließlich die bereits vorhandenen Pakete
unter `/workspace/helmut-pilot/node_modules` (darunter `ical.js` 2.2.1).
Kein Download oder Installationsskript. Jeder Befehl läuft über den vorhandenen
`scripts/lokal.js` samt Netzsperre.

| Gezielter Befehl | Ergebnis | Art des Belegs |
| --- | --- | --- |
| `node scripts/lokal.js scripts/sprint-b-schnittstellen-test.js` | 10/10 Gruppen | Exakte vorhandene Routen-/Clientrümpfe in VM mit injizierten synthetischen Abhängigkeiten; echte Mandats-/CSRF-Helfer |
| `node scripts/lokal.js scripts/contract-adapter-test.js` | 31/31 Assertions | Vorhandener Briefingadapter, Pflichtfelder, Quellen/Empfehlungsformen und Leerzustände |
| `node scripts/lokal.js scripts/radar-state-test.js` | 115/115 Assertions | Vorhandener Radarvertrag, Quellen, Personentrennung, Anzeigen/Leerzustände |
| `node scripts/lokal.js scripts/lage-cacheonly-test.js` | 9/9 Assertions | Vorhandener Lagepfad mit Cache-/Storage-/KI-Ersatz; keine tatsächliche KI bei `cacheOnly` |
| `node scripts/lokal.js scripts/buero-ehrlichkeit-test.js` | 27/27 Assertions | Vorhandene KI-aus-Funktion sowie vorhandener Client in VM; Herkunft und Fehlerzustände |

Das sind **10 neue Vertragsgruppen plus 182 bestehende Assertions**, keine
192 unabhängigen HTTP-End-to-End-Nachweise. Der neue Test prüft den unverändert
gelesenen Appstart-Rumpf, sein Lage-Fehlersignal, `cacheOnly`, Aktivitätserfassung,
fehlende Mandatsauswahl, manipulierte Mandatskennung, den tatsächlichen
Büro-POST/Antwortvertrag, Fehlerweitergabe und die tatsächliche CSRF-Funktion.
Statische Routenmerkmale (Methodenprüfung, Drosselung und Wahl des Erzeugers)
sind als Code-/Strukturbeleg abgegrenzt. Kein HTTP-Server, Modell oder
Datenbankdienst wurde dafür gestartet. Die echte HTTP-Berechtigungsprüfung
der Verwaltungsleserouten gehört zum getrennten Sprint A.

Vollständige Ausgaben, Exitcodes, Log-Prüfsummen und Hashes von 18 geschützten
Dateien stehen im [JSON-Beleg](sprint-b-pruefbeleg-20261104.json). Alle fünf
Befehle endeten mit Exitcode 0. Keine vorhandene Test-/Fixturedatei verändert.

## Design, Überschneidungen und offene Punkte

Die ursprüngliche Claude-Verwaltung aus dem beigefügten ZIP ist die verbindliche
Designreferenz. Diese Schnittstellenprüfung verändert keine Oberfläche,
Schrift, Farbe, Navigation oder Architektur. Die zuvor neu hinzugefügte helle
Verwaltung wird hier **nicht** als freigegebene Ersatzvorlage behandelt.
Der visuelle Vergleich mit dem Original erfolgt getrennt im Hauptlauf.

Bei späteren gemeinsamen Änderungen zu koordinieren: `server.js`,
`lib/helmut/briefingContract.js`, `radarState.js`, `lage.js`, `ai.js`, `office.js`,
`storage.js`, `auth.js`, `accounts.js` sowie kundenseitig `client.js`,
`styles.css`, `index.html` und die CI. In diesem Sprint wurden sie nicht geändert.
Der separate UI-Branch und seine neueste Remote-Fassung wurden wegen des
ausdrücklichen Verbots externer Zugriffe in dieser Ausführung nicht erneut
abgerufen oder verändert; Prüfziel ist der vorhandene lokale Backendstand.

Offen bleiben echte Daten-/UI-Rundreise, tatsächliche Browser-/HTTP-Sitzungen
der vier Produktansichten, echte DB-/RLS-Wirkung, Quellenverfügbarkeit,
fachliche Qualitätsurteile und Mock500-/Production500-Abnahme. Aus diesen
Vertragsprüfungen folgt keine Freigabe für Erzeugung, Aktivierung oder Deployment.

Nächster sicherer Schritt: Ergebnisse mit Sprint A zusammenführen und die
vorhandenen Antwortverträge für die Originalverwaltung beibehalten. Etwaige
Abweichungen zuerst als kleine eigene Vertrags-/Integrationsaufgabe benennen,
kein Redesign und kein neues Backend daraus ableiten.
