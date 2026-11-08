# Mobile Lesbarkeit: Briefing, Lage und Radar

Stand: 08.11.2026. **Für Review vorbereitet; gezielte Prüfungen bestanden. Keine produktive Wirkung.**
Branch `codex/mobile-briefing-lage-radar-20261108`, Basis frisch bestätigt `b4863123741f303b580569c80165233fd4696d1f`.
Breiter Ausgangsnachweis auf `f14ca35d` mit Runtime `2445eaad`; danach ausschließlich die folgenden zwei Nutzerpunkte bearbeitet. Pflicht-CI wird am tatsächlichen PR-Kopf geprüft; lokale Belege ersetzen sie nicht. ChatGPT koordiniert die fachliche Abnahme. Kein Merge, kein Production-Deployment.

## Nacharbeit zur abschließenden Abnahme: ausschließlich zwei Punkte

Runtime und gezielte Prüfungen: `8c6e2ffe91400ae567746bb67fe9577c03c5d999`. Nur diese Nacharbeit ist der neue technische Endstand; die übrigen Nachweise bleiben als frühere, unveränderte Belege gekennzeichnet.

1. **Vorhandener Tagesgrund:** `whyItMatters` erscheint unabhängig von `recommendation`. Ohne Empfehlung heißt er „Warum heute relevant:“; es erscheinen keine erfundene Handlungs-/Büro-CTA und kein Empfehlungslabel. Mit tatsächlicher Empfehlung bleibt „Begründung:“ direkt daneben. Die bestehenden Tests nutzen beide echten Adapter (`buildCurrentHelmutState`, `toBriefingContractV3`) mit vorhandenem Tagesanlass und leeren Empfehlungsfeldern. Leerer Grund erzeugt keinen Platzhalter.
2. **Radar ohne manuellen Aktualisierungsschritt:** Knopf, Symbol, Bedienhinweis, Clicklistener und ausschließlich manuell verwendeter Refreshwrapper entfernt. Gemeinsamer `loadBriefing` samt Option bleibt erhalten; Boot, bestehender `visibilitychange`-Handler, Drosselung und Hintergrundaktualisierung unverändert. Quellenstand, Abdeckungseinschränkung, Stale-/Fehleranzeige bleiben erhalten. Keine neuen Intervalle, Recherchewege oder Modellaufrufe.

Nachweise: [bestehende UI-Tests120/120 und48/48](followup/UI_TEST_RECEIPT.json), [echter Loader10/10](followup/background-refresh.log), [gezielter Chromiumlauf185/185](followup/BROWSER_RESULT.json), [Anfragen](followup/BROWSER_REQUESTS.json), [Netzwerkisolation](followup/NETWORK_PROOF.json). Browser:360/390/1440px, beide Themes, vorhandener Grund ohne Empfehlung, tatsächliche Empfehlung, leerer Grund sowie gefüllter/leerer/unbestätigter/veralteter/gestörter Radar. Keine Überläufe, keine uncaught Browserfehler, keine extern erfüllten Anfragen. Die echten automatischen Foreground-Events erzeugten pro Viewport genau zwei GET-Startlesevorgänge (Erfolg und503); äußere Büro-/Parlamentsvorbereitung im Harness ersetzt. Beim503 bleibt der vorherige Inhalt samt Quellen-/Erstellungsangabe unverändert, ohne Erfolgsbehauptung. Der bestehende automatische Handler protokolliert diesen Transportfehler; keine neue dauerhafte Radar-Fehleranzeige erfunden.

Der [erste Browserversuch](followup/browser-first-failure.log) erwartete irrtümlich die entfernte manuelle Fehlermeldung. Der aktuelle gemeinsame Cacheleser liefert tatsächlich `null`; beim automatischen503 protokolliert der vorhandene Handler den Fehler. Nur diese Harness-Erwartung wurde an den tatsächlichen Pfad angepasst; kein Produktfix, kein PASS für den Fehlversuch. Bereits erfolgreiche, unveränderte Lage-/Titel-/Quellen-/Navigations-/Mandatsnachweise unten werden wiederverwendet. Der185er Nachlauf ersetzt keine dieser früheren Abnahmen. Die Pflicht-CI muss auf dem neuen Endkopf in PR1108 bestehen; vorherige CI42482720283 auf `f14ca35d`: SUCCESS,189/189Standard,342/342Bereich,Z2248/48.

| Aktuelle Ansicht |360 dunkel|360 hell|390 dunkel|390 hell|Desktop dunkel|
|---|---|---|---|---|---|
| Tagesgrund ohne Empfehlung |[Bild](followup/mobile-360-dark-reason-without-recommendation.png)|[Bild](followup/mobile-360-light-reason-without-recommendation.png)|[Bild](followup/mobile-dark-reason-without-recommendation.png)|[Bild](followup/mobile-light-reason-without-recommendation.png)|[Bild](followup/desktop-dark-reason-without-recommendation.png)|
| Radar ohne Aktualisierungsknopf |[Bild](followup/mobile-360-dark-filled-radar.png)|[Bild](followup/mobile-360-light-filled-radar.png)|[Bild](followup/mobile-dark-filled-radar.png)|[Bild](followup/mobile-light-filled-radar.png)|[Bild](followup/desktop-dark-filled-radar.png)|

Aktuelle Radarzustände, jeweils[dunkel/hell]: leer [Bild](followup/mobile-dark-empty-radar.png)/[Bild](followup/mobile-light-empty-radar.png), unbestätigt [Bild](followup/mobile-dark-unconfirmed-radar.png)/[Bild](followup/mobile-light-unconfirmed-radar.png), veraltet [Bild](followup/mobile-dark-stale-radar.png)/[Bild](followup/mobile-light-stale-radar.png), leer/veraltet [Bild](followup/mobile-dark-stale-empty-radar.png)/[Bild](followup/mobile-light-stale-empty-radar.png), technischer Fehler [Bild](followup/mobile-dark-error-radar.png)/[Bild](followup/mobile-light-error-radar.png).

## Zuständigkeiten und Grenzen

Leitung: `client.js`, Integration und Browsernachweise. Layoutagent: ausschließlich `styles.css`. Prüfagent: unabhängige Daten-/Ursachenanalyse, ausschließlich die bestehenden Helmut-/Radar-UI-Testdateien, anschließend lesender Gesamtreview. Beide Helfer technisch mit GPT 6.1 Sol / Hoch gestartet; keine DeepSeek-Nutzung, keine zusätzlichen Modell-API-Aufrufe. Die Modellkonfiguration der führenden Sitzung wird nicht durch Repositorycode umgestellt.

Marineblau, vorhandene lokale Schriften, hellblaue Akzente und Reichstagsmotiv bleiben erhalten. Keine Büroansicht, Backend-/Quellenpipeline, produktiven Daten, Budgets oder Zeitpläne geändert. Der bestehende Startleser erhält nur für Radar-Neuladen eine Option, die zusätzliche Bürovorbereitung und Parlamentsnachladen unterdrückt; die übrigen Aufrufer behalten ihr Verhalten.

PR1104 und PR1106 bleiben getrennt. Keine ihrer Änderungen integriert, verändert oder nachgebaut. Der ältere UI-PR771 wurde auf Überschneidungen gelesen; die aktuelle Oberfläche auf main bleibt die Basis. Lokales fremdes `supabase/.temp/` unverändert. Beim frischen Vor-Push-Abgleich läuft eine unabhängige CI von PR1106; sie wird hier nicht beeinflusst oder als eigener Nachweis verwendet.

## Ergebnis je Punkt

| Punkt | Tatsächliches Ergebnis | Commit / Prüfbeleg |
| --- | --- | --- |
| 1 Mobile Detailansicht | Allgemeiner Lagekopf mobil verborgen, Motiv kompakter. Zurück → Titel → Zusammenfassung → vorhandener persönlicher Bezug → Originalquellen → zusätzliche Einordnung. Vollständige Inhalte erreichbar. Browser-Zurück/-Vorwärts und nicht-null Listenposition erhalten. | `4fea764a`, Layout `e6b1f49b`; Browserbericht |
| 2 Briefing | Ruhelage einmal erklärt; Kopf nur „Aktuell“. Keine Entwarnung oder Priorität erfunden. Vorhandene Einschränkung aufklappbar, Quellen-/Frischewarnungen bleiben sichtbar. Lage-Themenzahl/Verweis erhalten. Tatsächliche Empfehlung zeigt vorhandenes `whyItMatters` direkt daneben. | `77e75335`, `3104f5ac`; 112 UI-Assertions |
| 3 Lageübersicht | Kompakter mobiler Kopf; vorhandenes `relevanz.satz` direkt am Eintrag. Sachkategorie erzeugt keinen persönlichen Bezug. | `cd742389`, `e6b1f49b`; Bund-/Berlin-/Brandenburg-Gegenproben |
| 4 Titel | Exakter Abbruch reproduziert und Ursache belegt: 74 Zeichen langer vorhandener `title`, leeres `displayTitle`, Legacybudget72 entfernt das letzte Wort. Aktive Liste nutzt den vollständigen gelieferten Titel. | `8497f630`; [öffentliche Titelfelder](title-evidence.json), echter Legacyhelper im UI-Test |
| 5 Radar | Geladene Daten ohne zugeordnete Signale, unbestätigte Grundlage, veralteter Stand und technischer Fehler getrennt. Leere Teilabschnitte behaupten keine heutige Vollprüfung. Globale Leiste verwendet Radarzustand. Manueller Aktualisierungsknopf in der beauftragten Nacharbeit entfernt; vorhandene automatische Ladewege bleiben erhalten (siehe oben). | `f8c1e855`, `902394ba`, `2445eaad`; Radar53/53, Loader10/10, echte Browser-GET-Probe |
| 6 Quellen/Einordnung | Originalquelle direkt im Briefing und früh im Lagedetail. Vorhandene Quellentitel und Radar-Zuordnungsbelege sichtbar. Bereits geladene, vorgangsgebundene Lageabsätze mit ihren Quellen als zusätzliche KI-Einordnung erreichbar. Fehlende Aussage-/Originalauszugszuordnung ausdrücklich benannt. | `c0a847a3`; Quelle vor Einordnung und echte Taps geprüft |
| 7 Verständlichkeit | Berliner Zeit im Kopf und an der Uhr kenntlich. „Neu“ als gespeicherter Vorgangsstatus mit unbekanntem Gültigkeitsbeginn erklärt. Keine Umdeutung zu Quellenfrische/letztem Besuch. Sie-Ansprache für UI und bekannte persönliche Einordnung; Originaltitel bleiben unverändert. ISO-Quellenwerte ohne Präzisionsbeleg nur als Kalendertag. | `e3b526be`, `cbf41ac2`, `902394ba`, `a5167545`, `111408f1` |
| 8 Mandatsebenen | Bestehende Profilfelder zeigen Bundestag, Abgeordnetenhaus Berlin oder Landtag Brandenburg; Fachzuständigkeit, Schwerpunkte, Ausschussmitgliedschaft, Stellvertretung und Wahlkreis getrennt. Fehlendes offen als „Nicht hinterlegt“. | `d073744a`; vorhandene lokale Szenarien aus `scripts/lage-profilbezug-test.js` im Browser wiederverwendet, keine Kohortenverarbeitung |

## Gezielte Nachweise

Alle Tests über `scripts/lokal.js`. Browser im bestehenden `ui-preview-isolated.py`/Chromium-Prüfweg, Netzwerkraum vor Appstart geprüft, sämtliche App-HTTP-Antworten synthetisch im Speicher. Kein Modell, keine echte Datenbank oder Recherche. Keine Installation eines neuen Testsystems.

| Prüfung | Ergebnis |
| --- | --- |
| [Helmut/Lage-UI](helmut.log) | **112/112 PASS**, einschließlich exaktem Titelabriss, vollständigem Titel, Quellenpräzision, persönlichem Bezug und Fehlzuständen |
| [Radar-UI](radar.log) | **53/53 PASS**, einschließlich Topbar, Zuständen, Sie-Ansprache und Reload-Grenze |
| [Hintergrundleser](background-refresh.log) | **10/10 PASS**, echter `loadBriefing` mit ausschließlich ersetzten äußeren Grenzen; readOnly unterdrückt zusätzliche Vorbereitungen |
| [Lage-Sichtbarkeit](visible.log) | **6/6 PASS** |
| [UI-Ehrlichkeit](ehrlichkeit.log) | **34/34 PASS** |
| [Breiter Ausgangsnachweis Chromium](after/BROWSER_RESULT.json) | **566/566 PASS**, 1440×900, 390×844, 360×780, beide Themes; gefüllt, leer, unbestätigt, veraltet, gestört, lange Titel, Quellen-Taps, echte Historie/Listenposition und Mandatskontexte |
| [Vorher Chromium](before/BROWSER_RESULT.json) | **271/271 PASS** auf exakt `b4863123`; beide Themes, tatsächlich geöffnete Details |
| [Netzwerkprotokoll vor Nacharbeit](after/BROWSER_REQUESTS.json) | Keine extern erfüllte Anfrage. Echte Radar-Neuladeklicks erzeugen pro Viewport genau zwei GETs auf `/api/app/start`: Erfolg und simuliertes503, keine weiteren API-Aufrufe. Quellen-Taps im synthetischen Browser verhindern die externe Navigation. |
| [Bestehender CI-Browser-Smoke lokal](browser-smoke.log) | **114 PASS / 0 FAIL**, echte lokale HTTP-Shell, Desktop/Mobil, vorhandener Playwright mit bereits installiertem Chromium; nur Browserpfad im Startaufruf auf `/usr/bin/chromium` gesetzt |
| [Reitertexte](tab-rename.log), [Quellenleerfälle](source-cases.log), [persönliche Bezugserklärung](matching.log) | **20/20, 28/28, 69/69 PASS**; ausschließlich UI-Erwartungen an Sie-Ansprache und belegte Abschnittsgrenzen angepasst, Server-/Eingabefälle unverändert |
| [Briefing-Frische](briefing-frische-e2e-test.log), [Lage-Liveflow](lage-frische-live-flow-test.log), [Leerzustände](scoring-ui-test.log), [Quellenvertrag](parlamentsdaten-quellen-test.log) | **68/68, 26/26, 15/15, 23/23 PASS** nach gezielter Korrektur der vier Bereichsbefunde |
| Syntax / `git diff --check` | bestanden |

Der erste erweiterte Browserlauf stoppte an einem Vergleich mit abschließendem Fixture-Leerraum; der zweite an einer erneut deklarierten Prüfvariable. Beide Ursachen lagen im ergänzten Harness, wurden dort korrigiert; kein PASS für diese Fehlversuche. Der ursprüngliche Browsernachweis hatte eine versteckte Detailquelle als unzureichenden Sichtbarkeitsbeleg akzeptiert. Der Nachweis verlangt jetzt tatsächliches Öffnen durch Tap und sichtbare Detailansicht.

Der bestehende Hintergrundlesertest scheiterte zuerst5/8. Dieselben drei Fehler sind gegen unverändertes main reproduziert ([Altbeleg](background-refresh-main-before-fixture-fix.log)): sein `applyStartPayload`-Stub etablierte kein gültiges privates Profil. Die bestehende Testfixture setzt jetzt diese Voraussetzung korrekt; Produktlogik wurde dafür nicht angepasst. Zwei zusätzliche Prüfungen sichern den neu begrenzten Radar-Lesepfad.

Die letzte sichtbare Doppelung der Ruhelage wurde anschließend entfernt (`3104f5ac`): Die fehlende Tagespriorität steht nur noch in der Überschrift; der Erklärungssatz lautet „Das ist keine Entwarnung.“ Einschränkung, Themenzahl und Lageweg bleiben erhalten.112/112 und der vorhandene542er Browsernachweis am aktualisierten Stand bestanden.

Der erste tatsächliche PR-CI-Browserjob [42478378153](https://github.com/ernisch/helmut-pilot/actions/runs/42478378153/job/128724701191) scheiterte an der noch unveränderten Smoke-Erwartung `.hstand-why` ([Erstfehler](ci-browser-first-failure.txt)). Der bestehende Test prüft jetzt den beauftragten sichtbaren Begründungsort `.ui-recommendation-why` und die Radar-Sie-Ansprache; alle bisherigen fachlichen Kontrollen bleiben erhalten, Sichtbarkeit wurde zusätzlich abgesichert. Lokaler echter Smoke danach114/0; Der damalige Runtime-Stand blieb bei diesem Testfix unverändert. Der fehlerhafte erste CI-Kopf wird nicht als grün umgedeutet. Ein gezielter Abgleich weiterer bestehender Clienttests fand dieselben alten Du-/Abschnittstexterwartungen in Reiter-, Quellenleerfall- und Bezugserklärungstests. Diese UI-Erwartungen sind angepasst und lokal20/20,28/28,69/69 bestanden. Keine Testauswahl oder fachliche Kontrolle entfällt. Die neue CI muss am neuen PR-Kopf bestehen.

Nachfolgend wurden noch vom Server gelieferte Leerhinweise mit bestehenden Du-Formen gefunden (`scoring.js` liefert etwa „für dein Mandat“). Ausschließlich ihre Anzeige in den drei beauftragten Ansichten wird formalisiert (`111408f1`); Originaltitel bleiben unverändert. Gezielte UI-Prüfung112/112+53/53 und vollständiger vorhandener542er Bild-/Navigationsnachweis danach am aktualisierten Runtime-Endstand bestanden.

Der unabhängige lesende Gesamtreview meldete drei P2-Anzeigeprobleme (globale Radarfrische, Sie-Formen, erfundene Uhrzeit aus ISO-Datum). Alle drei im Endstand lesend bestätigt behoben. Keine P1-/Sicherheitsblocker festgestellt; keine pauschale unabhängige Production-Abnahme behauptet.

Der Kopf `470b4923` hatte einen tatsächlich erfolgreichen GitHub-Browserjob128727256723, aber [Gesamt-CI42479191096](https://github.com/ernisch/helmut-pilot/actions/runs/42479191096) **FAILURE**: [Erstfehler](ci-tool-first-failure.txt) beim unveränderten PostgREST12.2.3-Download (90s/0Bytes), vor Offline-/Datenbankabnahme. Quittungs-/Artefaktfehler sind Folgefehler. Begrenzter Verfügbarkeitscheck danach erfolgreich; identischer Archivhash `9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c`. Ein weiterer regulärer Endkopfversuch ist dadurch begründet; keine neue Downloadroute, keine gelockerte Prüfung und keine Endlosschleife.

Der folgende Endkopf `98f94d74` hat die Werkzeugbereitstellung, alle vorgeschalteten Datenbankverträge, **189/189 Standardsuiten** und den Browserjob bestanden; [CI42479808754](https://github.com/ernisch/helmut-pilot/actions/runs/42479808754) scheiterte mit **338/342 Bereichssuiten**, Z22 danach nicht ausgeführt ([genauer Beleg](ci-area-first-failure.txt)). Betroffen: alte Ruhelage-/Fallbacktexte, parameterlose Signaturerwartung, Verlust einer vorhandenen stale-Einschränkung sowie ein Millisekundenrennen in einem unveränderten Quellenvergleichstest. Gezielte Korrekturen68/68,26/26,15/15,23/23 bestanden; der Zeitvergleich nutzt einen gemeinsamen festen Zeitpunkt und bleibt strikt. Die Quellenpipeline ist unverändert. Der konkrete stale-Hinweis wird wieder angezeigt (`2445eaad`), im bestehenden Browserharness zusätzlich als leerer/veralteter Zustand abgesichert: **566/566** am neuen Runtime-Endstand. Keine erfolgreichen früheren Kopfchecks werden als neue Endkopf-CI ausgegeben.

## Vergleichsbilder vor der gezielten Nacharbeit

Alle Bilder enthalten ausschließlich synthetische UI-Daten. Zeiten sind Aufnahmezeiten. Keine übermittelten Nutzerscreenshots waren im Thread lesbar; der echte main-Stand wurde deshalb als Ausgangsansicht aufgenommen.

| Ansicht | Vorher | Nachher |
| --- | --- | --- |
| Lage-Detail390 dunkel | [Bild](before/mobile-dark-detail.png) | [Bild](after/mobile-dark-detail.png) |
| Lage-Detail390 hell | [Bild](before/mobile-light-detail.png) | [Bild](after/mobile-light-detail.png) |
| Lage-Detail360 dunkel | [Bild](before/mobile-360-dark-detail.png) | [Bild](after/mobile-360-dark-detail.png) |
| Lage-Detail360 hell | [Bild](before/mobile-360-light-detail.png) | [Bild](after/mobile-360-light-detail.png) |
| Briefing390 dunkel | [Bild](before/mobile-dark-helmut.png) | [Bild](after/mobile-dark-helmut.png) |
| Lage-Liste390 dunkel | [Bild](before/mobile-dark-briefing.png) | [Bild](after/mobile-dark-briefing.png) |
| Radar390 dunkel | [Bild](before/mobile-dark-radar.png) | [Bild](after/mobile-dark-radar.png) |
| Radar390 hell | [Bild](before/mobile-light-radar.png) | [Bild](after/mobile-light-radar.png) |
| Lage Desktop1440 | [Bild](before/desktop-dark-briefing.png) | [Bild](after/desktop-dark-briefing.png) |

Weitere Endzustände: [Ruhelage](after/mobile-dark-quiet-briefing.png), [bestätigte Grundlage ohne Treffer](after/mobile-dark-empty-radar.png), [Prüfung unbestätigt](after/mobile-dark-unconfirmed-radar.png), [veraltet](after/mobile-dark-stale-radar.png), [leer/veraltet mit mitgelieferter Einschränkung](after/mobile-dark-stale-empty-radar.png), [derselbe Zustand hell](after/mobile-light-stale-empty-radar.png), [Fehler dunkel](after/mobile-dark-error-radar.png), [Fehler hell](after/mobile-light-error-radar.png), [langer Titel](after/mobile-dark-long-detail.png), [Berlin](after/mobile-mandate-Berlin-Abgeordnetenhaus.png), [Brandenburg](after/mobile-mandate-Brandenburg-Landtag.png), [Bundestag](after/mobile-mandate-Niedersachsen-Bundestag.png).

## Grenzen, automatische Wirkung und nächster Schritt

- Karten liefern aktuell keine aussagebezogenen Originalauszüge. Der bereits gespeicherte Absatztext ist Einordnung, kein Originalzitat. Die Quellenpipeline wird hier nicht repariert; PR1104/1106 bleiben separat.
- Fehlende persönliche Relevanz, Fachzuständigkeit, Mandatsebene oder Quellenpräzision wird nicht ergänzt. Synthetische Darstellung ist keine fachliche Abnahme realer Mandatspersonalisierung.
- Kein authentifizierter Production-Browser- oder physischer Android/iOS-Gerätetest. Die Browserbilder sind reale lokale Chromiumansichten mit synthetischen Daten. Keine Abnahme anderer Landesparlamente.
- Vor Push alle automatischen Workflowtrigger gegen den gesamten Diff gelesen: nur normale PR-CI trifft zu. Quellen-/PARDOK-/Profilverifikations- und DeepSeek-Workflows treffen keine geänderten Pfade; besondere Pushbranches ebenfalls nicht. Kein Mock100-Dispatch. Wegen der bestehenden unbekannten Zuordnung der Browserprüfdatei wählt der unveränderte Prüfplan die konservative Offline-/Datenbankmenge. Keine Lockerung der Testauswahl.
- Git-Push/PR kann eine reguläre geschützte Vercel-Vorschau erzeugen. Keine Änderung an Deploykonfiguration, Cron oder Production; kein Merge, kein Production-Deployment. Rückweg für die Vorbereitung: diesen PR schließen oder die UI-Commits im Branch zurücknehmen; keine Datenrücknahme erforderlich.

**Genau nächster Schritt:** ChatGPT führt die fachliche Abnahme des geprüften PR-Kopfes anhand dieser Vergleichsbilder und der kopfgebundenen Pflichtchecks durch. Denkstufe **Hoch**, weil es um gezielten Abgleich bestehender Kriterien geht. Keine neue Freigabe für die Vorbereitung nötig; im selben Thread weiterarbeiten.
