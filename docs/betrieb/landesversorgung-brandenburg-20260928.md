# Brandenburgische Landtagspresse — lokaler Artikel- und Fundstellenleser (28.09.2026)

Roadmap-Schritt der Vorbereitung der aktuellen amtlichen Brandenburger
Landesversorgung vor dem ersten gemischten 500er Starttor. Gegenstand ist
ein rein lesender Originalabruf und ein streng begrenzter lokaler Leser fuer eine
amtliche Landtag-Brandenburg-Pressemitteilung. Es gab keinen Import, keine
Aktivierung und keine Production-Wirkung.

## Ausgangsbeleg

Amtliche lokale Originale der Landtag-Brandenburg-Seite (beobachtet 28.09.2026):

* Artikel `/private/tmp/helmut-bb-presse-50117.html`, HTTP200, 91019 Bytes,
  sha256 `91913e5d…2771`, gespeichert 14:06:45 UTC
  `https://www.landtag.brandenburg.de/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117`
* Kanonische Uebersichtsliste
  `/private/tmp/helmut-bb-presse-liste-kanonisch.html`, HTTP200, 102083 Bytes,
  sha256 `6b40d982…7947d`, gespeichert 14:18:01 UTC, unter der unten genannten
  kanonischen URL abgerufen. Listeneintrag `50117` nennt denselben Titel und
  den Tag `23.09.2026`. Ein vorheriger Abruf ueber den Alias
  `/sixcms/detail.php/25216` war fuer diese URL-Bindung nicht ausreichend.

## Umgesetzter Vertrag (lokal, nicht produktiv)

`lib/helmut/brandenburg-landtag-presseartikel.js` liest ausschliesslich aus dem
gesicherten HTML. Es gibt KEIN Netz, keine Datei-, DB-, Modell- oder Productionwirkung.
HTML wird mit einem eigenen kommentar- und skriptbewussten Tokenleser ausgewertet; Grenzen
werden ueber die zugehoerigen schliessenden Auszeichnungen derselben Verschachtelungstiefe
bestimmt, nicht ueber offene Regexe.

`pruefePresseartikel({ url, finalUrl, http, html })` (genau vier Felder) liefert
eingefroren `url`, `titel`, `publikationstag`, `kopfzeile`, `volltext`, `volltextHash`,
`htmlHash`. Gelesen werden genau:

* GENAU EIN sichtbares `main.col-lg`, geschlossen; `url` = `finalUrl` = einzige
  kanonische Adresse.
* GENAU EINE sichtbare H1 als Titel, gebunden an den amtlichen Seitentitel und `og:title`.
* Der eigene Kopfabsatz `<p><em>Ort, TT. Monat JJJJ / NNN</em></p>` als erster Absatz nach
  der H1; daraus `kopfzeile` und der reine Kalendertag. „/ NNN“ ist die Mitteilungsnummer,
  keine Uhrzeit — `published_at` bleibt NULL, es wird keine Zeit erfunden.
* Die Sachabsaetze bis vor die PDF-Downloadliste; sie sind vollstaendig, geschlossen,
  sichtbar und enthalten nur Formatierung.

Fail closed bei: fremder/normalisierter Artikeladresse (Host, Port, Benutzerinfo, Query,
Fragment, Trailing Slash, `..`, `%2F`, Grossschreibung im Host oder Pfad, fremde
Pfadfamilie), Host-/HTTP-/`finalUrl`-Drift, fehlender/doppelter/verschobener/falscher H1,
ungueltiger oder mit Fremdinhalt versetzter Kopfzeile, ungueltigem Kalendertag,
versteckten oder inerten Scheinbelegen (Kommentar, Skript, `hidden`, `aria-hidden`,
`display:none`), Ausbruch aus `main`, angehaengtem Kontakt-/Sidebarblock sowie angehaengtem
oder eingeschobenem PDF-Link. Die PDF-Downloadliste darf hoechstens einmal vorkommen, muss
den Hauptbereich abschliessen und ist NIE Artikeltext; Sidebar und Fussbereich liegen
ausserhalb von `main` und bleiben ausgeschlossen.

## Grenze der Quellenbindung

Der reine Artikelleser ist **nicht** von der Uebersichtsliste abhaengig. Die zweite,
ausdruecklich optionale Ebene `pruefeFundstelleGegenListe(artikel, liste)` prueft einen
bereits gelesenen Artikel gegen die amtliche Liste
`https://www.landtag.brandenburg.de/de/aktuelles/presse/aktuelle_pressemitteilungen/25216`.
Sie bindet den Listeneintrag ueber denselben Artikelpfad, verlangt genau EINEN Treffer und
bricht bei Titel- oder Tageswiderspruch, doppelten oder versteckten Eintraegen sowie fremder
oder driftender Listenadresse ab. Damit ist die behauptete Quellenbindung praezise: ohne
Listengegenprobe ist der Beleg genau der aus der Artikelseite selbst gelesene Stand — keine
weitergehende Aussage ueber die Uebersichtsseite.

## Abnahme (offline)

`node scripts/brandenburg-landtag-presseartikel-test.js` (kein Netz, keine DB, kein Modell)
prueft synthetische Positiv- und Negativfaelle: Adresse, HTTP und Felder,
Host-/finalUrl-/canonical-Bindung, H1, Kopfzeile, Sachabsaetze, PDF-Liste, Ausbruch aus
`main`, versteckte Scheinbelege sowie die optionale Fundstellen-Gegenpruefung. Mit den
lokalen Originalen unter `/private/tmp` prueft er zusaetzlich den echten Artikel: Titel,
Kopfzeile „Potsdam, 23. September 2026 / 134“, Tag `2026-09-23`, 4 Sachabsaetze, 2750
Zeichen Volltext (2749 ohne abschliessenden Umbruch, ersten Absatz 497 Zeichen),
Volltext-SHA256 `137e2697…5497`, HTML-SHA256 `91913e5d…2771` und den deckungsgleichen
Listeneintrag `50117`. Ohne `/private/tmp` laeuft derselbe Test unveraendert durch; die
Originalproben werden dann als SKIP gemeldet, der Test bleibt CI-tauglich.

Der Test wird ueber die bestehende Bereichsauswahl `landesmodule-pardok` (Dateiname
`brandenburg-…`) mitgefahren; die Pflichtmenge `STANDARD` bleibt unveraendert.

## Nicht umfasst

Kein Live-/Crawl-Anschluss, kein Netzabruf, kein Storage-, Import- oder Lage-Weg, kein
Landesmodul, keine Aktivierung, kein 500er Test, keine Profilversorgung, keine
Production-Datenaenderung und keine Abschwaechung von Qualitaets-, Zulassungs- oder
Landesmandatsschwellen. Der Leser wird von nichts anderem automatisch aufgerufen; die
aktuelle amtliche Brandenburger Landesversorgung und der produktive Versorgungsnachweis
bleiben offen und brauchen weiterhin ihre eigene Freigabe.

## Nachtrag 28.09.2026 — amtlicher RSS-Fundstellenleser und Artikelbindung

Derselbe amtliche Anlass liefert zusaetzlich einen RSS-2.0-Feed. Gesichertes lokales
Original `/private/tmp/helmut-bb-presse-rss.xml`, 7963 Bytes, sha256
`4026f51c…0e18`, Abruf HTTP200, Anfrage
`https://www.landtag.brandenburg.de/cms/detail.php?template=lt_rss_presse_d`, final nach
Redirect `https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_d`,
gespeichert 28.09.2026 14:26:46 UTC. Ein Kanal „Landtag Brandenburg -
Pressemitteilungen“, 15 Items. Item `50117` traegt Titel, `link` = `guid`
(`…/sixcms/detail.php?id=brandenburg_01.c.50117.de`), `author`
`brandenburg_01.c.50117.de (50117)` und den RFC-822-`pubDate`
`Wed, 23 Sep 2026 12:42:00 +0200`.

`lib/helmut/brandenburg-landtag-presse-rss.js` liest ausschliesslich aus dem uebergebenen
String samt HTTP-Status und Anfrage-/finaler Adresse. Es gibt KEIN Netz, keine Datei-, DB-,
Modell- oder Productionwirkung. `pruefePresseRss({ url, finalUrl, http, rss })` (genau vier
Felder) verlangt HTTP200, die exakte Anfrage-/finale Feed-Adresse, genau ein Wurzelelement
`<rss version="2.0">`, genau einen Kanal mit exaktem Landtag-Titel und Kanal-Link gleich
der finalen Adresse sowie saubere `<item>`-Grenzen. Jedes Item liefert `nummer`, `titel`,
`link`, `guid`, `author`, `pubDate` und den daraus gelesenen lokalen `publikationstag`.
IDs sind im gesamten Feed eindeutig. Fail closed bei falscher/doppelter/versteckter/fremder
Struktur (u.a. Kommentar- oder CDATA-Doppler, unbekannte Kanal-/Itemfelder, verschachtelte
oder Markup-Titel, `guid` ≠ `link`, Autornummer ≠ Itemnummer, fehlender oder nicht
numerischer Offset, falscher Wochentag). Ein faelliges `<lastBuildDate>` ist KEINE
Artikelpublikation und wird nie als solche gelesen; ohne eigenen Item-`pubDate` bricht der
Leser ab, statt auf das Builddatum auszuweichen.

`bindeRssItemAnArtikel(item, artikel)` bindet GENAU EIN Item an die Ausgabe von
`pruefePresseartikel(...)` des bestehenden Artikellesers: Nummer am kanonischen Pfad
`/de/meldungen/<slug>/<nr>`, exakt gleicher Titel und exakt gleicher LOKALER
Publikationstag. Erst danach erscheint der explizite RSS-Zeitpunkt als UTC-ISO-8601. Der
lokale Tag (`+0200`) und der UTC-Kalendertag koennen auseinanderfallen; verglichen wird
immer der lokale Tag, die UTC-Zeit entsteht allein aus dem Offset. Fuer Item `50117` ergibt
das `publikationstag` `2026-09-23` und `publikationszeitpunktUtc`
`2026-09-23T10:42:00.000Z`. Die Bindung an den Artikelbeleg stuetzt sich auf den in PR #693
gemergten Artikelleser; der lokale Legacy-Abruf
`/private/tmp/helmut-bb-presse-rss-50117.html` (sha256 `b6fc4597…e57b`) hat einen ANDEREN
HTML-Hash als der direkte kanonische Abruf (sha256 `91913e5d…2771`) und wird nie als
dieser direkte Abruf ausgegeben.

## Abnahme (offline, Nachtrag)

`node scripts/brandenburg-landtag-presse-rss-test.js` (kein Netz, keine DB, kein Modell)
prueft synthetische Positiv- und Negativfaelle: Adresse/HTTP/Felder, Kanal, Item-Grenzen,
eindeutige IDs, `link`/`guid`/`author`, RFC-`pubDate` mit explizitem Offset, versteckte
Doppler, Fremdfelder, Titel-Markup sowie die Artikelbindung (Nummer/Titel/lokaler Tag,
lokaler Tag gegen UTC-Datum, `lastBuildDate` niemals Publikation). Mit dem lokalen Original
unter `/private/tmp` prueft er zusaetzlich den echten Feed: 15 Items, Item `50117` mit
identischem Titel, Tag `2026-09-23` und UTC `2026-09-23T10:42:00.000Z` nach der Bindung.
Ohne `/private/tmp` laeuft derselbe Test unveraendert durch; die Originalprobe wird dann als
SKIP gemeldet, der Test bleibt CI-tauglich. Der Test wird ueber die bestehende
Bereichsauswahl `landesmodule-pardok` (Dateiname `brandenburg-…`) mitgefahren; die
Pflichtmenge `STANDARD` bleibt unveraendert.

## Nicht umfasst (Nachtrag)

Keine Live-/Crawl-/Storage-/Lage-Anbindung, kein Profilbezug, keine Aktivierung, kein 500er
Test, keine Production-Aktion und keine Aenderung an Schwellen- oder Gate-Routing. Leser und
Bindung werden von nichts anderem automatisch aufgerufen; die tagesgenaue Meldung `50117`
ist damit lokal belegt, aber noch nicht an Crawl, Storage oder Lage angebunden.

*(Durch den Nachtrag 29.09.2026 unten teilweise ueberholt: Dispatcher, Storage-Leser und
tagesgenaue Lage-Quellenzeile sind offline belegt. Live-Crawl, Import und Production bleiben
weiterhin nicht umfasst.)*

## Nachtrag 28.09.2026 — eigenstaendiger Offline-Artikelstand

`lib/helmut/brandenburg-landtag-presseartikelstand.js` verbindet den geschlossenen
Artikelleser und die gebundene RSS-Fundstelle zu einer minimierten Rohzeile mit eigener
Standkennung. Der Standhash bindet amtliche Artikeladresse, exakten Titel, lokalen
Publikationstag, den aus dem RSS-`pubDate` gebundenen UTC-Zeitpunkt sowie Hashes des
ersten ganzen Sachabsatzes und des Volltexts. Fuer Meldung `50117` ist der erste
Sachabsatz 497 Zeichen lang. Nur dieser vollstaendige Absatz wird als `summary`
uebernommen; Volltext und HTML werden nicht in die Rohzeile geschrieben.

Die Uhrzeit `2026-09-23T10:42:00.000Z` steht vorerst nur in den geschlossenen
Standmetadaten. `published_at` bleibt NULL, weil der bestehende gemeinsame
Import-/Speicher-/Lage-Vertrag fuer Artikelstaende ausschliesslich tagesgenaue
Staende verarbeitet. Der neue Stand ist noch **nicht** im Dispatcher
`lib/helmut/artikelstand.js` registriert und darf deshalb nicht importiert oder
als sichtbare Landesversorgung gezaehlt werden. Der Folge-Schritt muss den
nachweisbaren Uhrzeitpfad samt Speicherleser und Lage-Ausgabe eigenstaendig
schliessen; ein stiller Rueckfall auf die URL-Kennung waere Datenverlust.

*(Durch den Nachtrag 29.09.2026 unten ueberholt: der Stand ist inzwischen offline
im Dispatcher registriert und an Storage und Lage gefuehrt. `published_at` bleibt
dabei NULL und nur der belegte Kalendertag sichtbar; Live-Crawl, Import und
Production bleiben weiterhin offen.)*

`node scripts/brandenburg-landtag-presseartikelstand-test.js` prueft neun
gezielte Gruppen einschliesslich falscher RSS-Identitaet, Titel-/Tages-/Zeitdrift,
manipulierter Standhashes, Summary-Drift, Rohtextbeigaben und fehlendem
RSS-Zeitbeleg. Mit den gesicherten Originalen bestaetigt er den 497-Zeichen-Absatz
und den exakten UTC-Zeitpunkt; ohne diese privaten Dateien bleiben die
synthetischen Pruefungen CI-tauglich. Kein Netz, keine DB, keine Profile und keine
Production-Daten wurden fuer diesen Stand veraendert.

## Nachtrag 29.09.2026 — Offline-Anbindung an Dispatcher, Storage und Lage

Der minimierte Brandenburger Landtags-Presseartikelstand ist nicht mehr
eigenstaendig, sondern als dritter, eigener Standtyp in den gemeinsamen Dispatcher
`lib/helmut/artikelstand.js` eingetragen (`rohFeld`
`helmutBrandenburgLandtagPresseArtikelstand`, `abgerufenFeld`
`brandenburg_abgerufen_at`, eigener Namespace und eigene Kennung
`brandenburg-landtag-presse|<standHash>|erster-sachabsatz`). Damit waehlen Dedup,
die Storage-Projektionen, der Quellenauszug, der Zeitvertrag und der
Lage-Quellenbeleg denselben geschlossenen Stand wie Bundestag und Berlin, statt auf
die URL-Kennung zurueckzufallen; widerspruechliche Standmetadaten brechen laut ab
(fail-closed).

`lib/helmut/storage.js` fuehrt den Stand durch alle tatsaechlich relevanten Leser:
das Dedup-Bestandsfenster (`ladeDedupBestandsfenster`), die KO- und
Rohdokument-Projektionen (`listKoDocuments`, `listRecentRawDocuments`,
`listRawDocuments`, `getSourcesForVorgang`, `getPruefSourcesByVorgaenge`,
`getGebundeneLageQuellen`, `getRawDocumentsByIds`) sowie einen vierten, ebenso
begrenzten Lesepfad in `listAktuelleLageQuellen`. Dieser Pfad liest ausschliesslich
als Brandenburger Stand validierte Zeilen (`published_at is null`), prueft den
ganzen Publikationstag gegen das Lagefenster und wirft bei unlesbaren oder
widerspruechlichen Metadaten laut — kein Ersatzdatum aus Abruf/`created_at`.

`lib/helmut/lage.js` liest die sichtbare Quellenzeile ueber denselben Dispatcher
(`mapSource`, `mapAbsatzQuellen`). Die Zeile zeigt genau den belegten Kalendertag
(`dateLabel`), waehrend `publishedAt` leer bleibt; es wird keine Uhrzeit erfunden.

Offline belegt ist dies ueber die bestehenden Suiten: die Brandenburger
Artikelstand-Suite (`scripts/brandenburg-landtag-presseartikelstand-test.js` —
dritter Standtyp erkannt, eigene Kennung, kein stiller Rueckfall, fail-closed) und
die Lage-Quellenfenster-Suite (`scripts/lage-quellenfenster-test.js` — vierter
Lesepfad, tagesgenau und fenstergebunden, sichtbare Quellenzeile ohne erfundene
Uhrzeit). Die dort mitgefuehrten geprueften Berlin-/Bundestags-/Lage-/Dedup-
Regressionen (`scripts/berlin-artikelstand-test.js`,
`scripts/bundestag-artikelstand-test.js`, die Lage-Suiten und die Dedup-Suiten)
bleiben deckungsgleich; der Bundestagspfad und die Schwellen wurden nicht
gelockert. Genannt ist damit die vorhandene Abdeckung; in diesem
Dokumentationsschritt wurde keine neue Pruefung ausgefuehrt.

Weiterhin **nicht umfasst**: Live-Crawl, Netzabruf, Import, Storage-Schreibweg,
Aktivierung, 500er Test, Profilversorgung, Landesmodul und jede Production-Wirkung.
Der Stand bleibt rein offline; die aktuelle amtliche Brandenburger Landesversorgung
und der produktive Versorgungsnachweis bleiben offen und brauchen weiterhin ihre
eigene Freigabe.
