# Radar: eigener Parteibezug am angezeigten Artikel

## Bestaetigter Fehler

Am 16.11.2026 zeigt ein Betreiberbeleg einen fremden Parteienartikel im Reiter
Partei / Fraktion mit „Betrifft Ihre Partei“. Die technische Reparatur betrifft
die Artikelzuordnung, nicht die Pflege oder Aenderung von Profilen. Individuelle
Profilwerte sind fuer den technischen Beleg und die Regression nicht erforderlich.

Im bestehenden Backend kann der Parteibeleg aus einem anderen Originalartikel
desselben Vorgangs stammen. Die Anzeige bindet anschliessend den Titel an den
ausgewaehlten Artikel, qualifiziert dessen eigenen Parteibezug aber nicht erneut.
Auch die gespeicherte Anzeige wird ohne diese fachliche Nachpruefung gelesen.
Das ist ein Zuordnungsfehler, kein Nachweis einer falschen Profilpartei.

## Eng begrenzte Reparatur

Ein gemeinsamer, artikelgebundener Beleg muss Produktion, Anzeigeprojektion und
Lesen bereits gespeicherter Tagespakete absichern. Generische Parteienlisten,
Dimensionen und andere Artikel desselben Vorgangs ersetzen diesen Beleg nicht.
Andere nachgewiesene Radarbereiche und gespeicherte Originale bleiben erhalten.
Keine neue Verarbeitung, Modellkosten, Profil- oder Cachewrites erforderlich.

Der gemeinsame Artikelbeleg sichert Producer, Originaltitelprojektion und den
Tagespaketleser ab. Der Leser bereinigt nur die geladene Kopie, einschliesslich
alter Pakete ohne `anzeige` und falscher Parteichips an sonst gueltigen Karten.
Originale, Profilbindung, gespeicherte Hashes, Lage und Abschlussquittung bleiben
erhalten. Offizielle eigene Herausgeber sowie explizite eigene Partei- und
Fraktionsakteure bleiben zulaessig; Quellennamen, andere Clusterartikel,
Richtungsadjektive und lediglich zitierte Parteinamen belegen keine Zuordnung.

## Gezielte Nachweise

Vier bestehende Offline-Suiten ueber den Schutzstarter bestanden:
`radar-ursprung-test` 19/19, `radar-einzelartikel-titelbindung-test` 7/7,
`radar-party-normalization-test` 32/32 und `radar-state-test` 117/117.
Der exakte oeffentliche Fremdparteien-Titel aus dem Betreiberbeleg ist mit
synthetischem Profil reproduziert. Negative und positive Partei-/Fraktionsfaelle,
Artikelreihenfolge, mehrdeutige Quellen, Legacycache, Zusatzchips, Mandant,
Profilhash, Datum, unveraenderter Speicher und Quittung sind geprueft.

Der gezielte bestehende Chromiumfall prueft die sichtbare Sperre und erhaltene
Dynamik auf Desktop und Mobil. Beide Pflichtchecks bleiben erforderlich.
Der eng gebundene CI-Plan prueft den vollstaendigen Diff, Runtime-/Testblobs,
PR1237 und dessen konkreten Kopf. Abweichungen stoppen, statt Mengenlaeufe
auszuloesen. Der regulaere Squashmerge ist auf den identischen Baum beschraenkt.
CI, unabhaengiges Review und Rollout werden in PR1237 abschliessend belegt.
Keine kostenpflichtigen Laeufe, Produktionsdatenwrites oder Gesamtfreigabe.
Rueckweg: diesen PR revertieren; kein Datenrollback notwendig.
