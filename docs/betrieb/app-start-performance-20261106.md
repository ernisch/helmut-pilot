# App-Start: Messung und Optimierung vom 06.11.2026

Status: lokal umgesetzt und geprueft; Merge und Production offen.
Basis: `c6522a803f0b77b4c65e83354125896b813273f4`.
Branch: `codex/app-start-performance-20261106`.
[PR1078](https://github.com/ernisch/helmut-pilot/pull/1078).
Die parallele Icon-Aenderung aus PR1077 (`66ca2816`) ist integriert;
Icon-/Manifestversion bleiben erhalten, Client/CSS tragen ihre eigene neue Version.

## Ergebnis

Je fuenf kalte und fuenf warme Starts vor/nach der Aenderung. Angegeben ist
der Median bis zum ersten Browserframe mit gerenderter Navigation und
vollstaendig verborgenem Splash, gemessen ab Navigation:

| Fall | Vorher | Nachher | Ersparnis |
| --- | ---: | ---: | ---: |
| Erster Aufruf, leerer HTTP-Cache | 3.319 ms | 2.751 ms | 568 ms / 17,1 % |
| Erneuter Aufruf, gefuellter HTTP-Cache | 1.157 ms | 721 ms | 437 ms / 37,7 % |

Spannweiten kalt: vorher 3.305–3.396 ms, nachher 2.724–2.935 ms.
Warm: vorher 1.140–1.187 ms, nachher 693–765 ms.
Rohwerte, Ressourcenzeiten, Bedingungen und Quellhashes:
[Messdaten](app-start-performance-20261106.json).

Dies sind **Labormessungen**, keine Startzeiten auf dem Handy des Betreibers:
Chromium 151.0.7922.173, 390×844 Pixel, vierfache CPU-Drosselung,
100 ms Netzwerklatenz, 200.000 Byte/s Download (1,6 Mbit/s).
Echte Production-HTML-Vorlage, Client und CSS; vorhandene synthetische UI-Fixture
ueber lokalen HTTP-Server mit gzip. Feste simulierte Dienstwartezeiten von
120 ms fuer die Sitzung und 300 ms fuer die Startdaten. Keine Production-Datenbank,
kein KI-Aufruf, keine Profileingriffe. Service Worker sind blockiert;
installierte PWA, Safari/iOS und OS-Kaltstart sind dadurch nicht abgedeckt.

## Ursache und kleinste Aenderung

`hideStartupSplash()` wartete nach fertigem Rendern weitere 180 ms; danach
folgte der 280-ms-CSS-Uebergang. Gemessen blieben so rund 440–470 ms bis zur
sichtbaren Ansicht. Der Abschluss setzt jetzt die vorhandenen Fertig-Klassen
sofort. Login, Offline- und Fehleransichten nutzen denselben Abschluss.
Der Start-Watchdog und die vorgeschaltete Identitaetspruefung bleiben erhalten.

Die fuenf UI-Schriften werden als vollstaendige WOFF2-Dateien ausgeliefert:
939.184 Byte TTF werden zu 305.044 Byte WOFF2. Alle Zeichen, Konturen,
Metriken, Layout- und Variationsdaten sind erhalten. Kein Subsetting und keine
neue Schrift. Original-TTFs und Lizenzen bleiben insbesondere fuer die Verwaltung
vorhanden. Die im kalten Labordurchlauf uebertragenen Ressourcen sinken inklusive
gzip/HTTP-Headern von rund 676 kB auf 552 kB; Dokumentbytes sind darin nicht enthalten.
`font-display: swap` bleibt gesetzt. Neue Dateipfade und die bestehende
Deployment-Versionierung verhindern die Wiederverwendung alter Schrift-/CSS-Bytes.

Ein gesonderter Versuch mit `fetchpriority="high"` am Client brachte keinen
belastbaren Zusatzvorteil (Median kalt 2.806 ms, warm 746 ms) und wurde entfernt.
Serverlogik, Authentifizierung, Mandantenrechte und persoenliches Caching sind
unveraendert. Persoenliche Inhalte werden weiterhin erst nach erfolgreicher
Pruefung geladen. Verbleibende Server-/Datenbankwartezeit wird nicht kaschiert.

## Production-Messung und Grenzen

Rein oeffentliche HTTP-GETs auf `https://helmut-pilot.vercel.app`, je drei Aufrufe:
Startseite vollstaendig in 248–497 ms (Median 263 ms), nicht angemeldete
Sitzungsantwort in 200–408 ms (Median 245 ms). Das sind einzelne HTTP-Antworten
ueber den Cloud-Proxy, keine vollstaendige Startzeit und kein Nachweis der
angemeldeten Datenbanklatenz. Die ausgelieferte Shell trug `c6522a80`.

Der direkte Browserabruf scheiterte am nicht vertrauten Proxyzertifikat.
Die automatische Freigabepruefung lehnte sowohl die dauerhafte Aufnahme der
Proxy-CA in den Browser-Zertifikatsspeicher als auch einen privaten Startdatenabruf
mit Administratorschluessel ab. Beides wurde nicht ausgefuehrt und nicht umgangen.
Kein authentifizierter Production-Start gemessen. Die oeffentlichen HTTP-Messungen
und der isolierte Vergleich blieben davon unabhaengig moeglich.

## Pruefungen und Wiederholung

- `scripts/splash-boot-test.js`: 35/35; sofortige Freigabe, wiederholtes Rendern,
  Bootfehler, Offline und unveraenderter Watchdog.
- `scripts/browser-smoke-test.js`: 78/78, Desktop/Mobil, Navigation,
  Sitzungsausfall und Erholung, Quellenansichten und Orientierung.
- Zentraler Schnellkern: 14/14 Suiten bestanden.
- Fuenf Fonts mit FontTools 4.61.1/Brotli 1.2.1 konvertiert und gegen TTF geprueft:
  708/1.033/1.033/1.480/1.480 Glyphen, Zeichenabbildung, alle Konturen,
  Metriken und Layout-/Variationsdaten identisch. Die formatspezifisch entfallende
  DSIG-Tabelle ist keine Glyphenaenderung; der erste zu strikte Tabellenvergleich
  stoppte daran, bevor die korrekte semantische Pruefung erfolgreich war.
- Syntax und `git diff --check` bestanden. Im Benchmark keine unbehandelten
  JavaScriptfehler. Zusaetzlicher Prioritaetslauf: alle Fonts geladen, keine
  fehlgeschlagenen Ressourcen, mobile Sichtpruefung bestanden.
- GitHub-Pflichtchecks werden am zugehoerigen PR geprueft; diese lokalen Ergebnisse
  behaupten keinen CI- oder Production-Erfolg.

Reproduktion (vorhandenes Playwright/Chromium erforderlich, keine Installation
in Produktionsabhaengigkeiten):

```sh
HELMUT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/lokal.js -- node scripts/app-start-benchmark.js /tmp/start.json
```

Ohne `HELMUT_CHROMIUM_EXECUTABLE` verwendet Playwright seinen eigenen Browser.
`HELMUT_BENCHMARK_RUNS` begrenzt die Zahl auf 1–10, Standard 5. Kalter Kontext
pro Paar; anschliessender zweiter Aufruf desselben Kontextes nutzt den HTTP-Cache.
Browser-DNS nur fuer den lokalen Fixtureserver, ausschliesslich GET,
Production-Kennungen werden ueber den lokalen Starter entfernt.
Der lokale Browser-Smoke verwendete ebenfalls das vorhandene System-Chromium
ueber einen temporaeren Launcher, ohne die Tests oder App zu veraendern.

Risiko: Der Splash verschwindet ohne Ausblendverzoegerung; Darstellung und
Zeichenbestand bleiben erhalten. Rueckweg: diesen PR zuruecknehmen; Originalfonts
sind vorhanden. Fuer Merge und regulaeres Deployment ist nach geltender
`AGENTS.md` eine konkrete Betreiberfreigabe erforderlich. Danach dieselben
ausgelieferten Assets gegen den Merge pruefen und einen angemeldeten Start
am echten Geraet messen. Kein Lasttest oder bezahlter Modelllauf erforderlich.
