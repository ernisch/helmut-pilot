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

Nur Adressen, die VORAB entweder der bestehende Pressearchiv-Einzelabruf
(`berlin-presseartikel-abruf.js`) ODER der Sondervorlagen-Einzelabruf
(`berlin-presse-sondervorlagen-abruf.js`) akzeptiert, sind als `weiterreichbar: true`
markiert. `abrufzielFuer(url)` nennt pro Treffer genau das passende sichere Abrufziel
(`pressearchiv` oder `sondervorlage`) samt gepruefter Adresse und Host `berlin.de`; das
Schema der Fundstelle (`url`, `titel`, `publikationstag`, `weiterreichbar`, `grund`)
bleibt unveraendert. Nicht unterstuetzte oder fremde Berliner Artikelpfade bleiben als
klar ausgewiesene, NICHT abrufbare Treffer mit dem unveraenderten Skipgrund
`pressearchiv-adresse-fehlt` erhalten — niemals als erfolgreiche Versorgung. Der
amtliche H2-/UL-/LI-/Behoerden-/Datums- und Hostschutz bleibt unveraendert. Fail
closed bei verborgener/ausbrechender/injizierter Struktur, doppelten oder mehrdeutigen
Bloecken, ungeschlossenen Elementen, ungueltigen Kalendertagen, unzulaessigen Links
sowie Duplikaten; es gibt keine neue URL-Familie und kein allgemeines Berlin-Gate.

Lokales amtliches Original
`/private/tmp/helmut-berlin-portal-20260928.html` (28.09.2026 05:12 UTC, HTTP200,
sha256 `1cb44dda…fac8`) liefert genau sechs eigene Senatstreffer — exakt **6/6
weiterreichbar**: drei Pressearchivlinks und drei Sondervorlagenlinks
(RBMSKZL 1717887/1717654, SenWEB 1717406). Pro Treffer wird das passende sichere
Abrufziel identifiziert; die Sondervorlagenadressen werden nur vom Sondervorlagen-
Einzelabruf akzeptiert, die Pressearchivadressen nur vom bestehenden Pressearchiv-
Abruf (jeweils gegenlaeufig fail closed). Die bekannte BJF-Fundstelle
`https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php`
stimmt mit Titel „Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen
Fahrplan und verlässliche Finanzierung“ und Tag `2026-09-25` exakt mit dem bereits
gesicherten Artikel ueberein. Die drei Sondervorlagen-Fundstellen tragen dieselben
Titel und reinen Kalendertage wie die bereits gesicherten Originale. Der im HTML
verlinkte RSS-Feed (`https://www.berlin.de/presse/index.php/rss`) lieferte einen
leeren channel ohne item und wird deshalb NICHT als Vollfeed behauptet.

`node scripts/berlin-senat-entdeckung-test.js` (kein Netz, keine DB, kein Modell)
pruefte die Originalseite, synthetische Positiv-/Negativfaelle fuer beide
Sonderfamilien und nicht unterstuetzte/fremde Pfade sowie Offline-Verkettungen mit
injizierten Antworten: die entdeckte BJF-Fundstelle ueber `ladePresseartikelStand`
und die drei echten Sondervorlagen ueber die entdeckte Fundstelle ->
`ladeSondervorlage` (injizierte Originalantwort) ->
`erzeugeSondervorlagenstand` mit demselben eingefrorenen Leserbeleg.
Ergebnis: **88 Pruefungen erfolgreich**. Ohne die lokalen `/private/tmp`-Originale
laeuft derselbe Test CI-tauglich mit **57 Pruefungen** (Originalproben werden
uebersprungen und ausdruecklich gemeldet). Der Test wird ueber die bestehende
Bereichsauswahl (`landesmodule-pardok` / `berlin`) mitgefahren; die Pflichtmenge
`STANDARD` bleibt unveraendert und die bestehende Pressearchiv-Probe
(`berlin-presseartikel-abruf-test.js`, 32 Pruefungen) bleibt unveraendert.

Fuer die drei echten Sondervorlagen wurde offline belegt: der Einzelabruf laeuft nur
auf die entdeckte amtliche Adresse (Hostbindung `berlin.de`, `meldeStatus`), Titel und
reiner Tag aus der Fundstelle stimmen exakt mit dem Originalbeleg ueberein, und der
Stand traegt eine eigene Sondervorlagen-Identitaet (`berlin-de-senatsvorlage`,
eigener Hash-Namespace) mit `published_at = null`, ohne Volltext und ohne HTML im
Rohdokument. Abweichender Titel oder Tag brechen fail closed ab.

Nicht umfasst: kein Live-Crawl-Hook, kein Netzabruf im Parser, kein Production-Import, keine
Aktivierung, kein 500er Test, keine DB-/Production-/Env-/Cron-Wirkung und keine
Profilversorgung. Die Sondervorlagen-Verknuepfung ist eine reine Offline-Verprobung
mit injizierter Originalantwort, kein produktiver Versorgungsnachweis. Das bestehende
Landesmandatsgate, der Source-Mode, die Crawl-Quellen, Produktpfade, Profile und
Schwellen sowie bestehenden Vertraege bleiben unveraendert.

## Zwei weitere Senatspfadfamilien — eigener Original- und Auszugleser (28.09.2026, lokal)

Die drei offenen Portal-Links der amtlichen Presseuebersicht gehoeren zwei Pfadfamilien
ausserhalb des Pressearchivs. Fuer sie gilt ein EIGENER, eng begrenzter Vertrag in
`lib/helmut/berlin-presse-sondervorlagen.js`; der bestehende Pressearchiv-Vertrag
(`berlin-presseartikel.js`) bleibt unveraendert und weist diese Adressen weiterhin bewusst
mit `berlin-presseartikel-pressearchiv-pfad-ungueltig` ab.

Zugelassen sind genau:

* `https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/<jahr>/pressemitteilung.<nr>.php`
* `https://www.berlin.de/sen/web/presse/pressemitteilungen/<jahr>/pressemitteilung.<nr>.php`

Eingang sind genau vier beobachtete Felder (`url`, `finalUrl`, `http`, `html`). Der Parser macht
KEIN Netz, keinen Crawl und hat keine Datei-, DB-, Modell- oder Productionwirkung. Er verlangt
HTTPS auf berlin.de/www.berlin.de ohne Port, Benutzerinfo, Query/Tracking und Fragment, die
Gleichheit von Eingabe-, finaler und EINZIGER kanonischer Adresse, das Jahr aus `dcterms.date`
gebunden an den Pfadabschnitt, den eigenen H1 in der herounit, den Datumssatz in genau einem
geschlossenen `p.pressnumber`, genau eine geschlossene `div.textile` nach dem Pressnumber und vor
`layout-grid__area--marginal` sowie ausschliesslich volle geschlossene `<p>`-Absaetze. PDF-
Downloadmodul, Kontaktblock, Skripte, Kommentare, versteckte Huellen, ausbrechende Absatzgrenzen
und fremde Restinhalte in der Textile brechen ab beziehungsweise werden nie Artikeltext.

Ausgang (eingefroren): URL, Pfadfamilie, Titel, reiner Publikationstag, vollstaendiger Artikeltext,
Volltext-Hash, HTML-Hash und ein EXAKTER ganzer Auszugsabsatz mit eigenem Hash. Die Auszugsregel
ist an die belegte Familie gebunden und nicht generisch umschaltbar: bei RBMSKZL ist der erste
Absatz exakt „Das Presse- und Informationsamt des Landes Berlin teilt mit:“ und der Auszug der
zweite Absatz; bei SenWEB ist der Auszug der erste Sachabsatz. Keine Kuerzung, keine Ersatzwahl,
keine erfundene Uhrzeit; `published_at` bleibt NULL.

### Lokal lesbar (belegte Originale vom 28.09.2026)

| Familie | Original SHA256 | Tag | Volltext | Volltext-Hash | Auszug | Auszug-Hash |
|---|---|---|---|---|---|---|
| RBMSKZL 1717887 | `9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa` | 2026-09-24 | 3697 Zeichen | `9e1585014f7cb356d8cbca73890844e365e567d4c6c2df7f8af0ab8486c7a717` | 625 Zeichen | `153a969abbc83e4a950d35576ac2cf5e374ee664d9f7d5abf25d70e9084174e0` |
| RBMSKZL 1717654 | `41ee95dc3ad942cf7ec3a1b1da5558cd077ee02e8082f63352aefb5634583b0b` | 2026-09-23 | 524 Zeichen | `11bc0281aca9889959c79787b632f62e2dbfc4d89f2c2b93ac29bc4cd4a35a01` | 344 Zeichen | `5b63aa886d825b60a66bc6f1a8d37229cf62355861c541ac9ef9e09b30522f16` |
| SenWEB 1717406 | `987f3aef0890eff51caef25bc14671116c98bf7faf5ead1b3a211cfeeb569bbd` | 2026-09-23 | 3288 Zeichen | `ca1c84b76bd7acfae7c02d36f69b254c9b224b4f325900c23f3801d29de7bd1e` | 240 Zeichen | `d4730d568e526b5a656cb958c9fd05c7d49c565f5ee2b6ba969292142eb0bdf1` |

Die drei Portallistendaten stimmen mit den drei einzeln geprueften Originaltagen ueberein;
eine Uhrzeit ist damit nicht belegt und wird nirgends als UTC-Publikationszeit behauptet.

`node scripts/berlin-presse-sondervorlagen-test.js` (kein Netz, keine DB, kein Modell) prueft beide
Pfadfamilien mit synthetischen Positiv- und Negativfaellen — fremde/falsche URL, Canonical-,
Titel- und Tagesdrift, versteckte Eltern, kommentierte Doppler, ausbrechende Textile-/Absatzgrenzen,
PDF-/Kontakt-Leak, fehlende Absenderformel, fehlender Sachabsatz, zu langer Auszug und
Hash-Abweichungen — sowie die drei lokalen Originale: **81 Pruefungen erfolgreich** mit den
`/private/tmp`-Originalen, **69** ohne sie (Originalproben werden dann als SKIP gemeldet und der
Test bleibt CI-tauglich ohne `/private/tmp`). Der Test laeuft ueber die bestehende Bereichsauswahl
(`landesmodule-pardok` / `berlin`); die Pflichtmenge `STANDARD` bleibt unveraendert.

### Trennung: lokal lesbar ist nicht produktiv versorgt

„Lokal lesbar“ bedeutet ausschliesslich: die zwei belegten Pfadfamilien sind offline aus dem
gesicherten Original belegbar, und fuer die drei Originale sind Volltext, Tag und Auszug
reproduzierbar. Es bedeutet NICHT: produktive Versorgung. Es gab in diesem Sprint keinen
Live-Crawl, keinen Netzabruf, keinen Import, keine Aktivierung, keinen 500er Test, keine
DB-/Storage-/Lage-Aenderung, keine Profilversorgung und keine Production-Wirkung. Der Leser ist
nicht an den Live-Quellenweg, an Storage oder an ein Landesmodul angeschlossen; die produktive
Versorgung der Berliner Landesebene bleibt offen und braucht weiterhin ihre eigene Freigabe.

## Einzelabruf fuer die zwei Senatspfadfamilien (28.09.2026, lokal)

`lib/helmut/berlin-presse-sondervorlagen-abruf.js` ist der kleinste, ausdruecklich einzeln
aufzurufende HTTP-Einzelabruf fuer genau die zwei Pfadfamilien aus
`berlin-presse-sondervorlagen.js`. Er prueft die Adresse VOR jedem Abruf: nur HTTPS auf
`berlin.de`/`www.berlin.de` ohne Benutzerinfo, Port, Query/Tracking, Fragment oder Trailing-Slash
und nur `.../pressemitteilungen/<jahr>/pressemitteilung.<nr>.php` der beiden belegten Familien.
Ein fremder Host oder Pfad wird nie angefragt. Der Abruf laeuft ueber die bestehende
Anbietersteuerung `crawler.fetchUrl` mit `allowedHost = berlin.de` und `meldeStatus = true`; die
beobachteten Werte Status, `finalUrl` und HTML gehen unveraendert an `pruefeSondervorlage`
({url, finalUrl, http, html}). Nur ein tatsaechlich beobachteter 200 und ein geschlossenes
Leserergebnis fuehren zu `{ok:true, vorlage}`; sonst fail closed mit kleinen, benannten Gruenden
(`abrufziel-ungueltig`, `hostwechsel`, `http-status`, `anbietergrenze`, `abruf-fehlgeschlagen`
oder der jeweilige Lesergrund). Kein eigener Netzweg, kein Speichern, keine Uhrzeit aus dem
Publikationstag; Pressearchiv-Adapter/-Leser, Crawler, Source-Mode, Landesschutzgate,
Qualitaetsschwellen und Rollen bleiben unveraendert.

`node scripts/berlin-presse-sondervorlagen-abruf-test.js` faehrt ausschliesslich injizierte
Abrufe (kein Netz): positive Proben beider Familien, Vorab-URL-Ablehnung ohne Abruf, falsche
finale URL, fehlender/falscher HTTP-Status, fremder Hostredirect, ungueltiges HTML,
Anbietergrenze sowie — falls vorhanden — die drei lokalen Originale (kein Kontakt/PDF, keine
erfundene Uhrzeit): **45 Pruefungen** mit den `/private/tmp`-Originalen, **36** ohne sie
(Originalproben werden dann als SKIP gemeldet und der Test bleibt CI-tauglich). Der Test laeuft
ueber die bestehende Bereichsauswahl (`landesmodule-pardok` / `berlin`); die Pflichtmenge
`STANDARD` bleibt unveraendert.

Dieser Einzelabruf ist KEINE produktive Versorgung: es gab keinen Live-Crawl, keinen Netzabruf
in diesem Helferlauf, keinen Import, keine Aktivierung, keinen 500er Test und keine
DB-/Storage-/Lage-Aenderung. Er ist nicht an den Live-Quellenweg, Storage oder ein Landesmodul
angeschlossen und wird von nichts automatisch aufgerufen.

Eine einmalige rein lesende Gegenprobe des Einzelabrufs um 06:27 UTC lieferte fuer
`pressemitteilung.1717887.php` den belegten Publikationstag `2026-09-24`,
HTML-SHA256 `9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa`
wie das gespeicherte Original und den vollen Auszugsabsatz mit 625 Zeichen.
Dabei wurde nichts gespeichert oder als produktive Landesversorgung gewertet.

## Standvertrag fuer die zwei Senatspfadfamilien (28.09.2026, lokal)

Bisher waren die zwei neuen Senatsvorlagen nur offline lesbar; es fehlte fuer sie eine sichere
Stand-/Speicheridentitaet. `lib/helmut/berlin-artikelstand.js` traegt jetzt einen ZWEITEN, streng
getrennten Standzweig fuer das bereits eingefrorene Ergebnis aus
`lib/helmut/berlin-presse-sondervorlagen.js`:

* Eigene Herkunft `berlin-de-senatsvorlage` und eigener Hash-Namespace
  `helmut-berlin-sondervorlagenstand-v1`; Standhash = sha256([Namespace, kanonische URL,
  exakter Titel, Tag, Absatzhash, Volltexthash]), Rohzeile `rd-<Standhash>`,
  `content_hash = <Standhash>` — derselbe Kennungs-/content_hash-Schutz wie beim Pressearchiv.
* Dieselben acht geschlossenen Standfelder, dasselbe Feld `raw.helmutBerlinArtikelstand` und
  derselbe PostgREST-Alias `berlin_artikelstand`. Der bestehende Pressearchiv-Zweig, seine
  Kennungen und alle alten Pressearchiv-Staende bleiben unveraendert. Ein alter
  `standHashFuer`-Aufruf OHNE Herkunft behaelt exakt denselben Hash.
* `summary` ist exakt der vom Parser gebundene, vollstaendige SACHABSATZ (`auszug`) mit
  `absatzHash = auszugHash`, nicht der RBMSKZL-Absenderabsatz und ohne jede Kuerzung.
  `volltextHash` sowie Titel, URL und Publikationstag stammen strikt aus demselben Parserbeleg;
  `published_at` bleibt NULL, keine Uhrzeit, kein HTML und kein Volltext in der Rohzeile.
* Beide Familien (RBMSKZL, SenWEB) nur nach kanonischer URL-Pruefung. Falsch deklarierte
  Herkunft, ein ausgetauschter Absatz, eine falsche Familie, Quelle, Titel, Tag, Hash oder URL
  sperren. `leseArtikelstand` validiert alte UND neue Staende rein lesend, ohne stillen
  Rueckfall auf die URL-Identitaet.
* `lib/helmut/artikelstand.js` behaelt die alte Identitaet exakt
  (`berlin-presse|<Standhash>|erster-absatz`) und unterscheidet fuer die neue Herkunft
  (`berlin-senatsvorlage|<Standhash>|sachabsatz`).

### Abnahme (offline)

`node scripts/berlin-artikelstand-test.js` (kein Netz, keine DB, kein Modell) prueft zusaetzlich
den neuen Zweig: beide Familien, summary = gebundener Sachabsatz, getrennter Namespace,
Negativfaelle (Absenderformel als summary, falsche Herkunft, falscher Hash, falscher Titel/Tag/URL,
Uhrzeit im Speicher, zwei Staende in einer Zeile) und — falls vorhanden — die drei lokalen
amtlichen Originale (RBMSKZL 1717887 mit 625 Zeichen, RBMSKZL 1717654 mit 344 Zeichen, SenWEB
1717406 mit 240 Zeichen). Ausserdem laeuft der echte Import-/Dedup- und Speicherleser-/Lageweg
jetzt auch fuer einen Sondervorlagenstand. Ergebnis: **41 Pruefgruppen** mit den lokalen
Originalen, **39** ohne sie (CI-tauglich ohne `/private/tmp`).

### Nicht umfasst

Kein Live-Crawl, kein Netzabruf, kein Production-Import, keine Aktivierung, kein 500er Test, keine
Production-DB-/Storage-/Lage-Datenaenderung, keine Profilversorgung, keine Production-Wirkung und keine
Abschwaechung von Schwellen oder Landesmandatsgate. Der neue Standzweig ist an keinen
Live-Quellenweg und kein Landesmodul angeschlossen; die produktive Versorgung der Berliner
Landesebene bleibt offen und braucht weiterhin ihren eigenen Nachweis.

## Einzelabruf der festen Senats-Portalseite (28.09.2026, lokal)

`lib/helmut/berlin-portal-einzelabruf.js` ist der kleinste, ausdruecklich einzeln aufzurufende
HTTP-Einzelabruf fuer GENAU die eine feste amtliche Portalseite
`https://www.berlin.de/presse/`. Das ist keine allgemeine URL-Erlaubnis: die Adresse wird VOR jedem
Abruf geprueft und auf die feste Portalseite (Pfad `/presse/`, amtliche www- und Nicht-www-Fassung,
kein Port, keine Benutzerinfo, keine Query/kein Tracking, kein Fragment, kein Trailing-Drift)
begrenzt. Jede andere Adresse — auch jedes andere `berlin.de`-Ziel — wird nie angefragt und fail
closed mit `abrufziel-ungueltig` abgewiesen. Der Abruf laeuft ueber die bestehende Anbietersteuerung
`crawler.fetchUrl` mit `allowedHost = berlin.de` und `meldeStatus = true`; die beobachteten Werte
`{url, finalUrl, http, html}` gehen UNVERAENDERT an den bestehenden Entdecker `pruefeSenatsblock`
aus `berlin-senat-entdeckung.js`. Nur der tatsaechlich beobachtete 200 und ein geschlossenes
Entdeckerergebnis fuehren zu `{ok:true, quelle, fundstellen}`; sonst fail closed mit kleinen,
benannten Gruenden (`abrufziel-ungueltig`, `dokument-ungueltig`, `hostwechsel`, `anbietergrenze`,
`http-status`, `abruf-fehlgeschlagen` oder der jeweilige Entdeckergrund). Das Ergebnis ist genau der
minimierte Senatsfundweg — die fuenf Fundstellenfelder `url`, `titel`, `publikationstag`,
`weiterreichbar`, `grund` — OHNE HTML, ohne Rohdokument, ohne Listenuhrzeit und ohne Volltext.

`node scripts/berlin-portal-einzelabruf-test.js` faehrt ausschliesslich injizierte Abrufe (kein
Netz, keine DB, kein Modell): positive amtliche Portalantwort, Ablehnung jeder anderen Adresse VOR
dem Abruf, fremder Host/Redirect, falsche finale URL, fehlender/falscher HTTP-Status, Parserdrift
(H2-Wortlaut, Behoerde, Datumsspalte, Kalendertag, doppelte Fundstelle, kommentierte/verborgene
Doppelung, ungueltiges HTML) sowie Hostwechsel, Anbietergrenze, echter HTTP-Fehler und sonstiger
Abruffehler — und — falls vorhanden — das lokale Original. Ergebnis: **49 Pruefungen** mit dem
gesicherten Original `/private/tmp/helmut-berlin-portal-20260928.html` (sha256 `1cb44dda…fac8`, sechs
Senatstreffer, alle weiterreichbar, BJF-Fundstelle exakt), **44** ohne es (Originalprobe wird dann
als SKIP gemeldet und der Test bleibt CI-tauglich). Der Test laeuft ueber die bestehende
Bereichsauswahl (`landesmodule-pardok` / `berlin`, Dateiname `berlin-…`); die Pflichtmenge
`STANDARD` bleibt unveraendert.

Ein einmaliger echter, rein lesender Abruf durch genau diesen Adapter am 28.09.2026 nach
07:32 UTC ergab `ok:true`, Quelle `https://www.berlin.de/presse/`, sechs Senatsfundstellen und
sechs vorab zulaessige Einzelabrufziele. Es wurde nichts gespeichert.

### Nicht umfasst

Dieser Einzelabruf ist KEINE produktive Versorgung und KEIN Live-Crawl-Hook: In diesem Helferlauf
gab es keinen Netzabruf, keinen Crawl-Anschluss, keinen Source-Mode-/Flag-/Cron-Eingriff, keinen
Import, keine Aktivierung, keinen 500er Test, keine DB-/Storage-/Lage-Aenderung, keine
Profilversorgung und keine Production-Wirkung. Er wird von nichts anderem automatisch aufgerufen
und ist an kein Landesmodul angeschlossen; die produktive Versorgung der Berliner Landesebene
bleibt offen und braucht weiterhin einen eigenen Nachweis. Pressearchiv- und Sondervorlagen-Adapter,
Crawler, Source-Mode, Landesschutzgate, Schwellen und Rollen bleiben unveraendert.
