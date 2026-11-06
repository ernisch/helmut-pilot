# App-Start: Messung und Optimierung vom 06.11.2026

Status: nach ausdruecklichem Betreiber-GO gemergt und auf Production verifiziert.
Das Gesamtziel eines sehr schnellen Starts bleibt wegen der gemessenen Serverlatenz offen.
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

## Freigegebener Rollout und echte Servermessung

PR1078 nach beiden erfolgreichen Pflichtchecks auf Kopf `04c97f9a` gemergt:
`647f0420d6606cbd01a628cc2c880c06a0a9dddf`, 06.11.2026 11:47:48 UTC.
CI42207899107:181/181 Standard- und336/336 Bereichssuiten sowie Browsercheck
und native Datenbankpruefungen erfolgreich. Productiondeployment
`dpl_5CHy6AchhWCkGM9r3bowRmB4bHVd` READY, Hauptdomain liefert diese Version.
Client, CSS und alle fuenf WOFF2-Dateien bytegleich mit dem geprueften Git-Stand.

Nach dem ausdruecklichen GO wurden drei geschuetzte GET-Startabrufe gemessen:
12.323,8.997 und9.557 ms (Median9.557 ms), jeweils HTTP200 und gueltiger
Startvertrag,231.599 Antwortbytes. Das ist nur der Serverabruf ueber den
Cloud-Proxy mit Administratorschluessel, keine komplette Android-Startzeit
und keine Messung der vorgeschalteten Nutzersitzung. Eine vierte rein lesende
Strukturdiagnose brauchte11.385 ms: Briefing und Lage verfuegbar, kein
Lage-Fehler/Timeout-Sentinel,10 Karten, Narrativ ausdruecklich ausstehend.
Keine persoenlichen Antwortinhalte gespeichert oder veroeffentlicht.

Die neuen Productionwerte zeigen einen wesentlich groesseren Restengpass
als die UI-Verzoegerung. Die Laborverbesserung darf deshalb nicht als
Startzeit der installierten Android-App ausgegeben werden. Im Servercode
folgen Briefingaufbereitung, Lageaufbereitung und Nebenabfragen nacheinander.
Welcher konkrete Datenbankzugriff dominiert, ist noch nicht phasenweise
belegt; keine ungemessene Ursache als erwiesen darstellen.
Naechster fachlicher Schritt: den geschuetzten Startpfad phasenweise messen
und die belegten seriellen/doppelten Lesezugriffe gezielt reduzieren.
Keine Cache-, Frische- oder Zugriffssperre dafuer lockern.

Zusaetzlich fuer den Android-Anwendungsfall: zwei lokale Chromium-Paare mit
echtem Service Worker. Bei jedem warmen Aufruf kommen Client/CSS durch den
Worker, alle fuenf WOFF2-Fonts liegen im Cache, keine API-/Navigationsantwort
wird gespeichert, keine JS-Fehler. Funktionaler Cachebeleg, keine Android-
Geraetemessung; Worker-Netzwerk wird von CDP nicht gleichwertig gedrosselt,
daher keine Vermischung dieser Zeiten mit dem Laborvergleich.

Rueckweg: vorheriges Productiondeployment
`dpl_F32oCR4qDFyKUFMzrBFfozms8Js5` auf`66ca2816`.
Die Nachkontrolle aktualisiert nur diese Dokumentation, nicht die Runtime.


## Server-Optimierung, 06.11.2026 (lokal fertig, noch nicht live)

Nutzerauftrag nach unveraendert langsamem Android-Start: den Serverabruf
beschleunigen. Branch `codex/server-start-performance-20261106`, Basis
`0e0b48b6`. Keine Migration, Konfiguration, Datenmutation oder Modellaufrufe.

Drei kleine Aenderungen:

- Nach unveraenderter Autorisierung und Profilaufloesung Briefing, Lage,
  Aufgaben, Notizen und Datenstand parallel lesen. Lage weiterhin `cacheOnly`,
  8-Sekunden-Sicherheitsfrist und ehrlicher Fehlersentinel erhalten.
- Briefingquellen mit dem bestehenden geprueften Sammelleser laden (25 Vorgange
  je Abfrage, gleiche maximal40 Kanten pro Vorgang, Projektion und Sortierung).
  Bei Batchfehlern bleibt der bisherige Einzelpfad als Rueckfall erhalten.
- Lage-Quellenmetadaten in hoechstens vier disjunkten Kennungsgruppen parallel
  lesen. Seiten, Zeitfenster, Standvalidierung und Mengenlimits unveraendert.
  Ausgabe bleibt geordnet; kein Teilergebnis bei einer gescheiterten Gruppe.

`Server-Timing` liefert feste Phasennamen und Millisekunden fuer die spaetere
Live-Nachkontrolle. Keine IDs, privaten Inhalte oder Secrets. `start` beginnt
am Profilabruf, nach der Sitzungs-/Mandatsaufloesung; kein kompletter Handywert.

### Gemessener Serverablauf mit echten Nurlesezugriffen

Lokaler Node24-Prozess, echte Serverfunktionen und Supabase-GETs ueber den
Umgebungsproxy; Transport hat alle Schreibmethoden und andere Ziele gesperrt.
Keine Antworttexte/Profile gespeichert oder ausgegeben, nur Metadaten.
Drei Durchlaeufe vorher und nachher, jeweils zehn Lagekarten im Ergebnis.

| Messung | Vorher | Nachher |
| --- | ---: | ---: |
| Gesamter Datenbau, Median | 15,041 s | 5,746 s |
| Einzelwerte | 16,291 / 15,041 / 14,854 s | 5,746 / 6,331 / 5,501 s |
| Briefingbau, Median | 4,033 s | 1,873 s |
| Lage, Median | 8,288 s | 5,467 s |
| Datenbankabrufe | 114 je Lauf | 59 / 55 / 59 |

Das sind **keine Produktions-HTTP- oder Android-Zeiten**. Der Diagnoseaufbau
misst den vollstaendigen Datenbau ohne Lage-Abbruchfrist, liest das Profil direkt
und laesst die Sitzung aus. In Production bleibt die8s-Frist unveraendert.
Der vorhandene kurze Storecache traf im zweiten Nachher-Lauf; kein neuer Cache
wurde eingefuehrt. Netzstandort und Parallelitaet beeinflussen Einzelzeiten.
Die Datenbank ist veraenderlich; gleiche Kartenanzahl ist kein bytegleicher
Inhaltsnachweis. Die Quellenvertraege sind separat mit synthetischen Daten geprueft.
Der vorherige Live-Befund9–12s bleibt bis zur Nachkontrolle des neuen Deployments
massgeblich. Verbleibende Kosten: Lage-Quellen-/Cachepruefung und grosse Store-Reads.

### Abnahme und Freigabegrenze

Lokal bestanden: Appstart5/5 Gruppen (Parallelstart erst nach Profil, Fehler,
Mandat, Cachehit/-miss, null Modellstarts, sichere Zeitheader), Quellenfenster15/15
(inklusive501 IDs, vertauschter Antwortfolge, maximal4 parallelen Reads und
Gruppenausfall), Quellenstapel225 identische Eingaben plus Server-Batch/Rueckfall,
Startausfaelle26/26, Lage-cacheOnly9/9, Cross-Tenant41/41; Syntax sauber.
Unabhaengiger lesender Code-Review ohne Blocker. Eine alte Quellenfenster-Testannahme
zur seriellen Anfragereihenfolge schlug zuerst fehl; sie prueft jetzt denselben
Umfang ohne diese absichtlich geaenderte Reihenfolge, Ergebnisordnung separat geprueft.
Ein erster lokaler HTTP-Test wurde von der Sandbox am Listen gehindert und
mit erlaubtem Netzwerkzugriff erfolgreich ausgefuehrt.

Pflicht-CI wird am PR-Kopf geprueft. Der konkrete neue Merge/Production-Rollout
ist noch nicht freigegeben. Nach gruenen Checks: genau diesen PR freigeben,
regulaer ausrollen und drei geschuetzte GET-Startabrufe samt Server-Timing messen.
Risiko: kurzfristig mehr gleichzeitige Reads, begrenzt; kein zusaetzlicher Daten-
oder Modellpfad. Rueckweg: PR revertieren oder vorheriges READY-Deployment nutzen.
