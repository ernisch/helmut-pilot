# Helmut UI: isolierte Prüfung vom 04.11.2026

Die vorhandenen vier Fachansichten sind mit synthetischen Daten in Chromium
geprüft: **150 gezielte Prüfungen und 238 Browserprüfungen bestanden**.
Das ist eine Prüfung der implementierten Oberfläche, kein Backend-, Production-
oder 500er-Nachweis. Kein Push, Merge, Deployment oder GitHub-Job wurde gestartet.

## Abgleich mit PR #771

Rein lesend verglichen: [Draft-PR #771](https://github.com/ernisch/helmut-pilot/pull/771),
Branch `codex/ui-design-20261002`, Kopf
`eaf0d5d517d104beaeac53ebeecc6957d3dcadc1`.
Unser Arbeitsbereich bleibt `/workspace/helmut-ui` auf
`codex/helmut-ui-20261031`, Ausgangskopf dieser Arbeit `2d895cc3`.

PR #771 enthält bereits überlappende Meldungs-/Speicherfehlerkorrekturen,
synthetische Browserfälle, Fontlizenzen und eine ältere Gestaltung. Deshalb
kein Cherry-pick und keine zweite Umsetzung derselben Oberfläche. Die zum
bestehenden Design passenden Ehrlichkeitsfälle und synthetischen Grunddaten
wurden übernommen und angepasst; die drei OFL-Lizenzen wurden ergänzt.
Neue Vorlagen bleiben ausschließlich Testdaten. Die ältere PR-Gestaltung und
deren Screenshots wurden nicht mit unserem responsive Layout vermischt.

Der zusätzlich lesend festgestellte Main-Kopf `773f7aa5` enthält gegenüber
unserer Basis Änderungen an `server.js` und `scripts/p1-security-check.js`.
Diese Arbeit wurde weder integriert noch verändert. Backendverträge werden
nur vom Client genutzt; die JSON-ID-Bestätigung für Rückmeldungen entspricht
dem bestehenden Rückgabevertrag von `/api/interactions`.

## Fertig und korrigiert

- **Gemeinsame Oberfläche:** responsive Shell, Navigation, lokale Schriftarten,
  SVG-Symbole, Fokusdarstellung, Hellmodus und Quellenhinweise.
- **Briefing:** Hauptvorgang mit nächstem Schritt und Kontext; maximal drei
  Kontext-/Dringlichkeitschips. Die Aktualisieren-Schaltfläche ist jetzt auch
  in der Breite 44 px groß. Die Glocke übernimmt keine zu dicke alte Pfadkontur.
- **Lage:** Liste, Detail, Quellenverweise, Tastaturöffnung und Zurück.
- **Radar:** sichtbare quellengebundene Erwähnung; Wechsel zwischen Partei,
  Wahlkreis und Ausschüssen verändert den Inhalt. Artikelfilter reduzieren
  tatsächlich die Ergebnismenge; „Alle“ stellt beide Testartikel wieder her.
- **Büro:** Liste und Entwurf, Herkunft/Quellen und Zurück. Scheitern sowohl
  Clipboard API als auch Kopier-Fallback, erscheint keine Erfolgsmeldung mehr.
  Erfolgreiches Kopieren wird weiterhin bestätigt. Zurück-/Kopiersymbole sind
  lokale SVGs. Kleine Prioritäts- und Gruppenbeschriftungen wurden lesbarer.
- **Datumswahrheit:** ältere Bürostände werden nicht als heute erstellt
  bezeichnet. Angezeigt wird das Datum des zugrunde liegenden Briefings;
  ohne Datum ausdrücklich „Briefingdatum nicht belegt“. Der Cache besitzt
  keinen eigenständigen Erstellungszeitstempel, den die UI behaupten könnte.
- **Speichermeldungen:** HTTP-Erfolg ohne gespeicherte ID oder mit ungültigem
  JSON bestätigt keine Rückmeldung. Kein Umbau am Speicherdienst.
- **Veraltete Prüfungen:** Hauptvorgang-/Reihenfolge-Assertions passen zur neuen
  `ui-briefing-hero`-Struktur. Die bisherigen Schutzbehauptungen bleiben erhalten.

## Netzsperre und Vorschau

Aufruf aus dem UI-Worktree, ohne Installation oder Build:

```sh
node scripts/lokal.js -- python3 -I scripts/ui-preview-isolated.py
```

Voraussetzungen sind Linux mit erlaubtem `unshare --user --map-root-user --net`,
Node, Python 3 und ein bereits vorhandenes `/usr/bin/chromium`. Hier benötigt
`unshare` die genehmigte Ausführung außerhalb der engeren Befehlssandbox.
Ist die Isolation nicht möglich, bricht der Aufruf ab. Keinen Ersatzstart ohne
Netzsperre verwenden. Nur Browserprüfung:

```sh
node scripts/lokal.js -- python3 -I scripts/ui-preview-isolated.py --only ui-preview-browser-check.js
```

Der Launcher entfernt die geerbte Umgebung und startet die Prüfungen seriell
mit einem eigenen temporären HOME. Vor jedem App-Start muss der Kindprozess
seinen vom Elternprozess getrennten Netzwerk-Namensraum, ausschließlich `lo`,
fehlende IPv4-/nutzbare IPv6-Routen und fehlgeschlagene IPv4-/IPv6-Verbindungsproben
belegen. Die vom Kernel veröffentlichten IPv6-REJECT-Sentinels sind keine
nutzbaren Routen. Ein direkter Browserprüfungsaufruf ohne Nachweis scheitert
vor `spawn` von Chromium; dieser Fehlerfall ist ebenfalls geprüft.

Chromium wird über Pipes gesteuert. Es gibt keinen HTTP-/Entwicklungsserver
und keinen geöffneten Vorschauport. Requests an die virtuelle Adresse
`http://helmut-ui.test` werden vollständig im Speicher beantwortet. Die echte
`client.js`, HTML, CSS und Assets laufen mit einem Testbootstrap; ausschließlich
der automatische `loadBriefing()`-Backendbootstrap wird entfernt und durch
Fixtures ersetzt. Es läuft kein `server.js`, kein Motor und keine Datenbank.
Alle anderen Ursprünge werden zusätzlich vor Übertragung im Browser blockiert.
Auch Netzwerkzugriffe außerhalb dieser Browserinterzeption hätten keine Route.

**Ergebnis des finalen Laufs:** null externe Übertragungen, null gesendete und
empfangene Bytes/Pakete, vor und nach dem Lauf ausschließlich `lo`. Drei
absichtliche `fetch`-Versuche gegen
`https://example.invalid/network-negative-control` wurden blockiert. Das sind
blockierte Versuche, keine erfolgreichen externen Abrufe. Die vorab erlaubten
administrativen GitHub-GETs zum PR-Vergleich gehören nicht zur Testvorschau;
für die gesamte Sitzung wird daher kein pauschales „null HTTP-Anfragen“ behauptet.

Belege: [Netzsperre](ui/belege/20261104/NETWORK_PROOF.json),
[Browserergebnis mit SHA256 der geprüften Dateien](ui/belege/20261104/BROWSER_RESULT.json),
[sämtliche abgefangenen Browserrequests](ui/belege/20261104/BROWSER_REQUESTS.json),
[Startverweigerung ohne Nachweis](ui/belege/20261104/STARTUP_GUARD.json).
Der SHA256-Beleg des ausgelieferten Testclients unterscheidet ihn ausdrücklich
vom unveränderten vollständigen Backendbootstrap.

## Prüfungen und Screenshots

| Prüfung | Ergebnis |
| --- | --- |
| `helmut-tab-ui-test.js` | 57/57 |
| `radar-ui-test.js` | 32/32 |
| `buero-ehrlichkeit-test.js` | 27/27 |
| `ehrlichkeit-ui-test.js` (PR-771-Fälle) | 34/34 |
| `ui-preview-browser-check.js` | 238/238 |
| JavaScript-Syntax und `git diff --check` | bestanden |

Die Browserprüfung verwendet 1440×900, 390×844 und 360×780. Alle vier Ansichten
werden über die echte Navigation mit Maus beziehungsweise Touch geöffnet;
Lage-Details zusätzlich mit Enter. Geprüft sind horizontale Überläufe,
Filterinhalte, Bürodetails, Kopiererfolg/-fehler, lange Titel/Profilnamen,
Leer-/Fehler-/Altstände, fehlendes Bürodatum, Ladezustand und Hellmodus.
Die drei Designschriftfamilien laden nachweislich. Geprüfte mobile
Navigations-/Filter-/Kartenflächen sind mindestens 44×44 px groß. Smartphone-
Querformat 844×390 zeigt die bestehende Ausrichtungssperre. Keine unbehandelten
Browserausnahmen und keine fehlenden angeforderten statischen Dateien.

Die Clipboard API wird für erlaubten und verweigerten Zugriff simuliert;
es wird keine Systemzwischenablage der Cloudumgebung verändert.
Die Selektoren in `browser-smoke-test.js` sind aktualisiert; dieser bestehende
serverbasierte Playwright-Test wurde nicht ausgeführt. Seine spätere Ausführung
und die schnelle Kernschutzsuite `run-offline-tests.js --fast-core` bleiben
offen. Letztere umfasst unter anderem den lokalen Server-/Store-Test
`p1-security-check.js`; diese Backendprüfung wurde für die reine UI-Vorschau
nicht zusätzlich gestartet. Die obigen Zahlen beziehen sich ausschließlich
auf die tatsächlich gelaufenen gezielten Prüfungen.

62 Screenshots dokumentieren Ansichten, Details, Scrollenden, Langtexte,
Fehler, Hellmodus und Querformat. Auswahl:

| Ansicht | Desktop | Smartphone | Smartphone 360 px |
| --- | --- | --- | --- |
| Briefing | [Bild](ui/screenshots/20261104/desktop-helmut.png) | [Bild](ui/screenshots/20261104/mobile-helmut.png) | [Bild](ui/screenshots/20261104/mobile-360-helmut.png) |
| Lage | [Bild](ui/screenshots/20261104/desktop-briefing.png) | [Bild](ui/screenshots/20261104/mobile-briefing.png) | [Bild](ui/screenshots/20261104/mobile-360-briefing.png) |
| Radar | [Bild](ui/screenshots/20261104/desktop-radar.png) | [Bild](ui/screenshots/20261104/mobile-radar.png) | [Bild](ui/screenshots/20261104/mobile-360-radar.png) |
| Büro | [Bild](ui/screenshots/20261104/desktop-office.png) | [Bild](ui/screenshots/20261104/mobile-office.png) | [Bild](ui/screenshots/20261104/mobile-360-office.png) |

[Desktop-Bürodetail](ui/screenshots/20261104/desktop-office-detail.png),
[mobiles Bürodetail](ui/screenshots/20261104/mobile-office-detail.png),
[mobile Lage-Details](ui/screenshots/20261104/mobile-lage-detail.png),
[langer Radarinhalt am Scrollende](ui/screenshots/20261104/mobile-long-radar-bottom.png).
Die Namen `helmut`/`briefing` in Dateien sind die bestehenden internen IDs:
sichtbar Briefing beziehungsweise Lage. Keine Aussage pixelgenauer Gleichheit
mit den Prototypen oder eines vollständigen Accessibility-Audits.

## Schutz der parallelen Arbeit und offene Abnahme

- Keine Änderungen an `server.js`, `lib/`, `api/`, Datenbanken, Motor-Testdaten,
  Paketdateien, GitHub-Workflows oder Vercel-Einstellungen. Nur UI, UI-Prüfungen,
  Schriftlizenzen und UI-Dokumentation geändert. Der Original-Worktree behält
  seinen Kopf `6b4012cd` und unveränderten Index/Arbeitsdateien.
- Lokal kein laufender Motor-/Testprozess festgestellt. Die eigenen Prüfungen
  verwenden einen Chromium-Prozessbaum seriell, ohne Downloads, neue Pakete,
  Builds, Container oder gemeinsame Actions-Runner. Rund 30 GB waren frei;
  das Screenshotpaket benötigt weniger als 7 MB. Kein Testprozess bleibt aktiv.
- Keine zusätzlichen GitHub-Prüfungen: mögliche gemeinsame Kontingente werden
  nicht beansprucht. Vor späterer CI erneut Ref, Concurrency und laufende Jobs
  prüfen. Den aktuellen Production-/500er-Status nicht aus diesem Bericht ableiten.
- Die zuvor festgestellte Vercel-Automatik ist nicht sicher ausgeschlossen.
  Deshalb weiterhin **kein Push**, keine PR-Erstellung und kein Deployment;
  lokale Sicherung ausschließlich im eigenen UI-Branch.
- Offen bleiben die normale Backend-/Authentifizierungsintegration, reale
  Serverauslieferung mit MIME/CSP und Clipboard-Berechtigungen, vollständige
  Standard-CI sowie Safari/WebKit und Firefox. Ebenso außerhalb dieses
  Vier-Ansichten-Auftrags: komplette Profil-/Rollen-/Onboarding-Browserabnahme,
  persistierte Auswahl nach echtem Neustart und 200-%-Zoom. Diese Punkte sind
  nicht durch die synthetische Vorschau bewiesen.

Laufprotokolle und Prüfsummen liegen unter
[`docs/ui/belege/20261104/`](ui/belege/20261104/).
Wiederholung erzeugt frische Belege zunächst ignoriert in
`tmp/ui-preview-artifacts/`; die datierten Belege werden nicht automatisch
überschrieben. Kein Merge oder Production-Rollout ist hiermit freigegeben.
