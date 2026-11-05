# Finale Produktintegration: privater Releasekandidat

Stand: 05.11.2026, Europe/Istanbul. **Technische Vorbereitung abgeschlossen;
konkreter main-Merge und Productionfreigabe offen.** Keine neue Lastteststufe.

## Zusammenführung und Erhalt

- Main: `76b75e371c7db69d7c9381071e23443182fc3607`, PR1052 gemergt.
- Geprüfte Backend-/UI-Grundlage: `3c5765c577b35641ba107a4d6b863ab1e5ab7456`.
- Privater Branch: `integration/release-prep-20261105` in
  `ernisch/helmut-integration-20261105`.
- Lokaler Zusammenführungscommit: `1ee19fb1207ae5dbdad9402f0aa507e1af3e79cb`.

Die tatsächliche gemeinsame Git-Grundlage ist `773f7aa5`. Seit dieser Grundlage
hat main 31 Dateien verändert; gemeinsam verändert ist **nur CURRENT_STATE.md**.
Der zuvor genannte Drei-Dateien-Vergleich ist nicht die tatsächliche Konfliktmenge
dieses Merges. `server.js` und `scripts/p1-security-check.js` wurden deshalb
zusätzlich einzeln geprüft und nicht pauschal durch eine Seite ersetzt.

Alle 30 übrigen main-Änderungen sind exakt übernommen, einschließlich aller
Mock100-Korrekturen und CI-Dateien. CURRENT_STATE behält die aktuellen
Mock100-PASS-/FAIL-/UNKNOWN-Verweise und ergänzt diesen Integrationsstand.
Kontosicherheit, Adminrouten, Rechtskontakte `hallo@mithelmut.de`/Lüey Nohut und
die neuen Speicherverträge bleiben erhalten. Motorbibliotheken sind unverändert;
die bereits freigegebene Kontosicherheitsdatei bleibt aus dem Backend erhalten.
Historische Dateien und vorherige Integrationsbelege wurden nicht verändert.
[Quellintegrität](belege/release-prep-20261105/source-integrity.json).

## Einziger neuer Produktfix

In `index.html` wurden ausschließlich die zwei Versionsparameter für Client und
Styles auf `7d7abc524dd2e2ec` gesetzt. Dieser Wert ist
`SHA256(client.js-Bytes + NUL + styles.css-Bytes)[:16]` und wird im gezielten
Test gegen die tatsächlichen Dateien geprüft. Bei späterer Änderung dieser
Dateien muss die gemeinsame Versionsbindung mit aktualisiert werden.

Anlass ist der zuvor tatsächlich nachgewiesene Altcache: identische URLs konnten
beim ersten Start einen alten Client einschließlich älterer Sicherheitslogik
ausführen. Der neue Schlüssel wirkt bereits mit dem unveränderten alten Worker.
Es gibt keinen neuen Cache-Namensraum, kein pauschales Leeren und keine
SW-Änderung. Clientcode, CSS, Reichstagsbild, Fonts und beide Designs bleiben
bytegleich. Der dynamische Server-Ersatzpfad wird nicht als Lösung behauptet.

## Tatsächlich neu geprüft

**Vier gezielte Gruppen bestanden, 202 echte Produkt-HTTP-Antworten:**

1. Inhaltsgebundene Assetversion, echte Auslieferung von Client, Styles, Bild und
   fünf Schriftdateien; private Verwaltung anonym 401, Serverquellcode 404,
   Rechtsseiten mit erhaltenem Kontakt erreichbar.
2. Desktop1440×1000: alter main-Worker und gültige alte Client-/Stylebytes im
   Cache; erste echte neue HTML-Navigation lädt und führt bereits die aktuellen
   Client-/Stylebytes aus. Echter UI-Login, Lage/Radar/Briefing/Büro und gebundener
   Briefing→Büro-Wechsel ohne doppelte Generierung. Mitglied→Admin403,
   fehlendes CSRF403, fremde Mandatswahl bleibt am eigenen Konto,
   Sitzungsentzug entfernt private UI-Inhalte und führt zur Anmeldung.
3. Mobil390×844: derselbe tatsächliche Erstwechsel und dieselben Schutzwege;
   anschließend echter Workerupdate. Private Altbestände und überholte öffentliche
   Versionseinträge entfernt; unbeteiligte Font-/Iconbytes und Badge-Cacheeintrag
   erhalten. Desktop durchläuft ebenfalls diesen Updateweg.
4. Originale React-Verwaltung: Pflichtfeldfehler und synthetische Kundenanlage
   über den echten Server. Konto gesperrt, ohne Passwort, Preis offen, kein
   ungefragtes Profil und keine Einladung. Der separate native Büroendpunkt weist
   das Kommunikations-Payload mit400 ab und meldet im lokalen gesperrten Modus
   ehrlich `office-disabled`; keine Umstellung der UI auf einen anderen Vertrag.

[Ergebnis](belege/release-prep-20261105/result.json),
[alte Eingabebindungen](belege/release-prep-20261105/legacy-cache-binding.json),
[Cleanup](belege/release-prep-20261105/cleanup.json).

Vorhandener Prüfstarter, eigener Loopback-Netzraum ohne externe Routen,
bereinigte Umgebung und unverändertes `scripts/lokal.js`; echte Serverantworten
und synthetischer lokaler Dateispeicher. Fachdaten kommen aus der bereits
vorhandenen synthetischen Lesefixture. Nur der exakt an main gebundene alte
Worker wird während der historischen Phase als alte HTTP-Datei ausgeliefert.
Keine Browserroutenmocks. Modell-, Mail-, externe Server-Fetch- und externe
Browseraufrufe jeweils0; JavaScript-Pageerrors0. Keine eigenen Prozesse oder
synthetischen Laufzeitspeicher verbleiben. Ein vorheriger Fehlversuch betraf
ausschließlich einen relativen Testcache-Schlüssel unter `/verwaltung/`, der
korrekt entfernt wurde; [Erstfehler erhalten](belege/release-prep-20261105/first-attempt/explanation.json).

Drei ausschließlich lesende Prüfagenten akzeptieren Kontosicherheit,
UI/Cache samt sechs Desktop-/Mobilaufnahmen und Motorerhalt. Einziger schreibender
Ausführer war der Hauptlauf. [Review](belege/release-prep-20261105/review.json).

## Vorhandene Belege weiterverwendet

Mock100 bleibt abgeschlossen: [Run42053461090](https://github.com/ernisch/helmut-pilot/actions/runs/42053461090),
100 Profile/300 Ergebnisse, [unveränderter Bericht](mock100-20261105.md).
Keine Wiederholung von Mock100, Mock500 oder Production-Lasttests.
Main-CI [42069590393](https://github.com/ernisch/helmut-pilot/actions/runs/42069590393)
ist auf76b75e37 erfolgreich; ihr Mock100-Job wurde bewusst übersprungen.

Die vorherigen neun UI-/Backendgruppen, elf Backend-/PostgreSQLgruppen,
drei nativen CAS-/Speichergruppen und sieben SW-Gruppen bleiben getrennte
historische Belege. Unveränderte Teilpfade werden weiterverwendet; der
geänderte Einstiegs-/Cachepfad wurde neu geprüft. Keine erneute Gesamtabnahme. Insbesondere Kontosperre, letzter anmeldbarer Administrator,
atomare Wiederfreigabe mit Actor-/Zielprüfung pro CAS-Versuch sowie echte
DB-Persistenz und Wiederlesen wurden nicht grundlos erneut ausgeführt.
Die neuen Tests behaupten keine neue PostgreSQL-, Anbieterqualitäts-, Safari-/iOS-
oder Productionabnahme. Regeltexte und fehlendes Morgenbriefing bleiben sichtbar.

## Voraussetzungen für den sicheren main-Merge

Kein bekannter technischer Integrations- oder Cacheblocker im geprüften Umfang.
Für die nächste Freigabe bleiben konkret:

1. Den endgültigen privaten Kandidaten samt Übernahmepfad ausdrücklich freigeben;
   dadurch noch keine Migration, Datenmutation oder bezahlten Tests autorisieren.
2. Main und parallele Änderungen frisch vergleichen. Die beiden Pflichtchecks
   `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)` müssen auf
   **genau dem späteren Kandidatenkopf** erfolgreich sein. Die vorhandene grüne
   main-CI ersetzt diese Kandidatenprüfung nicht. Kein neuer Mock100-Lauf nötig.
3. Vor Livefreigabe die bestehenden Datenschutz-/Vertrags- und Betriebsfreigaben
   für den tatsächlich vorgesehenen Kundenkreis bestätigen: zulässige Daten und
   Zugänge, wirksame Kosten-/Kommunikationskonfiguration, Nachkontrolle und
   Rückweg auf den vorherigen freigegebenen Stand. Diese Productionbedingungen
   wurden hier nicht geprüft oder verändert. Alte Juli-Restlisten werden nicht
   ohne aktuellen Nachweis zu neuen technischen Aufgaben erklärt.

Der technische Kandidat ist vorbereitet; eine allgemeine Verkaufs- oder
Productionfreigabe wird daraus nicht abgeleitet. Nächster Schritt ist die
konkrete Kandidatenfreigabe und erforderliche Pflicht-CI für seine Übernahme.

## Private Sicherung

Privates Repository bestätigt. Actions sind laut ausdrücklicher Betreiberbestätigung
deaktiviert; die weiterhin fehlende Administration-Read-Berechtigung wurde bereits
ausdrücklich als Nichtblocker festgelegt. Kein erfolgreicher API-Einstellungsread
wird behauptet. Keine Actions-Läufe im privaten Repository; frischer Vercel-Kontext
enthält keine Verbindung dieses Repositories. Nur der vorbereitete Branch wird
ohne Force-Push fortgeschrieben. Danach frischer Rückdownload mit Commit-,
vollständigem Tree- und Objektintegritätsvergleich. Keine PR, kein main-Merge,
keine Productionverbindung, keine Migration oder Deployment.

Reproduzierbarer gezielter Einstieg bei später begründetem Bedarf:
`python3 -I scripts/backend-ui-integration/run.py --release --output /tmp/helmut-release-neu`.
Die vorhandene Netzisolation und lokale Browserressourcen sind erforderlich;
keine Pakete oder Anbieterzugänge werden dafür installiert.
