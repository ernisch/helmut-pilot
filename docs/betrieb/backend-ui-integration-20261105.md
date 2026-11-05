# Backend und UI: isolierte Integration

Stand: 05.11.2026, Europe/Istanbul. Nur lokale Integration und autorisierte
Sicherung im privaten Repository `ernisch/helmut-integration-20261105`.
Branch: `integration/backend-ui-20261105`. Keine Productionfreigabe.

## Exakte Grundlage und Ergebnis

- Backend: `e054c0bb80fa4c330082bace3cfff6d9bb89a926`.
- UI: `011910746294109c04fd5dac8e153a22188b7467`.
- Gemeinsame Grundlage: `6b4012cd912fd0e1f5ec79969168d0dcc010927f`.
- Lokaler Produktmerge: `d0a7a6a292de8302e3b425bf718d9c672121c6a5`.
- Produktbaum: `40a887f4e006889c9a80cef976d635e5a5ba2b9e`.

126 Backend- und 127 UI-Dateiänderungen haben keine Überschneidung.
Alle 2.280 Dateien des Produktmerges entsprechen exakt einem der Originalstände.
Insbesondere Motor, Speicher, Konten, Server, Service Worker und Verwaltung
bleiben identisch zum Backend; Client, Styles und neue UI-Assets identisch zur UI.
Es wurde kein durch die Zusammenführung verursachter Produktfehler gefunden.
Ergänzt wurden ausschließlich dieser Status, Testwerkzeug und Nachweise.

Beide ursprünglichen Entwicklungsbranches und fünf vorhandene lokale
Arbeitsbereiche wurden unverändert bestätigt. Pflichtdateien vollständig gelesen:
AGENTS.md, CLAUDE.md, START_HERE.md, CURRENT_STATE.md, ROADMAP_BIS_500.md.
[Integrität](belege/backend-ui-20261105/final-product-integrity.json).

## Gezielte Abnahme

**Neun unterschiedliche Prüfgruppen bestanden:** zunächst acht gemeinsame Gruppen
mit 269 echten Produkt-HTTP-Antworten, danach eine zusätzliche öffentliche
Cachegruppe mit 64 Antworten. Nur die zwei Ansichtsgruppen wurden für den
korrekten Aufnahmezeitpunkt gezielt wiederholt (64 Antworten). Dies ist keine
behauptete einmalige Neunersuite und keine Wiederholung der Einzeltests.
[Manifest](belege/backend-ui-20261105/manifest.json).

| Prüfung | Tatsächlicher Nachweis |
|---|---|
| Server und Schriften | Fünf TTFs, Logo, Foto, Client, Styles und Worker: Status, MIME und vollständige Bytes stimmen. Private Verwaltung anonym 401; Serverquellcode 404. |
| Desktop und Mobil | Echter Formularlogin, vier Ansichten, geladene Originalschriften; 1440×1000 und 390×844. Briefingpriorität und Büroverknüpfung sichtbar. |
| Briefing → Büro | Entscheidungs-, Wissensobjekt- und Vorgangs-ID bleiben identisch; Öffnen erzeugt keinen zweiten Generierungsaufruf. Regeltexte werden ausdrücklich als solche bezeichnet. |
| Profil und Rechte | Echtes Speichern im lokalen Dateispeicher; fremdes Profil unverändert. Fehlendes CSRF 403, Mitglied auf Admin-API 403, fremde Mandatswahl bleibt an eigene Sitzung gebunden. |
| Originalverwaltung | Original-React-Laufzeit mit unverändertem Claude-Design. Pflichtfelder werden angezeigt; synthetisches Konto gesperrt und ohne Passwort gespeichert. Preis offen, kein neues Profil, kein Einladungstoken oder Mailversand. |
| Gemeinsamer Service Worker | Nach Logout liefert der Server 401 statt gecachter Verwaltungs-CSS; öffentlicher Fontcache bleibt erhalten. Nichtadmin 403. Sitzungsentzug führt zur Anmeldung und entfernt den privaten UI-Inhalt. |
| Fehlende Daten und Fehler | Fehlende Mandatszuordnung sowie gezielter Fehler der Kontenablage werden ehrlich angezeigt; kein scheinbar erfolgreicher Briefinginhalt. |
| Zwei Büroverträge | UI verwendet ausschließlich `/api/communication/generate`, inklusive CSRF und Entscheidungsbindung. `/api/office/generate` weist das andere Payload mit 400 ab; korrektes eigenes Payload liefert lokal `office-disabled`. Keine stille Umstellung. |
| Öffentlicher Altcache | Echte Script-/Stylesheet-Preloads liefern zunächst die alten Backend-Bytes; Hintergrundaktualisierung und zweiter Abruf liefern exakt die neue UI. Siehe verbleibende Grenze. |

Lage kommt aus `briefing.lageBriefing`, Radar aus
`briefing.currentRadarState.anzeige`, Briefing aus `briefing.currentHelmutState`.
Die internen UI-Ansichtsnamen sind historisch: `briefing` zeigt Lage, `helmut`
zeigt Briefing. Die Zusammenführung vertauscht diese Zuordnung nicht.

Echter Produktserver und Chromium151, aktivierter Service Worker, keine
Browserroutenmocks. Eigener Kernel-Netzraum mit ausschließlich Loopback und ohne
externe Routen; bereinigte Umgebung über unverändertes `scripts/lokal.js`.
Authentifizierung, Konten und Profile verwenden echten isolierten Dateispeicher.
Fachdaten stammen aus der bereits geprüften synthetischen Lesefixture; echte
Adapter berechnen die Antworten. Kein echter Motorlauf und kein fertiger
KI-Morgenbriefingtext wurden simuliert oder als vorhanden ausgegeben.

Externe Requests, Modell-, Mail-, externe Server-Fetch- und unerwartete
Content-Schreibversuche: jeweils 0. JavaScript-Pageerrors: 0. Erwartete
HTTP-Fehlerdiagnosen der Negativfälle bleiben im Ergebnis sichtbar.
Eigene Laufzeitkopien, synthetische Speicher und Browserdateien sind entfernt;
keine eigenen Prozesse verbleiben. Fehlerhafte Testbeobachtungen sind in
[attempts.json](belege/backend-ui-20261105/attempts.json) getrennt dokumentiert.

## Wiederverwendete Nachweise und unabhängige Prüfung

Elf frühere Backendgruppen belegen unter anderem Kontosperren, Schutz des letzten
Administrators, atomare Wiederfreigabe, echte PostgreSQL-Speicherung und Wiederlesen.
Drei frühere native Speicher-/CAS-Gruppen waren an Motorcommit `33d588b6` gebunden.
Sieben frühere SW-Gruppen belegen unter anderem tatsächliches Workerupdate,
gezielte Altcachebereinigung, Offlineverhalten und Badge-Erhalt.
Diese Prüfungen wurden **nicht erneut ausgeführt**; die jeweils betroffenen
Produktdateien sind bytegleich. Das ist keine neue Bestätigung eines aktuellen
Motorstands. [Vorige Belegbindungen](belege/backend-ui-20261105/prior-evidence-references.json).

Drei parallel ausschließlich lesende Agenten prüften Testisolation/Orakel,
Git-/Designintegrität und Abschluss-/Sicherungsgrenzen. Der Designreview verglich
die neuen Aufnahmen mit den vorhandenen UI- und Verwaltungsbelegen. Keine
Produktkorrektur erforderlich; der erste Briefing-Screenshot zeigte nur die
Introanimation und wurde nach richtigem Warten ergänzt. Keine Behauptung eines
Pixelvergleichs unterschiedlicher Inhalte oder einer neuen Vollsuite.

## Verbleibende Grenzen und nächste Integration

1. **Öffentlicher Cacheübergang vor einem späteren Rollout:** Die unveränderte
   `index.html` enthält feste `?v=20260712-presale1`-URLs. Der vorhandene Worker
   liefert öffentliche Treffer zuerst und aktualisiert im Hintergrund.
   Bestandsnutzer erhalten daher beim ersten Öffnen möglicherweise alte Dateien.
   Der vorhandene dynamische ASSET_VERSION-Ersatzpfad greift nicht, solange
   `index.html` vorhanden ist. Gemischte alte/neue Clientausführung wurde nicht
   geprüft. Dies besteht bereits in beiden Ausgangsständen; innerhalb des
   ausschließlich auf Zusammenführungsfehler begrenzten Auftrags unverändert.
   Vor Hostingfreigabe versionsgebundene Assetauslieferung und tatsächlichen
   Bestandsnutzerwechsel gesondert abschließen. Private Verwaltung bleibt geschützt.
2. **Spätere Motorintegration:** exakten dann freigegebenen Motorcommit samt
   vorhandenen 500er-Ergebnissen binden, betroffene Speicher-/Authverträge und
   die vier realen Fachdatenantworten gezielt gemeinsam prüfen. Keine bereits
   bestandenen Serien ohne Änderung oder neuen Befund wiederholen.
3. **Production separat:** echte Zustellung, Anbieter-/Modellqualität, produktive
   Rechte/RLS und reale iOS-/Safari-Geräte sind durch diese lokale Abnahme nicht
   freigegeben. Auch aktivierte Kundenzugänge werden nicht durch das hier
   geprüfte Speichern gesperrter Konten belegt.

**Backend und UI sind für die spätere isolierte Motorintegration vorbereitet.**
Die öffentliche Cache-Übergangsfrage bleibt vor einem Rollout ausdrücklich offen.
Keine neue Dateifreigabe ist für die private Sicherung erforderlich.

## Private Sicherung und Wiederholbarkeit

Das Zielrepository ist privat. GitHub Actions wurden laut ausdrücklicher
Betreiberbestätigung deaktiviert; Administration-Read-HTTP403 wurde vom Betreiber
ausdrücklich als Nichtblocker festgelegt. Die Einstellung wird deshalb nicht als
erfolgreich per API nachgemessen dargestellt. Frisch gelesener Vercel-Kontext
enthält ausschließlich `helmut-pilot` und `helmut-website`, keine Verbindung des
Integrationsrepositories; auch die Betreiberprüfung bestätigt keine Verbindung.
Nur der neue Integrationsbranch wird gesichert, ohne PR, Main-Merge oder Deployment.
Der anschließende Rücklesebeleg bindet den endgültigen Dokumentationscommit,
vollständigen Tree und beide unveränderten Originalrefs außerhalb dieses Commits.

Für eine später begründete Wiederholung: Python3, Node, lokales Playwright/Chromium
und Berechtigung zum eigenen Netzwerk-Namensraum. Keine Downloads oder Anbieterkeys.
`python3 -I scripts/backend-ui-integration/run.py --output /tmp/helmut-joint-neu`
legt eine Wegwerfkopie an; `--views-only` oder `--cache-only` begrenzt den Lauf.
Der aktuelle Harness enthält neun Gruppen; die gebundenen tatsächlich ausgeführten
Versionen stehen neben den jeweiligen Ergebnissen. SHA256SUMS im Belegverzeichnis
bindet alle übernommenen Nachweise, einschließlich der Browseraufnahmen.
