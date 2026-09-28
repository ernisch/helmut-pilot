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

Kein Live-Abruf, kein Production-Import, keine Aktivierung, kein 500er Test und
keine Production-Datenaenderung. Beim Offline-Test wurden keine Profile versorgt.
Die Offline-Zielkohorte bleibt 485/15 und ist nicht importfreigegeben. Der Berliner
Leser ist weiterhin nicht an einen Live-Crawl oder ein freigegebenes Landesmodul
angeschlossen; der produktive Versorgungsnachweis steht aus.
