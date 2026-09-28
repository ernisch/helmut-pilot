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
