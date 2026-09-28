# Berliner Artikelstand — lokaler Offline-Beleg (28.09.2026)

Roadmap-Schritt nach dem [Berliner Originalseiten-Leser](../../lib/helmut/berlin-presseartikel.js)
(PR #675). Gegenstand ist NICHT ein Abruf, Import oder eine Aktivierung, sondern der
geschlossene Speicher-/Quellenvertrag fuer genau einen amtlichen Berliner
Presseartikel aus dem bereits gesicherten Original.

## Ausgangsbeleg

Lokales amtliches Original
`/private/tmp/helmut-landesversorgung-originale/be-bjf-kinder-jugendhilfe-20260925.html`
(sha256 `6f026cd9…b871e`), ausgewertet ausschliesslich durch
`lib/helmut/berlin-presseartikel.js`:

* URL `https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php`
* Titel „Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung“
* Publikationstag `2026-09-25` (reiner Kalendertag, keine Uhrzeit)
* Volltext sha256 `6981f4be…d24a`, erster ganzer Absatz 619 Zeichen
  (Absatzhash `43baa7c7…0826`)

## Umgesetzter Vertrag (lokal, nicht produktiv)

`lib/helmut/berlin-artikelstand.js` vergibt fuer genau diesen gepruefte Artikel eine
eigene, unveraenderliche Quellenkennung:

* Standhash = sha256([`helmut-berlin-artikelstand-v1`, kanonische URL, exakter Titel,
  Tag, Absatzhash, Volltexthash]); Rohzeile `rd-<Standhash>`, `content_hash = <Standhash>`.
* Geschlossene Metadaten in `raw.helmutBerlinArtikelstand` mit genau acht Feldern
  (Version, Herkunft, URL, Titel, Publikationstag, Absatzhash, Volltexthash, Standhash).
  Kein Volltext, kein Roh-HTML, keine fremden Raw-Felder.
* `published_at` bleibt NULL; sichtbar ist ausschliesslich der Kalendertag. Die Quelle
  liefert keine belastbare Uhrzeit, es wird keine erfunden.
* Nur der gepruefte ERSTE ganze Absatz steht unveraendert und exakt an den Absatzhash
  gebunden als `summary`; keine generische Kuerzung, kein Praefix, keine Ersatzwahl.
* Der Stand fuehrt durch dieselben bestehenden Wege: Import/Dedup
  (`dedup.js`, `quellenarchitektur/dedup-global.js`), Speicherprojektion
  (`storage.js`-Leser, eigener PostgREST-Alias `berlin_artikelstand`), Lage-Quellenbeleg
  (`lage-quellenbeleg.js`, ganzer Berliner Publikationstag im Fenster) und sichtbares
  Datum (`quellen-zeitvertrag.js`, `lage.js`-Quellenzeile ohne Uhrzeit).

Die bestehenden Leser fragen den passenden Namespace ueber die neue, rein lesende
Weiterleitung `lib/helmut/artikelstand.js`. Der Bundestags-Artikelstand ist fachlich
unveraendert: eigener Namespace, eigenes Feld, eigene Kennung, unveraenderte Schwellen.

## Abnahme (offline)

`node scripts/berlin-artikelstand-test.js` (kein Netz, keine DB, kein Modell;
In-Memory-PostgREST-Attrappe fuer die echten Storage-Leser und -Schreibwege):
**25 Pruefgruppen erfolgreich**, darunter die echte Originalprobe mit 619 Zeichen,
die fertige Lageeingabe und die sichtbare Quellenzeile der Lage-Karte mit
„25. September 2026“ ohne `publishedAt`-Uhrzeit. Negativtests decken Drift (Stand-Metadaten, Titel, Tag,
URL, Absatz-/Volltexthash, manipulierte summary) und Zeit (Uhrzeit widerspricht dem
Tag, Randtage, DST, Zukunft/heute) ab. Zusaetzlich gruen: `bundestag-artikelstand-test.js`
(33), `lage-quellenfenster-test.js` (13), `lage-quellenbindung40-test.js` (11),
`lage-quellenbeleg-test.js`, `quellen-zeitvertrag-test.js`, `dedup-*-test.js`.
Zwei Versionen derselben URL werden auch in der Lage-Quellenanzeige anhand ihrer
verschiedenen Belegkennungen und Publikationstage getrennt.

Der neue Test ist bewusst NICHT in der Pflichtmenge `STANDARD` eingetragen (wie sein
Bundestags-Pendant). Er laeuft ueber die Bereichsauswahl (`berlin`, `quellen`, `lage`)
und ueber `--extended`. In dieser Arbeitsumgebung koennen Suiten, die einen lokalen
HTTP-Server binden, nicht laufen (Sandbox: `listen EPERM`); das betrifft die
vorbestehenden Standard-Suiten `store-cas`, `tenant-neutrality`, `p1-security-check`
und weitere, nicht diesen neuen Vertrag.

## Nicht umfasst

Der oben beschriebene Offline-Vertrag umfasste keinen Live-Abruf, keinen
Production-Import, keine Aktivierung, keinen 500er Test und keine
Production-Datenaenderung. Beim Offline-Test wurden keine Profile versorgt.
Die Offline-Zielkohorte bleibt 485/15 und ist nicht importfreigegeben. Der Berliner
Leser ist weiterhin nicht an einen Live-Crawl oder ein freigegebenes Landesmodul
angeschlossen; der produktive Versorgungsnachweis steht aus.

## Einzelabruf des amtlichen Artikels (28.09.2026)

Der eng begrenzte Adapter `lib/helmut/berlin-presseartikel-abruf.js` ruft nur eine
vorab gepruefte Berlin.de-Pressearchiv-Artikeladresse ueber den bestehenden
anbietergebundenen Crawler ab. Der Crawler liefert den beobachteten HTTP-Status
nur auf ausdrueckliches Opt-in; alle bisherigen Aufrufer behalten ihre bisherige
Antwortform. Fremde Hosts und abweichende finale Adressen werden abgewiesen.
Der Adapter gibt nur den minimierten Artikelstand zurueck, kein HTML und keinen
Volltext.

Ein einmaliger rein lesender HTTP-Abruf des obigen amtlichen Artikels um
03:26 UTC ergab einen gueltigen Stand mit Publikationstag `2026-09-25`,
Volltext-SHA256 `6981f4be2aba74e8a8372aa29f0317c8193596111bc2ea448e86b4302a64d24a`
und genau 619 Zeichen im ersten Absatz. Das stimmt mit dem gesicherten Original
ueberein. `node scripts/berlin-presseartikel-abruf-test.js` pruefte 32 synthetische
und lokale Originalfaelle; `anbietersteuerung-fachpfad-test.js` 52 Faelle.
Auch dieser Einzelabruf war kein Crawl, Import oder produktiver Versorgungsnachweis.
Der Live-Quellenweg und die Landesmodulfreigabe bleiben offen.

## Fundweg fuer den amtlichen Senatsblock (28.09.2026, lokal)

Der bisher fehlende enge Fundweg fuer AKTUELLE amtliche Berliner Senatsmeldungen ist
als eigener, rein lokaler Entdecker umgesetzt:
`lib/helmut/berlin-senat-entdeckung.js`.

Eingang sind genau vier beobachtete Felder (`url`, `finalUrl`, `http`, `html`). Der
Parser macht KEIN Netz. Er akzeptiert nur das amtliche Presseportal
`https://berlin.de/presse/` bzw. `https://www.berlin.de/presse/` mit beobachtetem
HTTP 200 und passender finalUrl, ohne fremden Host, Port, Benutzerinfo, Query oder
Tracking. Abgegrenzt wird genau der sichtbare H2 „Aktuelle Mitteilungen des
Presse- und Informationsamts und der Senatsverwaltungen“ samt seiner geschlossenen
UL und deren geschlossenen LI. Die nachfolgenden Bezirksaemter- und sonstigen
Meldungen werden nicht eingelesen; jede Fundstelle muss zudem die amtliche
Behördenkategorie des Presseamts oder einer Senatsverwaltung tragen. Sie enthaelt
den amtlichen relativen Link (absolut aufgeloest), den exakten Titel und den REINEN
Kalendertag; die Listenuhrzeit („13:05 Uhr“) ist keine belegte UTC-Publikationszeit
und erscheint nirgends im Ergebnis.

Nur Adressen, die der bestehende Einzelabruf (`berlin-presseartikel-abruf.js`)
unterstuetzt, sind als `weiterreichbar: true` markiert. Die uebrigen Berliner
Artikelpfade bleiben als klar ausgewiesene, NICHT abrufbare Treffer mit
Skipgrund `pressearchiv-adresse-fehlt` erhalten — niemals als erfolgreiche
Versorgung. Fail closed bei verborgener/ausbrechender/injizierter Struktur,
doppelten oder mehrdeutigen Bloecken, ungeschlossenen Elementen, ungueltigen
Kalendertagen, unzulaessigen Links sowie Duplikaten.

Lokales amtliches Original
`/private/tmp/helmut-berlin-portal-20260928.html` (28.09.2026 05:12 UTC, HTTP200,
sha256 `1cb44dda…fac8`) liefert genau sechs eigene Senatstreffer, davon drei
weiterreichbare Pressearchivlinks und drei offene Pfade. Die bekannte BJF-Fundstelle
`https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php`
stimmt mit Titel „Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen
Fahrplan und verlässliche Finanzierung“ und Tag `2026-09-25` exakt mit dem bereits
gesicherten Artikel ueberein. Der im HTML verlinkte RSS-Feed
(`https://www.berlin.de/presse/index.php/rss`) lieferte einen leeren channel ohne
item und wird deshalb NICHT als Vollfeed behauptet.

`node scripts/berlin-senat-entdeckung-test.js` (kein Netz, keine DB, kein Modell)
pruefte die Originalseite, 35 synthetische Negativfaelle und eine Offline-Verkettung
einer entdeckten BJF-Fundstelle ueber `ladePresseartikelStand` mit injizierter
Originalantwort: **55 Pruefungen erfolgreich**. Ohne die lokalen `/private/tmp`-
Originale laeuft derselbe Test CI-tauglich mit **45 Pruefungen** (Originalproben
werden uebersprungen und ausdruecklich gemeldet). Der Test wird ueber die bestehende
Bereichsauswahl (`landesmodule-pardok` / `berlin`) mitgefahren; die Pflichtmenge
`STANDARD` bleibt unveraendert.

Nicht umfasst: kein Live-Crawl-Hook, kein Netzabruf im Parser, kein Import, keine
Aktivierung, kein 500er Test, keine DB-/Production-/Env-/Cron-Wirkung und keine
Profilversorgung. Das bestehende Landesmandatsgate, der Source-Mode, die
Crawl-Quellen, Produktpfade und bestehenden Vertraege bleiben unveraendert.
