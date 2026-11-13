# Verwaltung: Helmut-Marke und Kundenzugang · 13.11.2026

Die einfache Verwaltung nutzt jetzt die bestehenden Helmut-Farben, das originale
Zeichen sowie die lokalen Schriften Hanken Grotesk und Spectral. Formulare und
Bedienelemente bleiben auf dem Handy lesbar und erreichbar. Übersicht, Kunden
und Einstellungen bleiben die drei Einstiege.

Beim Kunden stehen Kontozugang und Mandat verständlich nebeneinander:
„Passwort offen“, „Zugang aktiv“ oder „Zugang gesperrt“. Eine ausstehende Einladung
behauptet keinen E-Mail-Versand. Bei einem bestehenden Konto heißt die Aktion
„Passwort zurücksetzen“; pro Aktion gibt es genau einen sichtbaren Einstieg.
Der tatsächliche Versand wird nur aus dem Rückgabebeleg angezeigt.

„Zugang sperren“ und „Zugang freigeben“ verwenden die bestehenden geschützten
Kontorouten mit frischem Vorabstand und anschließendem Lesebeleg. Sie versenden
keine E-Mail und ändern weder Mandatsangaben noch Profilaktivierung. Eine Sperre
beendet auch eine bestehende Kundensitzung. Administratoren sowie gekündigte oder
deaktivierte Konten können hier nicht freigegeben werden. Bei unklarem Ausgang
bleiben weitere Änderungen gesperrt; kein automatischer Wiederholungsversuch.

Partei, Fraktion und Wahlkreis bleiben Dropdowns; politische Schwerpunkte bleiben
optional und im Kundenprofil ergänzbar. Vorhandene seltene Werkzeuge und
Briefingnachweise sind weiterhin eingeklappt erreichbar. Die lokale Ansprache ist
auf „Sie“ vereinheitlicht. Die bereits passenden Systemmails verwenden weiterhin
dieselben Farben und ihre mailtauglichen Schriftalternativen.

## Nachweise

- Echte isolierte lokale HTTP-/Konten-/Profilschnittstellen und Chromium:
  **65 Prüfgruppen bestanden**. Kundenanlage, Einmalpasswort mit beiden Augen,
  spätere Schwerpunktpflege, Reset statt zweiter Einladung, Sitzungsentzug,
  Sperren/Freigeben ohne Profiländerung, Schutz vor Admin-/Kündigungseingriffen,
  unbekannter Ausgang nach verlorenem Lesebeleg ohne zweiten Schreibversuch.
- Export derselben Oberfläche mit fiktivem Adapter: **35 Prüfungen bestanden**,
  **0 externe Anfragen**, **0 JavaScriptfehler**. Geprüft bei 1440/390/360/320 Pixeln,
  ohne horizontalen Überlauf. Die Testdatei akzeptiert ein eigenes Ausgabeverzeichnis;
  historische Vorschauartefakte bleiben erhalten.
- [Prüfzusammenfassung](pruefung.json), [Desktop](app-uebersicht.png),
  [Kunde mobil](app-kunde-mobil.png), [Anlage ohne Schwerpunkte](app-kunde-ohne-schwerpunkte-mobil.png).
- [Durchklickbare Offline-Vorschau](vorschau.html): lokal öffnen; alle Daten und
  Aktionen sind ausdrücklich fiktiv, ohne Backend- oder Mailverbindung.

Befehle, jeweils im Repository:

```sh
node scripts/lokal.js -- node -e 'require("./scripts/admin-einfach-test").run({browser:true}).then(r=>console.log(r.passed))'
node scripts/lokal.js -- node scripts/verwaltung-einfach-export.js /tmp/helmut-vorschau/vorschau.html
node scripts/lokal.js -- node scripts/verwaltung-einfach-vorschau-browser.js /tmp/helmut-vorschau
```

Das Ausgabeverzeichnis zuvor anlegen. Der kanonische CI-Prüfplan verlangt wegen
der geänderten Vorschau-Prüfdatei die vollständigen Pflichtchecks. Verbindliche
CI-, Merge- und Deploymentbelege sowie der aktuelle Rolloutstand stehen in
[PR #1177](https://github.com/ernisch/helmut-pilot/pull/1177).

## Umfang und Rückweg

Keine Änderung an Datenbank, Secrets, Zeitplänen, Kunden-/Profilbeständen oder
Briefingverarbeitung; keine echte E-Mail und kein bezahlter Lauf. Die Funktions-
und Bedienbelege oben stammen aus isolierten Testkunden, nicht aus einer
angemeldeten Production-Kundensitzung. Nach dem regulären Deployment werden
Commit, READY-Zustand und anonyme Zugriffssperren rein lesend geprüft.

Rückweg: gezielter Revert dieses PR oder Rückkehr zum vorherigen Deployment;
keine Datenrücknahme nötig.

## Bestätigter Rollout

PR1177 wurde auf `7dcf3480f1708610b8bf82a278c46214ef915d51` gemergt. Beide
Pflichtchecks auf Kopf `3a3c9d8c` grün, [CI43390735182](https://github.com/ernisch/helmut-pilot/actions/runs/43390735182).
Production `dpl_7e6BdkQuSwjgNsC3XarcBjVLbadG` READY, Hauptadresse mit diesem Commit
bestätigt. Anonyme Nachkontrolle: Startseite HTTP200, Verwaltung und Admin-Kontoroute
HTTP401. `/api/health` ist ebenfalls geschützt (HTTP401), kein öffentlicher
Healthnachweis behauptet. Keine authentifizierte Production-Bedienprüfung.

Die Textpflege danach vereinheitlicht zusätzlich die beiden älteren Hinweise für
einen teilweise abgeschlossenen oder unbekannten Quellenlauf auf „Prüfen Sie …“.
Sie verändert keine Laufsteuerung und keinen Kontozustand. Der aktuelle gemeinsame
Rolloutstand mit Folgebeleg bleibt im oben verlinkten PR1177 dokumentiert.
