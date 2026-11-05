# UI → Backend: konkrete Integrationsübergabe

Stand 04.11.2026, Europe/Istanbul. Basis `a41d51f1`, ausschließlich
`codex/helmut-ui-20261031` in `/workspace/helmut-ui`.

Verglichen wurden die **Backenddateien dieses lokalen Checkouts** mit dem
Client. Der separate Backendbranch, GitHub und Production wurden nicht
abgefragt. Dessen Koordinator muss seinen tatsächlichen Integrationscommit
später gegen diese Verträge abgleichen. Keine Backend-/Motoränderung ist Teil
dieser Arbeit.

## Bestehende Verträge und Ergebnis

| Bereich | Vorhandener Vertrag | Ergebnis im Client |
| --- | --- | --- |
| Session | `GET /api/auth/session`: `{authenticated,user,allowedPoliticians,profiles:[{id,name}]}`; ohne Sitzung `{authenticated:false}`, bei Ausfall 503. Legacy ohne Accountmodus kann 404 liefern. `server.js:6426` | Anmeldung, Ausfall und Legacy-Mandatsauswahl getrennt. Nach gesperrtem Start keine automatische Push-Synchronisierung mehr. |
| Start/Datenübernahme | `GET /api/app/start?politicianId=…`: `{profile,briefing,tasks,notes,aiStatus,version}`; 401, 403/`reason:no-mandate`, oder Auswahl-/Leerpayload. `server.js:667` | Profil, Version, Aufgaben und Notizen übernommen; keine geratenen Daten nach Fehlern. Es braucht keinen zusätzlichen Start-Endpunkt. |
| CSRF | `GET /api/security/csrf` → `{token}`. `sendCsrfForbidden` liefert 403 mit `error:"CSRF token missing or invalid"`. `server.js:3994,5980,5999` | Nur dieser explizite Fehler erlaubt einmal Tokenwechsel und Wiederholung. Fachliche 403 werden nicht erneut gesendet; Antwortinhalt bleibt lesbar. Fehlende/ungültige Tokenantwort verhindert die Schreibanforderung. |
| Lage | `briefing.lageBriefing`: `available`, `reason`, `vorgaenge`, `pendingNarrative`, Zeitfelder; Quellen tragen `name,url,dateLabel,publishedAt`. `lib/helmut/lage.js:128,322,650` | Karten bleiben auch bei `available:false` erhalten. Ein bekannter Teilfehler wird jetzt zusätzlich sichtbar, z. B. `no-current-sources` mit älteren belegten Karten. `pendingNarrative:true` bei `available:true` wird nicht als technischer Ausfall erfunden. |
| Radar | `briefing.currentRadarState.anzeige` ist die kuratierte Anzeige mit eigenem Status/Datum; daneben bleiben Rohzuordnungen. `lib/helmut/radarState.js:1014`, `briefing-bereichsvertrag.js:95` | Anzeige, Quellen und Frische kommen aus `anzeige`. Rohkandidaten ersetzen keine kuratierten Treffer. Ansichtswechsel fordert keinen separaten Radar-Endpunkt an. |
| Briefing | `currentHelmutState`: Hauptvorgang, Empfehlung, Frischevertrag, Risiko/Chance, Aufgaben und Quellen. Empfehlungen tragen separate KO-/Vorgangskennungen. `briefingContract.js:375,1024,1082` | Die auf `a41d51f1` belegte Zuordnung bleibt Grundlage. Sie wurde in diesem Sprint nicht vollständig erneut getestet. |
| Büro | Verwendet wird `POST /api/communication/generate` mit `{prompt,channel,decision}` → `{text,aiEnabled,channelLabel,degraded?,fallbackReason?,sourceNote?}`. `server.js:1059`, `lib/helmut/ai.js:208` | 429 ergibt einen sichtbaren Fehler ohne fertige Entwürfe. Budget-Fallback mit `aiEnabled:false` bleibt regelbasierter Output. Kein Endpunktwechsel. |

Der vorhandene alternative `POST /api/office/generate` erwartet
`{vorgangId,outputType}` und liefert `content`/`status`/`id` oder einen
Skipgrund (`server.js:829`, `lib/helmut/office.js:73`). Auch Kanalwerte wie
`press` und `pressemitteilung` unterscheiden sich. Dieser Vertrag ist kein
direkter Ersatz für die aktuelle Kommunikationsroute.

Der Radar-Bereichsvertrag liefert bewusst keine zweite allgemeine Artikelliste
in `anzeige.articles`. Dass aus den Rohartikeln keine weitere UI-Liste entsteht,
ist hier **keine fehlende Backendfunktion**. Eine Abweichung vom Designwunsch
müsste fachlich entschieden werden; keine Feed-Erweiterung für diesen Anschluss.

## Tatsächlich korrigierte UI-Fehler

1. Fachliche 403-Antworten führten wie CSRF-Ablehnungen zu einer zweiten
   Schreibanforderung. Die Wiederholung ist jetzt auf den eindeutigen
   serverseitigen CSRF-Fehler begrenzt. Ein wiederholter CSRF-Fehler stoppt nach
   genau einem Wiederholungsversuch.
2. Der Client prüft eine erfolgreiche CSRF-Antwort auf einen nichtleeren
   Token. Die beiden weiteren geschützten GET-Pfade `/api/lage/briefing` und
   `/api/push/test` sind mit der Liste in `server.js:5999` abgeglichen. Dadurch
   werden keine neuen Aufrufe gestartet.
3. Der Lage-Renderer übersprang bei vorhandenen Karten den gemeldeten Teilfehler.
   Ein zusätzlicher Hinweis erhält die Karten und benennt die eingeschränkte
   Aktualität/Verfügbarkeit.
4. Der normale Start setzte die automatische Push-Synchronisierung auch nach
   Anmeldungsausgabe oder Mandatssperre fort. Nur ein erfolgreich übernommener
   Start mit Profil erlaubt jetzt diese Synchronisierung.

## Automatische Aktionen: vor echter Integration beachten

| Auslöser | Mögliche Wirkung im vorhandenen Backend/Browser |
| --- | --- |
| `GET /api/auth/session` | `accounts.extendSession()` kann Sessionablauf und Cookie verlängern; gedrosselt, aber nicht rein lesend. `accounts.js:472` |
| `GET /api/app/start` | `accounts.recordUserActivity()` kann `lastSeenAt` und `openCount` schreiben. Dieser Aufruf erfolgt auch vor der Briefing-Vorschauaufbereitung. `server.js:669`, `accounts.js:647` |
| Erfolgreicher Start / Nachladen | Vorhandene automatische Büroerzeugung kann bei gültiger Zuordnung und fehlendem Cache Kommunikations-POSTs auslösen. Die Begrenzung und Zuordnungswachen von `a41d51f1` bleiben erhalten. |
| Erfolgreicher Start bei erteilter Push-Berechtigung | Bestehende Synchronisierung kann beim Browser-Pushdienst ein Abo erneuern und `POST /api/push/subscribe` aufrufen. Nur nach erfolgreichem Start; im neuen Test vollständig simuliert. |
| Parlament-Nachladen | `GET /api/parliament` kann bei aktivierter DIP-Anbindung externe Quellen lesen und einen Prozesscache füllen. `dip.js:98,144` |
| Manuelles „Einschätzung neu prüfen“ | `GET /api/pipeline/run` startet Facharbeit; kein bloßes Daten-Nachladen. Weitere GET-Pfade in `requiresCsrf` sind ebenfalls schreibfähig. |
| Service Worker / App-Badge | Lokale Registrierung, Assetcache und Badgeänderungen sind von Backendpersistenz und Pushzustellung zu unterscheiden. Im neuen Browsertest sind auch diese Push-/Service-Worker-APIs simuliert. |

**Ein `preview=1` allein ist kein Nachweis eines schreibfreien Backendzugriffs.**
Insbesondere Session-/Nutzungspfad und DIP müssen in der späteren
Integrationsumgebung ausdrücklich vom 500er-Bestand und echten Anbietern getrennt
sein. Hier wurde keiner dieser realen Pfade ausgeführt.

## Neu geprüft, ohne die früheren Serien zu wiederholen

```sh
node scripts/lokal.js -- python3 -I scripts/ui-preview-isolated.py --only ui-integration-contract-browser-test.js
```

**97/97 neue Vertragsprüfungen bestanden**, zehn getrennte Browserkontexte.
Geprüft sind abgemeldete/ausgefallene/ungültige Session, 401/503 am App-Start,
403 ohne Mandat, Legacy-Auswahl und leerer Mandatsbestand. Positive Start- und
Projektionsfälle laufen auf Desktop 1440×900 und Smartphone 390×844; die
Transport-/Erzeugungsfehler werden gezielt einmal auf Desktop geprüft.

Zusätzlich: CSRF-Erneuerung, ausbleibende Wiederholung fachlicher 403,
dauerhafter CSRF-Fehler, fehlender Token/Tokenendpunkt-Ausfall, zwei zusätzliche
geschützte GET-Pfade, Büro-429 und regelbasierter Budget-Fallback. Bei negativer
Startprüfung werden selbst mit simulierter Push-Berechtigung weder Sync-Timer
noch Abonnement angelegt. Ein positiver Kontrollfall erzeugt das simulierte
Abo und bestätigt, dass diese Prüfung nicht mangels Browserunterstützung grün ist.

46 HTTP-Anfragen einschließlich 11 POSTs wurden ausschließlich im Speicher
beantwortet. Es laufen die vollständige unveränderte `client.js` und ihr normaler
Bootstrap. Weder Backend noch Motor werden importiert oder gestartet.
Benachrichtigungsberechtigung, Service Worker und PushManager sind Browser-Fixtures;
kein echter Pushdienst wird kontaktiert. Für HTTP-Fehlerfälle meldet die Fixture
`navigator.onLine=true`; **die tatsächliche Kernel-Netzsperre bleibt unverändert**.

Vor Browserstart sind eigener Netzwerk-Namensraum, ausschließlich Loopback und
fehlende nutzbare IPv4-/IPv6-Routen sowie verweigerte Verbindungsproben belegt.
Alle Anfragen werden zusätzlich vor Übertragung abgefangen. **Null externe
Übertragungen, null gesendete/empfangene Bytes oder Pakete.** Kein Build,
Installations-, Server- oder GitHub-Job. Die 69 Zuordnungsprüfungen auf `a41d51f1`
und die 388 früheren Prüfungen wurden nicht erneut ausgeführt.

[Browserresultat und simulierte HTTP-Status](ui/belege/20261104-integration/BROWSER_RESULT.json),
[Netzbeleg](ui/belege/20261104-integration/NETWORK_PROOF.json),
[Anfragen](ui/belege/20261104-integration/BROWSER_REQUESTS.json),
[Smartphone: Teilverfügbarkeit](ui/screenshots/20261104-integration/contract-mobile-partial-lage.png),
[Desktop: kuratierter Radar](ui/screenshots/20261104-integration/contract-desktop-curated-radar.png).
Die Quellhashes binden die geprüfte vollständige Clientdatei und Fixtures.

## Verbleibende Aufgaben und Zuständigkeit

| Reihenfolge | Konkrete Aufgabe / Abnahme | Zuständig | Dateien / Schnittstellen |
| --- | --- | --- | --- |
| 1 | Exakten Backend-Integrationscommit benennen und Abweichungen zu den hier geprüften Antwortformen abgleichen. Danach unabhängige Testumgebung mit synthetischen Mandaten, eigener Persistenz und abgeschalteten echten Modell-/DIP-/Pushanbietern bereitstellen. Keine gemeinsam genutzte 500er-Datenbank oder Motorjobs. | Backendkoordinator + Testbetrieb | `server.js`, `auth/session`, `app/start`, Provider-/Speicheradapter |
| 2 | Mit echten lokalen HTTP-Antworten der isolierten Umgebung Cookie-/Sessionverlängerung, Mandatszuordnung, 401/403 und Mandatsauswahl prüfen. Kein Zugriff auf fremde Mandate; Session-/Aktivitätswrites nur in der Testablage. | Backend/Auth; UI für gemeinsame Abnahme | `server.js:6426`, `auth.js`, `accounts.js:472,647` |
| 3 | CSRF-Signatur/Laufzeit und Ablehnung **vor** jeder Operation serverseitig belegen. Den aktuellen eindeutigen Fehlervertrag erhalten oder eine spätere Änderung gemeinsam mit der UI versionieren. Alle sechs geschützten GET-Pfade und POST/PATCH berücksichtigen. | Backend/HTTP; UI-Transport ist vorbereitet | `server.js:3994,5980,5999`, `client.js:fetchWithTimeout/getCsrfToken` |
| 4 | DTOs an den echten Testdatenfluss binden: getrennte IDs und Entscheidung, Frischevertrag, Lage-Teilzustände/Quellendatierung, kuratierte Radar-Anzeige. Keine neue Rangfolge oder Rohartikel-Liste im Client nachbauen. | Backend/API + UI | `briefingContract.js`, `lage.js`, `radarState.js`, `briefing-bereichsvertrag.js`, `applyStartPayload()` |
| 5 | Die verwendete Kommunikationsroute bestätigen; persistierte Entwurfskennungen/-stände und das Verhalten bei Timeout/erneutem Öffnen abnehmen. Geräteübergreifende Entwurfspersistenz ist durch den lokalen Tagescache nicht belegt. Ein Wechsel zur nativen Office-API braucht einen ausdrücklichen Antwort-/Kanaladapter. | Backend/Büro + UI; Produktentscheidung bei zusätzlicher Persistenzanforderung | `/api/communication/generate`, `/api/office/generate`, `office.js`, `officeDraftCacheKey()` |
| 6 | Unbekannten Schreibausgang und Idempotenz festlegen: `fetchWithTimeout()` begrenzt derzeit die Wartezeit, beendet aber keine serverseitige Operation. Pipeline wartet clientseitig 90 s gegenüber bis zu 280 s im Serverpfad. Kein blindes Wiederholen als Lösung; spätere Ergebnis-/Laufbindung gemeinsam abnehmen. | Backend/Laufsteuerung + UI | `client.js:fetchWithTimeout/executePipelineRun`, `server.js:802` |
| 7 | Reale Asset-/Cookie-/CSP-Auslieferung und Service Worker prüfen. Die Node-MIME-Tabelle enthält bislang keine TTF-/WOFF2-/JPEG-Zuordnung; Vercel bedient `/assets/` separat. Daraus folgt hier kein behaupteter Production-Ausfall. | Backend/Hosting + UI | `server.js:104,3251`, `vercel.json`, `sw.js`, `assets/ui/` |
| 8 | Nach zulässiger Anbindung die gemeinsame Browser-/Bereichs-CI auf dem exakten Endcommit ausführen. Vor Start gemeinsame Runner-/Kontingente und automatischen Deploymentstart kontrollieren; hier keine Prüfung gestartet. | ChatGPT-Koordination + UI/Backend-QA | vorhandene CI, UI-/Backend-Integrationscommit |

Nächster sinnvoller Schritt ist **1: Backendcommit und isolierte Anschlussumgebung
festlegen**. Die Arbeit hier bleibt lokal; kein Push, Merge, Deployment oder
Productionzugriff. Dieser Bericht erteilt dafür keine zusätzliche Freigabe.
