# Gemeinsamer Berlin+Brandenburg Offline-Nachweis (29.09.2026)

Kurzer, rein lokaler Beleg. Kein Netz, keine DB, kein Modell, keine Production, keine
Datenaenderung, kein Import, kein Flag, keine Aktivierung, kein 500er-Test.

## Ziel

Auf EINEM gemeinsamen relationalen Plan nachweisen, dass (1) Berlin und Brandenburg am
Landesmandatsgate getrennt und fail-closed wirken, (2) die exakt synthetisch vorbereiteten
amtlichen BE- und BB-Zeilen durch die bestehenden Dispatchketten zu minimalen Stand-Rohzeilen
und sichtbaren Lage-Quellenzeilen laufen, (3) die reale, noch unvorbereitete BB-Google-News-Zeile
gesperrt bleibt und (4) der geteilte rbb24-Zwei-Laender-Weg sichtbar getrennt bleibt.
Gegenstand des hier dokumentierten Fehlerfixes: die gemeinsame Sicherheitsprojektion
`scripts/landesversorgung-be-bb-gemeinsam-test.js`.

## Bestandener Offline-Nachweis

`node scripts/landesversorgung-be-bb-gemeinsam-test.js` — **31 Pruefungen erfolgreich**
(vorher 30, davon 21 vor der fehlerhaften Assertion; die Projektionspruefung war nicht gruen).

Tatsaechlicher minimaler Standvertrag der beiden projizierten Rohzeilen, jetzt exakt geprueft:

* Berliner Stand: 8 geschlossene Felder (`version`, `herkunft`, `url`, `titel`,
  `publikationstag`, `absatzHash`, `volltextHash`, `standHash`) — kennt KEINE Uhrzeit.
* Brandenburger Stand: 9 geschlossene Felder, zusaetzlich genau EIN gebundenes Zeitfeld
  `publikationszeitpunktUtc`. Dieser Wert ist die UTC-Fassung des amtlichen Feed-Item-Zeitpunkts
  (RSS-`pubDate`) und in der Pruefung aus dem gebundenen Feed-Item reproduzierbar.

Die korrigierte Assertion prueft damit genau die Sicherheitsgarantie statt einer pauschalen
ISO-Zeit-Regex ueber die ganze Zeile:

* keine HTML-/Volltext-Nutzlast (kein Rohfeld `volltext`/`html`, kein Markup in irgendeinem Wert),
* `published_at` auf Zeilenebene `null` (keine erfundene/sichtbare Veroeffentlichungszeit),
* genau EINE Zeitangabe in beiden Zeilen insgesamt — der eine belegte, reproduzierbare
  BB-Standwert; der Berliner Stand ist zeitfrei.

Negativproben (ausserhalb des Repos, in `/tmp`) bestaetigen, dass die Assertion nicht
abgeschwaecht ist: zusaetzliche Zeit in `raw` oder im BB-Stand, HTML-Nutzlast, `volltext`-Feld,
Zeit im Berliner Stand und eine abweichende BB-UTC werden alle erkannt.

## Weiterhin gesperrt (kein Teil dieses Belegs)

* **Flag** `HELMUT_LANDESMODULE`: unveraendert. Ohne Flag bleibt BE wie BB gesperrt.
* **Berechtigtes Landesmandat**: unveraendert. Flag ohne passendes Landesmandat sperrt den Weg
  je Land (`kein berechtigtes Landesmandat`).
* **BB-Zeilenkonfiguration**: unveraendert. Nur die exakt vorbereitete amtliche BB-Zeile erhaelt
  den Spezialtyp; die reale, noch unvorbereitete BB-Zeile bleibt gesperrt.
* **`manual`/`needs_review`**: unveraendert. Die reale BB-Zeile (Google-News, `manual`,
  `needs_review`) bleibt trotz Brandenburg-Freigabe und Mandat manuell gesperrt
  (`manuell-gesperrt`).

## Rueckweg

Der Fix betrifft ausschliesslich die eine Assertion im neuen, bisher ungetrackten lokalen
Testskript; es gibt keine Production-, DB-, Env- oder Flag-Wirkung. Rueckweg: die Datei
`scripts/landesversorgung-be-bb-gemeinsam-test.js` unveraendert entfernen (oder den
`ohneRohinhalte`-Block auf den vorherigen Stand zuruecksetzen); diese Belegdatei bleibt ohne
technische Wirkung. Kein Datenverlust moeglich, da nichts gespeichert oder provisioniert wurde.

## Stop-Grenze

Der Auftrag endet hier. Nicht enthalten und ausdruecklich nicht ausgefuehrt: Commit, Push, PR,
Merge, Migration, Env-/Flag-Aenderung, Cron, Profil-/Import-/Aktivierungsarbeit, 500er-Test,
Vercel-, Netz-, DB- oder Production-Aktion.
