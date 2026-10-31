# Helmut Verwaltung — isolierte Fassung

Vier Bereiche: **Überblick, Profile, Betrieb, Kunden**. Helle Oberfläche mit
Systemschrift, klaren Hinweisen, Suche, Filtern und Profilseiten zu je 20 Einträgen.
Auf schmalen Bildschirmen werden Tabellen zu Karten. Keine neue Abhängigkeit.

## Was funktioniert

- Überblick: Profilzahlen, vorhandene Konten, ehrliche Kostenanzeige,
  Handlungsbedarf aus bestehenden Profil-/Quellenprüfungen und letzte Abläufe.
- Profile: Suche nach Name/Region/Partei, Aktiv-/Problemfilter, Seitenwechsel,
  Detailansicht mit vorhandenen Mandatsdaten und fehlenden Angaben.
- Betrieb: Abläufe, Quellenhinweise und Kosten getrennt und verständlich.
- Kunden: Konten, manuell gepflegte Preise/Zahlungsstände und Zugang;
  „pausiert“ wird ausdrücklich nicht mit „gesperrt“ verwechselt.
- Unbekannte Daten bleiben offen. Profilvollständigkeit, Prozessabschluss
  und fachliche Ergebnisqualität sind verschiedene Aussagen.
- Lade-/Leer-/Fehlerzustände, erneutes Laden, 401/403, Tastaturnavigation,
  Sprunglink und reduzierte Bewegung sind berücksichtigt.

## Isolation und Grenzen

Diese Dateien werden vom bestehenden Helmut-Server **noch nicht ausgeliefert
oder eingebunden**. `server.js`, `client.js`, `styles.css`, Motor, Auth, Storage,
Kunden-UI, Flags und CI-Konfiguration bleiben unverändert. Kein Deployment.
Der bestehende Motor wird auch in der Vorschau nicht importiert oder gestartet.

`index.html` startet ausschließlich `vorschau.mjs` mit klar gekennzeichneten,
vollsynthetischen Beispielen. Kein Umschalten per Queryparameter, kein
Live-Fallback und kein Netzwerkbedarf in der exportierten Offline-Datei.

Die Einbindung in die echte Verwaltung ist ein späterer Integrationsschritt.
Auch eine fertige Tagesbilanz pro Profil/Tag, fachliche Qualitätsurteile,
Bearbeitungs-/Lösch-/Recoveryaktionen und eine Rechnungsverwaltung sind hier
nicht implementiert. Der bestehende, auf 25 Kontoprofile begrenzte Datenstatus
wird nicht als vollständiger Ergebnisnachweis zweckentfremdet.

## Vorhandener Datenvertrag

`app.mjs` nimmt einen expliziten Leser `{ read(key, id), clear(), dispose() }`.
Für eine spätere **eigene Admin-Seite** kann `createAdminReader()` aus
`api.mjs` eingebunden werden. Das ist ein Browserclient, kein zweites Backend.
Sein gesamter erlaubter Anschluss:

| Schlüssel | Bestehende Route |
| --- | --- |
| `overview` | `GET /api/admin/overview` |
| `budget` | `GET /api/admin/stats/budget-today` |
| `customers` | `GET /api/admin/customers` |
| `sources` | `GET /api/admin/sources-status` |
| `runs` | `GET /api/admin/stats/process-runs?limit=20` |
| `profile`, Kennung | `GET /api/admin/profile/:id` |

Nur same-origin GET mit vorhandenen Sessioncookies; kein Secret im Browser,
keine frei wählbare Zieladresse, keine Schreibmethode. Die vorhandene
serverseitige Adminprüfung bleibt maßgeblich. Es gibt keine zweite
Authentifizierung. Zeitlimit und Abbruch sind begrenzt; erfolgreiche Antworten
werden bis zum expliziten Aktualisieren wiederverwendet. Kein Polling.

Tageskosten kommen ausschließlich aus `kostenwahrheit.gesamt`, nicht aus
Altsummen, die unbekannte Preise als null behandeln. Unbekannte Beträge
erscheinen als „Offen“. Der vorhandene Monatswert ist nur ein bekannter
Schätzbetrag und wird als solcher beschriftet. Kein erfundener USD-Budgetbalken.
Mandatsebene wird nicht aus einem Bundesland geraten. Die direkte
Profildetailroute liefert die vorhandenen Ebenenfelder.

Die eigene CSS-Datei gehört zu dieser separaten Admin-Seite. Sie wird nicht
zusätzlich in die bestehende Kunden-SPA geladen. Vor späterer Einbindung
Assetauslieferung, Session-/Rollenprüfung, Cacheversion und API-Shapes gemeinsam
mit Motor-/UI-Verantwortung abstimmen; keine dieser Änderungen jetzt vornehmen.

## Lokal ansehen und gezielt prüfen

Im isolierten Checkout, ohne Production-Zugangsdaten:

```sh
node scripts/lokal.js scripts/verwaltung-vorschau.js --port 8787
```

Dann `http://127.0.0.1:8787` öffnen. Der Server bindet ausschließlich Loopback
und hat eine feste Assetliste. Er vermittelt keine API-/Production-Anfragen.

Eine einzelne HTML-Datei ohne externe Abhängigkeiten exportieren:

```sh
node scripts/lokal.js scripts/verwaltung-vorschau.js --export /tmp/helmut-verwaltung.html
```

Bestehende Zieldateien werden dabei nicht überschrieben.

```sh
node scripts/lokal.js scripts/verwaltung-isoliert-test.js
```

Nur die schnellen Anzeige-/API-Verträge, ohne Browserstart:

```sh
node scripts/lokal.js scripts/verwaltung-isoliert-test.js --contracts-only
```

Der Test prüft Anzeigeverträge, GET-Allowlist, manipulierte Kennungen,
401/403/500, unbekannte Kosten, XSS, Paging, Suche und Detailnavigation.
Eine einzige vorhandene Chromium-Instanz wird mit eigenem temporärem Profil
gegen einen eigenen Loopback-Testserver gestartet und wieder geschlossen.
Browser → echter neuer API-Client → synthetische bestehende Antwortverträge →
Anzeige wird physisch geprüft; keine echte Datenbank oder Production-Anfrage.
Desktop und 390/360/320 Pixel sowie die Offline-HTML werden geprüft.
Keine Installation und kein 500er-/Lasttest. Belege standardmäßig unter
`/tmp/helmut-verwaltung-belege`, optional über `HELMUT_VERWALTUNG_BELEGE`.
