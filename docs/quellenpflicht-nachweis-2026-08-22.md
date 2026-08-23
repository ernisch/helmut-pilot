# Quellenpflicht-Schließungssprint — Nachweis (2026-08-22)

**Zweck:** Belegdatei des separaten P0-Quellenpflicht-Schließungssprints.
Kanonische Produktgarantie: [`START_HERE.md`](START_HERE.md) §5 Prinzip 2.
Statuszeile: [`CURRENT_STATE.md`](CURRENT_STATE.md) §14.

## 1 · Was jetzt technisch garantiert ist

Jedes **sichtbare quellenpflichtige Inhaltselement** in Lage, dem Briefing-Tab
(Stabschefstand), allen vier Radar-Bereichen (Über dich, Dein Umfeld, Neue
Dynamiken, Alle relevanten Artikel) und Büro trägt mindestens **eine echte
öffnende https-Quelle**: https-Schema, keine bloße Herausgeber-Startseite
(Domain-Root), kein Google-Proxy, kein `javascript:`/`data:`. Ohne solche Quelle
erscheint ein **ehrlicher Leerzustand** statt einer Inhaltskarte. Der
Briefing-Tab zeigt die öffnende Quelle erstmals auch **sichtbar als Link**
(„Quelle öffnen" am aktuellen und an den weiteren Vorgängen); ein Vorgang ohne
öffnende Quelle erreicht den Stand serverseitig nicht mehr
(`briefingContract.oeffnendeHelmutQuelle`, Kandidaten-Gate).

Zusätzlich: Das **Analysedatum** (`ko.updated_at`) wird **nie** als
Veröffentlichungsdatum einer Quelle ausgegeben. Fehlt ein echtes
Veröffentlichungsdatum, bleibt der Wert leer (auch in der Anzeige: keine
Zeitangabe, kein „Heute"-Fallback, kein 1.1.1970).

## 2 · Was ausdrücklich NICHT garantiert ist (ehrliche Grenzen)

- **Keine Beleg-Bindung:** Es ist nicht bewiesen, dass jede einzelne Aussage
  eines Elements durch eine bestimmte Quelle oder Textstelle getragen wird.
  Garantiert ist die sichtbare, öffnende Quellenbasis je Element.
- **Keine Fundstellenmarkierung, keine Volltextspeicherung** (Datenschutzdesign
  unverändert: Volltexte, Textpositionen und Artikelzitate werden nicht
  gespeichert).
- **Keine ausgehende Link-Prüfung:** Ob eine URL zum Abrufzeitpunkt noch
  erreichbar ist (HTTP 200), wird nicht geprüft.
- **Startseiten-Heuristik = Pfadtiefe 0, Query-blind — in beide Richtungen:**
  Rubrik-/Listenseiten MIT Pfad (z. B. `tagesschau.de/inland/`) erkennt die
  Heuristik nicht (können als „Artikel"-Link auftreten); umgekehrt gilt eine
  Artikel-URL mit leerem Pfad aber Artikel-Query (z. B. `…/?p=12345`) als
  Startseite und fällt weg. Gleiche Grenze wie im Crawl-Pfad
  (`crawler.isLikelyPublisherHomepage`).
- **Verdrängung bei vollen Caps:** Items ohne belegtes Veröffentlichungsdatum
  (publishedAt leer) sortieren ans Listenende und fallen bei erreichten
  Bereichs-Caps (z. B. 30 Erwähnungen) zuerst aus der Anzeige — obwohl sie eine
  öffnende Quelle tragen.
- **Büro-Quellenliste zeigt höchstens 5 Quellen:** der kompakte Start-Payload
  kappt `sources` je Item auf 5 (vorher 2). Der Zähler ist exakt die Anzahl der
  **sichtbaren** unterschiedlichen öffnenden Quellen — bei Vorgängen mit mehr
  als 5 Dokumentquellen zeigt er die gekappte Menge.
- Die Lage-Detailansicht (Vorgangs-Sheet) behält für einzelne Quellen ohne
  Artikel-URL den bewussten `https://<host>`-Fallback-Link; die **Karte selbst**
  erscheint aber nur noch mit mindestens einer echten öffnenden https-Quelle.
- Zwischengespeicherte **Alt-Payloads** (Client-Cache) können den neuen
  Stand-Quellen-Link bis zum nächsten Laden noch nicht tragen (Feld fehlt);
  der Server liefert ihn ab diesem Stand immer.

## 3 · Durchgeführte Korrekturen

| Bereich | Korrektur | Stelle |
|---|---|---|
| Radar (Server) | Öffnende-Artikel-Pflicht (`oeffnendeArtikelUrl`: https + keine Startseite) in `pickPrimarySource` und als harte Pflicht in **allen vier** Bereichen (vorher nur „Über dich", und dort nur `http(s)`-Regex) | `lib/helmut/radarState.js` |
| Radar (Server) | `koPublishedAt`/Fallback-Quelle: nie mehr `updated_at`/`created_at` als Veröffentlichungsdatum — leer, wenn unbelegt | `lib/helmut/radarState.js` |
| Radar (Client) | `radarItemHref` verschärft (https, kein Google-Proxy, keine Startseite); Bereichs-Renderer zeigen nur öffnbare Items; ehrlicher Gesamt-/Bereichs-Leerzustand; Kopf sagt „Ohne belegtes Quellendatum" statt fälschlich „Noch keine Radar-Daten" | `client.js` |
| Büro | Sichtbare, anklickbare, **deduplizierte** Quellenliste im Entwurfs-Detail (`renderOfficeDraftSources`); Zähler = exakt Listenlänge (vorher Doppelzählung der Primärquelle, de facto unterdrückt durch schlankes Kartenobjekt); Click-Handler löst jetzt die volle Entscheidung auf | `client.js`, `styles.css` |
| Briefing-Vertrag | `buildSources`-Fallback: `publishedAt: null` statt `ko.updated_at` (Vorlage: `lage.js` `loadSourcesForVorgaenge`) | `lib/helmut/briefingContract.js` |
| Briefing-Tab (Stand) | **Neu nach unabhängiger Prüfung:** Kandidaten-Gate `oeffnendeHelmutQuelle` (Vorgang ohne öffnende https-Quelle erreicht den Stand nicht; bloßer `source_document_count` genügt nicht) + sichtbare „Quelle öffnen"-Links am aktuellen und an den weiteren Vorgängen | `lib/helmut/briefingContract.js`, `client.js`, `styles.css` |
| Lage (nachgeschärft) | Karten gelten nur als belegt mit ≥ 1 **öffnender** https-Quelle — volle Prüfung (keine Startseite, kein Google-Proxy) statt nur https-Schema; Server + Client-Parität; bloßer `sourceCount` genügt nicht mehr | `lib/helmut/lage.js`, `client.js` |
| Radar-Dynamiken (nachgeschärft) | Anzeigezeit einer Dynamik nur noch aus belegtem Quellendatum — `ko.created_at` bleibt reines Sichtbarkeits-Gate und erzeugt kein „Aktualisiert heute" mehr | `lib/helmut/radarState.js` |
| Büro-Payload | Kompakt-Kappung der Quellen je Item 2 → 5 + Artikeltitel in `compactSource`, damit Liste und Zähler die Quellen real abbilden können | `server.js` |
| Heute/Büro (gemeinsam) | `isDirectArticleHref` https-only | `client.js` |

**Bewusst nicht enthalten:** Beleg-Bindung, Fundstellenmarkierung,
Volltextspeicherung, ausgehende Link-Prüfungen, Migrationen, Feature-Flags,
Änderungen an Crons/Warteschlange/Understanding-Wiederaufnahme/Versuch 5,
Production-Aktionen, zusätzliche KI-Aufrufe.

## 4 · Tests

- **Neu:** `scripts/quellenpflicht-vertrag-test.js` (zentraler Vertragstest:
  Lage, Heute, alle vier Radar-Bereiche, Büro — Server- und Client-Ebene) und
  `scripts/quellenpflicht-faelle-test.js` (gezielte Fälle: ohne URL,
  Herausgeber-Startseite, Büro-Dubletten inkl. Slash-/Case-Varianten, fehlende
  Veröffentlichungsdaten, ehrliche Leerzustände).
- **Nachgeführt** (pinnten das alte, unehrliche Verhalten bzw. brauchen jetzt
  öffnende Fixture-Quellen): `radar-state-test.js`, `lage-test.js`,
  `presale-hardening-test.js`, `current-helmut-state-test.js`,
  `briefing-freshness-header-test.js`, `briefing-frische-audit-test.js`,
  `briefing-frische-e2e-test.js`, `helmut-tab-ui-test.js`.
- **Unabhängige Prüfung:** Der PR wurde unabhängig auf Logiklücken, falsche
  Produktversprechen und Quellenverluste geprüft (3 Prüf-Linsen, adversariale
  Gegenprüfung jedes Befunds). 9 Befunde bestätigt und behoben bzw. hier als
  Grenze dokumentiert — darunter der fehlende Briefing-Tab-Schutz (kritisch),
  das nur-Schema-Gate der Lage, das `created_at`-Zeitleck der Dynamiken und
  die 2er-Kappung der Büro-Quellen.
- Die gezählten Testergebnisse des Abnahmelaufs stehen in der PR-Beschreibung
  (Zahlen aus dem tatsächlichen Lauf).

## 5 · Sichtbare Wirkung / mögliche Anzeigen-Änderungen in Production

- Radar-Einträge, die bisher als Karte **ohne** öffnenden Link erschienen
  (Umfeld/Dynamiken/Artikel mit leerer oder Startseiten-URL), verschwinden und
  werden durch die ehrlichen Leerzustände ersetzt.
- Radar-Zeitangaben, die bisher das Analysedatum zeigten, bleiben leer, bis ein
  belegtes Veröffentlichungsdatum vorliegt; der Radar-Status ist dann ehrlich
  `stale` („Letzter Stand"/„Ohne belegtes Quellendatum") statt fälschlich
  „Aktualisiert heute".
- Lage-Karten, deren „Beleg" nur ein Zählerwert, eine URL-lose Quelle, eine
  bloße Startseite oder ein Google-Proxy war, verschwinden (ehrlicher
  Leerzustand).
- Der Briefing-Tab kann leer werden („Kein aktueller Stand verfügbar"), wenn
  kein Vorgang eine öffnende Quelle trägt — vorher zeigte er dieselben Vorgänge
  mit bloßem Quellen-Zähler; dafür trägt er jetzt sichtbare Quellen-Links.
- Büro-Detail zeigt erstmals die Quellenliste; der Zähler kann **niedriger**
  ausfallen als früher behauptet (keine Doppelzählung, nur Öffnbares zählt),
  aber auch bis 5 statt bisher maximal 2 sichtbare Quellen tragen.
