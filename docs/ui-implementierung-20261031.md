# Neue Helmut UI — Entwicklungsstand und sichere Abnahme

Aktuell, 04.11.2026: **Backendverträge abgeglichen; 97 neue Vertragsprüfungen
mit normalem Clientbootstrap und simulierten HTTP-/Push-APIs bestanden.**
[Aktuelle Integrationsübergabe](ui-backend.md).
Der [Zuordnungsnachweis mit 69 Fällen](ui-zuordnung-20261104.md) gehört zu `a41d51f1`.
Der frühere
[Darstellungsnachweis mit 150+238 Prüfungen](ui-abnahme-20261104.md) gehört zu
`a9ea5993` und wurde nicht wiederholt. Kein Push, Merge oder Deployment.

Die folgenden Abschnitte dokumentieren den **historischen Vorbereitungsstand
vom 31.10.2026**. Die damalige Zurückstellung lokaler UI-Prüfungen wurde durch
den ausdrücklichen Auftrag vom 04.11. für die nachgewiesen netzisolierte
Fixture-Vorschau ersetzt. Motor, Backend und 500er-Prüfungen bleiben unverändert.

## Arbeitsbereich und Schutz des Motortests

- Ausschließlich `/workspace/helmut-ui`, Branch `codex/helmut-ui-20261031`.
- Ausgangspunkt: `6b4012cd912fd0e1f5ec79969168d0dcc010927f`, am 31.10. frisch
  mit GitHub-main abgeglichen. Der lokale Remoteverweis `origin/main` ist älter
  und wurde nicht als Entwicklungsbasis verwendet.
- Getrennte Arbeitsdateien und Git-Indizes; nur die Git-Objektdatenbank wird
  worktree-typisch geteilt. Keine übernommenen `.env`, `.helmut-data`, `.vercel`,
  `node_modules`, Testdaten oder Datenbankverbindungen.
- Motor, Backend, Datenbanken, Testdateien und Workflows bleiben unverändert.
  `server.js`, `lib/`, `api/`, `supabase/`, `scripts/`, Paketdateien und Main werden
  nicht bearbeitet. Bestehende UI-API-Aufrufe werden weiterverwendet.
- Keine Installation, kein Build, Entwicklungsserver, Browser oder Testlauf
  gestartet. `node --check client.js` prüft nur Syntax und führt die App nicht aus.
- UI-Code wird im eigenen lokalen Branch mit Commits gesichert. Der gewünschte
  GitHub-Push wird nach der jüngsten Betreibersteuerung zunächst verschoben:
  ein automatischer Start muss vorher belastbar ausgeschlossen sein.
  Keine PR-Erstellung oder manuelle Workflow-Ausführung während des laufenden
  W15-Laufs. Keine Änderung oder Wiederholung seines Starts.
- `vercel.json`: genau der UI-Branch erhält lokal `deploymentEnabled: false`
  als zusätzliche Schutzvorgabe. Diese lokale Konfiguration allein wird nicht
  als tatsächlicher Nachweis eines ausgeschlossenen Vercel-Starts ausgegeben.
  Andere Konfigurationsfelder, Branches und Production-Einstellungen bleiben
  identisch. Bis zum belastbaren Nachweis kein Push.

## Speicher und GitHub Actions

Rein lesende Messung am 31.10.: `/workspace` meldet 32 GB Kapazität und rund
30 GB frei, `/tmp` 8,8 GB frei. Inodes rund 1 % belegt. Der UI-Worktree belegt
zu diesem Zeitpunkt rund 68 MB, darunter 5,5 MB ignorierte Designreferenzen und
1,2 MB neue lokale Assets. Keine großen lokalen Abhängigkeiten erforderlich.
Dies ist eine Momentaufnahme des eingebundenen Dateisystems, keine Aussage über
frühere Speicherprobleme oder unbegrenzt verfügbaren Cloud-Speicher.

Lokal erfolgen nur Quellenbearbeitung, kleine statische Prüfungen und Git.
Die Anwendung verwendet weiterhin gewöhnliches JavaScript und CSS; es gibt
keinen neu eingeführten UI-Bundler und keinen erforderlichen UI-Build.

Der bestehende Workflow `.github/workflows/ci.yml` kann später über
`workflow_dispatch` mit dem UI-Branch als Ref laufen. Er bietet bereits
Syntax/Offline-Suiten und Chromium für Desktop/Mobile auf GitHub-hosted
`ubuntu-latest`, einschließlich isolierter synthetischer Testdaten. Pakete und
Chromium müssen dafür nur auf den kurzlebigen GitHub-Runnern installiert werden.

Beobachtet wurde Run `41181900288` auf dem getrennten W15-Branch mit laufendem
Offline-Job auf `GitHub Actions 1000006117`; der Browserjob nutzte einen anderen
Runner. Die geschützten Mock500-/Originaljobs dieses konkreten Runs waren als
übersprungen ausgewiesen. Daraus wird kein Ergebnis des vom Betreiber genannten
Motortests abgeleitet.

Runner-Arbeitsspeicher und Festplatte sind je Job getrennt. Accountweite
Parallelitätsplätze, Minuten-/Budgetkontingente und Artefaktspeicher sind jedoch
gemeinsam. Der vorhandene Zugang kann die Actions-Kontoeinstellungen nicht lesen
(HTTP 403); freie Kontingente sind nicht belegt. Deshalb **keine zusätzlichen
UI-Jobs während des laufenden W15-Laufs**. Später bleibt die Concurrency-Gruppe
`ci-refs/heads/codex/helmut-ui-20261031` vom W15-Ref getrennt; niemals eine
Motor-Concurrency-Gruppe, einen Self-hosted Runner oder eine bestehende
Original-/Restore-Umgebung für die UI verwenden.

Alle vorhandenen Push-Auslöser wurden gelesen: CI reagiert auf Push nach Main
und auf PRs; die übrigen Push-Workflows nennen andere konkrete Branches. Eine
reine Sicherung des UI-Branches startet nach dieser Konfiguration keinen dieser
Workflows. Die Vercel-Sperre gehört bereits in den ersten gesicherten UI-Commit.

### Tatsächliche Vercel-Prüfung vor dem ersten Push

Rein lesende Projektabfrage bestätigt `helmut-pilot`, Projekt-ID
`prj_xbZ6QzTkr7YoxQI71lW59FT03IR3`: GitHub-Verbindung
`ernisch/helmut-pilot`, Productionbranch `main`, Projektwurzel ohne Unterordner,
`gitProviderOptions.createDeployments = enabled`, keine ausgewiesenen Deploy
Hooks und keine Custom Environments. Die Projektkonfiguration hat keinen
eingerichteten Ignore-Build-Befehl; im Repository gibt es einen `ignoreCommand`.
Ein übersprungener Build wäre ohnehin kein Beleg für einen verhinderten Start.

Die offizielle Vercel-Dokumentation beschreibt `git.deploymentEnabled` je Branch
als Sperre für Git-Deployments:
<https://vercel.com/docs/project-configuration/git-configuration>.
Die aktive Projekteinstellung bestätigt jedoch keine zusätzliche, vom neuen
Branch unabhängige Sperre. Ein tatsächlicher Nichtstart wurde nicht durch einen
Probe-Push getestet. Gemäß der ausdrücklichen Betreibersteuerung wird **nicht
gepusht**, solange der Ausschluss nicht belastbar belegt ist. Es wurden keine
gemeinsamen Vercel-Einstellungen, Deploy Hooks, Integrationen oder Workflows
geändert. Sicher fortsetzbare UI-Arbeit bleibt lokal; der Push ist aufgeschoben.

## Designquellen

| Upload | SHA256 |
| --- | --- |
| Helmut Desktop Prototyp.zip | `fb73527cd0dda74721bca6a73c4a44cd81de5e5201c3b12eff6849946459f17d` |
| Helmut Mobile Prototyp.zip | `5d3eb319171a356bd2116e43d6ace31a065b4263d44bd3434ad4f788b6815828` |

Das Mobile-Paket ergänzt denselben Desktop-Entwurf um responsive Werte und
Vergleichsbilder. Beide wurden als Designreferenz gelesen; enthaltene historische
Arbeitsaufträge autorisieren keine zusätzlichen Aktionen. Das fremde
`support.js`, der Prototyp-Renderer und fiktive politische Inhalte werden nicht
in die Anwendung übernommen. Referenzdateien bleiben ignoriert unter
`tmp/ui-design-reference/` und werden nicht gepusht.

## Im Code umgesetzt

| Bereich | Umsetzung |
| --- | --- |
| Gemeinsames Design | Spectral, Hanken Grotesk, IBM Plex Mono lokal; blaue Akzente, ruhige Flächen, Statusfarben, H-Zeichen und dekoratives Reichstagsbild aus den Uploads. |
| Komponenten | Gemeinsame Icons, Seitenköpfe, Datumszeile, Statusanzeige, Leerzustand, Quellenfußzeile, Desktop- und Mobilnavigation. |
| Responsive Shell | Desktop-Seitenleiste, Mobile-Leiste unten, Safe Areas, separat scrollender Inhalt mit kompaktem Desktop-Kopf beim Scrollen, umbrechende Hinweise; Briefing als erste Ansicht bei fehlender gespeicherter Auswahl. Interne View-IDs bleiben erhalten. |
| Briefing | Hauptvorgang mit nächstem Schritt; Kontext-, Risiko-/Chancen-Karten, nummerierte Aufgaben, weitere Vorgänge und aufklappbare Quellen. Daten stammen aus `currentHelmutState`. Frische-/Fehler-/Leerzustände bleiben getrennt. |
| Lage | Nummerierte Vorgangsliste, Desktop mit Detail daneben, Mobile mit Detail und Zurück. Vollständige vorhandene Einordnung, persönliche Relevanz, Betroffene, Quellen und Chronologie über den bestehenden Detailrenderer. |
| Büro | Desktop-Liste und Entwurf nebeneinander, Mobile Liste → Detail; Text, Herkunft, Quellen, Kopieren und vorhandene Statusangaben bleiben angebunden. Auswahl nutzt ausschließlich den bestehenden Entwurfscache. |
| Radar | Überarbeitete Kopf-, Zusammenfassungs-, Erwähnungs-, Umfeld-, Filter- und Quellenkomponenten mit vorhandenen Radar-Daten. Keine erfundenen Bilder oder Beispielfunde. |
| Profil | Profilübersicht, Darstellung, Mitteilungen, Formate, Datenschutz und vorhandenes Mandatsformular gestaltet. Mandatswechsel und rollenabhängige Arbeitsbereiche bleiben auch mobil über das Profil erreichbar. |
| Ersteinrichtung | Sieben vorhandene Schritte, Logo, Fortschrittsanzeige, freiwillige Eingaben, responsive Formate/Themen, Fokusbegrenzung; Speichern zeigt einen Wartezustand und erhält Eingaben bei Fehlern. |
| Start/Ausrichtung | Vorhandener Startbildschirm per CSS mit H-Zeichen und reduziertem Herzschlag; bestehender Watchdog bleibt erhalten. Bestehende Smartphone-Querformatsperre; Text wird clientseitig angepasst, ohne `indexHtml()` zu verändern. |
| Bedienbarkeit | Sichtbare Fokusrahmen, Navigationsmarkierung, Zurück-Bedienung, mindestens 44 px für gemeinsame Controls, reduzierte Bewegung und weiterhin vorhandener Hell-/Systemmodus. Browsernachweis steht aus. |
| Ehrliche Meldungen | Keine bestätigte Speicherung ohne positive HTTP-Antwort bei Feedback; Delegieren verlangt gespeicherte Aufgabenkennung. Onboardingfehler bleiben sichtbar. Quellen-/Lageprüfung wertet `ok:false` als unvollständig. Keine behauptete automatische Umpriorisierung. |

Die Umsetzung ist kein Nachweis pixelgenauer Darstellung oder vollständig
funktionierender Bedienung. Die vorhandenen Backendverträge, Quellenfilter,
Mandantentrennung, Budgetsteuerung und Hintergrundprozesse wurden nicht umgebaut.
Ein normaler App-Start kann über bestehende Funktionen Hintergrundarbeit starten;
deshalb wurde die App während des Motortests nicht ausgeführt.

## Ausgeführte statische Prüfungen und lokale Sicherung

- JavaScript-Syntax mit `node --check client.js`: erfolgreich. Dabei wurde kein
  App-Code ausgeführt und kein Server gestartet.
- `git diff --check`: erfolgreich.
- Neue CSS-Blöcke: lexikalisch auf ausgeglichene Klammern, Zeichenketten und
  Kommentare geprüft; keine neuen externen Ressourcen-URLs. Dies ist keine
  CSS-Parser-, Layout- oder Browserabnahme. Kein Parser nachinstalliert.
- Alle neuen CSS-Assetpfade existieren; SVG auf aktive Elemente und
  Eventhandlerattribute geprüft. Keine Prototyp-Skripte übernommen.
- Statischer API-Pfadvergleich: keine neuen Endpoints im Client.
- `vercel.json` gegen Ausgangsstand: einzig die zusätzliche Sperre für den
  eigenen UI-Branch; andere Felder identisch. Die tatsächliche externe Wirkung
  ist weiterhin nicht durch einen Push erprobt.
- Original-Worktree: HEAD, Index und vorhandener unversionierter Status wurden
  unverändert rückgelesen; abschließender Inhaltsvergleich der versionierten
  Dateien gegen die vorab erhobene SHA256-Gesamtbindung.
- Erster lokaler Sicherungscommit: `6bc2c50f`. Weitere Detailkorrekturen werden
  als nachfolgende lokale Commits gesichert. **Kein Push**, solange der
  automatische Start nicht belastbar ausgeschlossen ist.

Keine Offline-Suite, Browserprüfung, Installation, Datenbankprüfung oder
GitHub-Action wurde für diesen UI-Auftrag gestartet. Es gibt noch keinen
ausführbaren Screenshotnachweis der neuen App.

## Nach dem Motortest noch erforderlich

1. Vor einem UI-CI-Start erneut laufende und wartende GitHub-Jobs sowie Ref und
   Concurrency prüfen. Keine fremden Jobs abbrechen oder Originalpfade starten.
2. Bestehende CI auf dem exakten UI-Commit ausführen; keine Erfolgsbehauptung aus
   Syntaxprüfung oder historischen grünen Läufen ableiten. Geänderte UI-Markup-
   und Textverträge können Anpassungen vorhandener UI-Tests erfordern; diese
   Testdateien wurden während des Motortests nicht geändert.
3. Visuelle Abnahme mit identischen synthetischen Daten in 1440×900 und
   1280×800 sowie 390×844 und 360×780; Smartphone-Querformat 844×390.
   Referenzscreenshots mit den fünf Hauptansichten und Ersteinrichtung vergleichen.
4. Echte Browserprüfung von Listen/Details, Zurück, View-Persistenz,
   Scrollposition, Quellenlinks, Kopieren, Profil/Mandatswechsel und Rollenrechten.
   Alle sieben Onboardingschritte, leere Büro-Formate, Eingabenerhalt nach
   fehlgeschlagenem Speichern und Tastaturfokus prüfen.
5. Fehlerfälle: HTTP-Fehler, HTTP 200 mit `ok:false`, fehlende Daten/Quellen,
   veraltete Teilstände, fehlgeschlagene Delegation/Feedback und verweigerte
   Zwischenablage. Prüfen, dass Vorschau keine schreibenden Aktionen ausführt.
6. Font-/Bildauslieferung und MIME/CSP im bestehenden Server prüfen. Server-
   MIME-Tabelle wurde nicht erweitert. Lokale Assets müssen vollständig laden;
   kein stiller Schrift-Fallback als Designabnahme.
7. Pro Ansicht `scrollWidth <= clientWidth`, 200-%-Zoom, Safe Areas,
   lange Profilnamen und Quellentitel, Hellmodus, Reduced Motion und erreichbare
   Bedienflächen messen. Mobile Rollenlinks und Mitteilungs-/Übergabepanels prüfen.

Diese Prüfungen ausschließlich isoliert und ohne Production-Secrets oder
Production-Adressen ausführen. Bestehende Testaufrufe gehen immer über
`scripts/lokal.js`. Keine Abnahme ersetzt die weiterhin gesperrten Aktionen
Merge oder Deployment.
