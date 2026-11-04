# Briefing → Büro: Zuordnung und Integrationsvorbereitung

Dieser Zuordnungsnachweis gehört zu `a41d51f1`. Die folgende
[Backend-Vertragsübergabe mit 97 neuen Prüfungen](ui-backend.md)
führt den neueren Stand; die 69 Fälle unten wurden dabei nicht wiederholt.

Stand 04.11.2026, Betreiberzeit Europe/Istanbul. Ausgangspunkt `a9ea5993`,
ausschließlich Branch `codex/helmut-ui-20261031` und Worktree `/workspace/helmut-ui`.
**69 gezielte Browserprüfungen bestanden.** Die früheren 388 Prüfungen wurden
nicht erneut ausgeführt; ihr datierter Nachweis bleibt unverändert erhalten.

## Behoben

- `recommendationToDecisionItem()` und `toDecision()` erhalten
  `knowledge_object_id`/`knowledgeObjectId`, `vorgang_id`/`vorgangId` und die
  tatsächliche `decision`. Die Empfehlungs-/Kartenkennung `id` bleibt eigenständig.
  Der bestehende V3-Signalbezug verwendet die explizite KO-Kennung; ein separat
  gelieferter Legacy-Signalbezug wird erhalten. Keine Ableitung einer
  Vorgangskennung aus Titel, Empfehlung oder Signal.
- Die UI erhält die serverseitige Hauptvorgangsauswahl auch bei anderen
  Score-Reihenfolgen. Ignorierte Empfehlungen gelangen nicht in die aktive
  Entscheidungsmenge. Büroanzeige und automatische Erzeugung verwenden dieselbe
  Auswahl mit expliziten Kennungen, Quellen und erlaubter Entscheidung.
- Fehlende, widersprüchliche oder mehrdeutige Zuordnungen sperren den Übergang
  und die automatische Erzeugung. Eine fehlende Entscheidung wird nicht mehr
  automatisch als „Beobachten“ ergänzt. Im Read-only-Vorschaumodus werden keine
  Büroentwürfe automatisch angefordert.
- „Im Büro öffnen“ bindet Profil, Vorgang und Knowledge Object und öffnet direkt
  dessen Entwurf. Eine zuvor ausgewählte andere Karte wird nicht übernommen.
  Auch die Kartenauflösung verwendet die getrennten Kennungen gemeinsam;
  ein beliebiger Treffer über `id OR signalId` genügt nicht mehr.
- Der Übergang merkt die Büroansicht. Verschwindet die Zuordnung beim Nachladen,
  bleibt ein sichtbarer Hinweis mit Zurück-Bedienung erhalten, auch mobil.
  Es wird kein anderer Vorgang als Ersatz ausgewählt. Ein ausdrücklicher Wechsel
  zur allgemeinen Büroübersicht oder eine andere Kartenwahl löst diese Bindung.
- Vor jeder weiteren automatischen Anforderung und nach einer ausstehenden
  Antwort wird die Zuordnung erneut geprüft. Wird der Vorgang inzwischen
  ignoriert oder fehlen seine Kennungen, wird die Antwort nicht übernommen und
  die alte Generierungsfolge stoppt. Ein geänderter Mandats-/Tageskontext erhält
  keinen Cachewrite des alten Laufs.

## Gezielter Nachweis

```sh
node scripts/lokal.js -- python3 -I scripts/ui-preview-isolated.py --only ui-office-binding-browser-test.js
```

Der vorhandene CDP-/Chromium-Runner wird in einem zusätzlichen, eng begrenzten
Modus wiederverwendet. Desktop 1440×900 und Smartphone 390×844 erhalten jeweils
einen eigenen Browserkontext mit getrenntem Speicher. Keine Installation, kein
Build, HTTP-Server, Motorimport oder Datenbankzugriff.

Anders als bei der früheren reinen Darstellungsprüfung läuft die vollständige,
unveränderte `client.js` mit ihrem normalen `loadBriefing()`-Bootstrap. Es werden
keine Entscheidungen durch den Testrunner eingesetzt. Simuliert werden die
Backendantworten für Session, App-Start, CSRF, Parlament, Betriebsstatus und
Push-Konfiguration sowie POST `/api/communication/generate`. Unbekannte API-Aufrufe
führen zum Fehler. Die Schreibsimulation prüft insbesondere die CSRF-Übergabe
und die getrennten Kennungen im Anfragetext.

Die Fixtures entsprechen den vorhandenen `toItem`-/`toRecommendation`-Formen
in `lib/helmut/briefingContract.js`. Die drei Kennungsarten sind absichtlich
verschieden; die regulären Scores und Entscheidungen folgen dem bestehenden
V3-Vertrag. Negative Fälle ergänzen fehlende Kennungen/Entscheidungen, doppelte
oder widersprüchliche Zuordnungen und eine während der Antwort geänderte
Entscheidung. Eine neue gültige Zuordnung stellt die Funktion wieder her.

Ergebnis: **69/69**, keine unbehandelten Browserausnahmen, keine fehlenden
angeforderten statischen Dateien, keine unbekannten API-Aufrufe. Insgesamt
17 Schreibanforderungen vollständig im Speicher simuliert, kein Modell aufgerufen.
Der Übergang selbst erzeugt keine neue Anforderung.

## Netz- und Arbeitsbereichsschutz

Vor App-Start belegt der bestehende Launcher einen eigenen User-/Netzwerk-
Namensraum, ausschließlich Loopback ohne nutzbare IPv4-/IPv6-Routen und
fehlgeschlagene Verbindungsproben. Chromium nutzt Pipes statt eines Vorschauports.
Alle Browseranfragen werden vor Übertragung abgefangen; nur die virtuelle
Testadresse wird im Speicher beantwortet. Fehlender Netzbeleg verweigert bereits
den Browserstart des neuen Testeinstiegs.

**Null externe Übertragungen; null gesendete oder empfangene Bytes/Pakete.**
Kein gestarteter GitHub-Job, externer Helfer, Push, Merge oder Deployment.
Motor, Backenddateien, Paketdateien, Workflows und Vercel-Konfiguration wurden
nicht verändert. Der Original-Worktree bleibt auf `6b4012cd` mit unverändertem
Index und unveränderten versionierten Arbeitsdateien.

- [Browserergebnis, API-Simulationen und geprüfte Quellhashes](ui/belege/20261104-zuordnung/BROWSER_RESULT.json)
- [Netzbeleg vor/nach dem Lauf](ui/belege/20261104-zuordnung/NETWORK_PROOF.json)
- [Abgefangene Browseranfragen](ui/belege/20261104-zuordnung/BROWSER_REQUESTS.json)
- [Startverweigerung ohne Netzbeleg](ui/belege/20261104-zuordnung/STARTUP_GUARD.json)
- [Desktop: eindeutiger Entwurf](ui/screenshots/20261104-zuordnung/desktop-briefing-office-bound.png)
- [Smartphone: eindeutiger Entwurf](ui/screenshots/20261104-zuordnung/mobile-briefing-office-bound.png)
- [Smartphone: verschwundene Zuordnung](ui/screenshots/20261104-zuordnung/mobile-missing-target.png)

Die SHA256 des ausgelieferten Clients entspricht der vollständigen `client.js`.
Die datierten Artefakte und ihre Prüfsummen werden getrennt vom früheren
Darstellungsnachweis aufbewahrt.

## Übergabe an die Backendkoordination

Kein neuer Endpunkt und keine Motoränderung erforderlich. Die UI verwendet
weiter `GET /api/app/start` und `POST /api/communication/generate` mit
`{prompt, channel, decision}` beziehungsweise `{text, aiEnabled}` als Antwort.
`POST /api/office/generate` bleibt ein anderer Vertrag mit
`{vorgangId, outputType}` und `content`; es wurde nicht umverdrahtet.

Für spätere reale Integration die vorhandenen expliziten KO-/Vorgangskennungen,
`decision`, Hauptvorgang und Quellen durchgehend erhalten. Noch offen sind die
echte serverseitige Authentifizierung/Autorisierung, Persistenz und
Serverauslieferung mit MIME/CSP sowie reguläre CI auf dem späteren Endstand.
Die Simulation beweist keinen produktiven Speicher- oder 500er-Nachweis.
Der bestehende lokale Tagescache ist weiterhin kein Beleg für geräteübergreifende
Entwurfspersistenz oder eine eigene Entwurfsversion.

Nächster sinnvoller Schritt nach Koordination: die bestehenden API-Verträge in
einer gesondert zugelassenen Integrationsumgebung anbinden. Bis dahin bleibt
die netzgesperrte Simulation der ausführbare Anschlussnachweis. Kein Push,
Merge oder Deployment ist durch diesen Bericht freigegeben.
