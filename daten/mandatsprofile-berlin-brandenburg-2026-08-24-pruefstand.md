# Prüfstand — Importpaket Berlin/Brandenburg (2026-08-24)

**Zweck:** Genaue Liste der **fehlenden bytegenauen Prüfungen** je Profil aus
`daten/mandatsprofile-berlin-brandenburg-2026-08-24.json`. **Kein einziges der 20 Profile
ist bytegenau amtlich bestätigt.** Grundlage ist eine WebSearch-Recherche vom 2026-08-24;
Suchmaschinen-Snippets sind ausdrücklich **kein endgültiger Beleg**.

**Warum die Bestätigung fehlt:** Die amtlichen Hosts `www.parlament-berlin.de`,
`www.landtag.brandenburg.de` und `www.bundestag.de` sind aus der Claude-Cloud-Umgebung
durch den Egress-Proxy gesperrt (curl: `CONNECT tunnel failed, response 403`; WebFetch:
`EGRESS_BLOCKED`; je Profil unten protokolliert). Der früher erfolgreich genutzte Weg für
bytegenaue Verifikation — ein GitHub-Actions-Runner mit offenem Egress (Sprint 9B,
`lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation.js`) — war in diesem Sprint
ausdrücklich untersagt (kein manuell gestarteter Actions-Lauf).

**Für jedes Profil gilt zusätzlich (Sammelprüfungen):**

1. Existenz und exakter Wortlaut der amtlichen Profilseite (URL nur aus Suchtreffern belegt).
2. Amtliche Schreibweise des Vollnamens.
3. Vollständige Ausschussliste der laufenden Wahlperiode (Berlin: 19. WP; Brandenburg: 8. WP)
   inkl. ordentlich/stellvertretend/Vorsitz — Leere Ausschusslisten im Paket bedeuten „nicht
   belegbar“, nicht „keine Mitgliedschaft“.
4. Mandatsart (Wahlkreis mit amtlicher Nummer vs. Listenmandat mit Listenplatz).
5. Aktualität der Funktionen (Fraktionsvorsitz, Sprecherrollen) zum Stichtag.

Erst nach diesen Prüfungen darf `geprueftAm` gesetzt werden; das Paket bleibt bis dahin
ausdrücklich Vorbereitungsstand. Import und Aktivierung bleiben unabhängig davon
freigabepflichtige Betreiberentscheidungen (`CLAUDE.md` §5).

---

## Berlin (Abgeordnetenhaus, 19. Wahlperiode)

### Dirk Stettner

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/dirk-stettner`
- **URL-Beleg:** URL erschien wörtlich in der Suchtrefferliste (Titel: "Dirk Stettner – Abgeordnetenhaus Berlin") bei mehreren Suchanfragen (u.a. site:parlament-berlin.de)
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf https://www.parlament-berlin.de/Abgeordnete/dirk-stettner am 2026-08-24; auch abgeordnetenwatch.de war EGRESS_BLOCKED)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.cdu-fraktion.berlin.de/person/94/Dirk-Stettner` · `https://www.dirk-stettner.de/` · `https://www.abgeordnetenwatch.de/profile/dirk-stettner` · `https://en.wikipedia.org/wiki/Dirk_Stettner` · `https://berliner-abendblatt.de/kiez-news/pankow/praesident-des-abgeordnetenhauses-verliert-direktmandat-id205575`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Aktuelle Ausschussmitgliedschaften in der 19. WP: aus keinem Suchtreffer belegbar (als Fraktionsvorsitzender moeglicherweise ohne ordentliche Ausschusssitze) — nur bytegenau auf parlament-berlin.de/Abgeordnete/dirk-stettner pruefbar
  1. Bestaetigung des Direktmandats Pankow 4 direkt aus amtlicher Quelle (wahlen-berlin.de/parlament-berlin.de); aktuell nur Sekundaerquellen (Berliner Abendblatt: Wiederholungswahl 12.02.2023, Stettner 29,6 % Erststimmen vor Buchner/SPD 19,6 %; Wikipedia/abgeordnetenwatch: Wahlkreis Pankow 4)
  1. Exakte amtliche Wahlkreisbezeichnung/-zuschnitt der 19. WP
  1. Mitglied des Abgeordnetenhauses seit 2011 mit Unterbrechung 2016-2018 (laut Wikipedia) — amtlich gegenpruefen
- **Hinweise:** Alle Angaben beruhen auf Suchmaschinen-Snippets (parlament-berlin.de-Trefferliste, Wikipedia, abgeordnetenwatch, CDU-Fraktion, Berliner Abendblatt); Direktabruf der amtlichen Seite und von abgeordnetenwatch war durch den Egress-Proxy gesperrt. Fraktionsvorsitz seit 27.04.2023 mehrfach uebereinstimmend belegt (cdu-fraktion.berlin.de, cducsufvk.de, Wikipedia). Frueherer Sprecher fuer Bildung, Jugend und Familie war die 18. WP (2016-2021) und ist NICHT aktuell.

### Christian Goiny

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/christian-goiny`
- **URL-Beleg:** URL erschien wörtlich in der Suchtrefferliste (Titel: "Christian Goiny – Abgeordnetenhaus Berlin"), zusaetzlich Variante mit ?committeeSlug=19-hauptausschuss
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf https://www.parlament-berlin.de/Abgeordnete/christian-goiny am 2026-08-24; auch abgeordnetenwatch.de war EGRESS_BLOCKED)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.cdu-fraktion.berlin.de/person/10/Christian-Goiny` · `https://www.abgeordnetenwatch.de/profile/christian-goiny/ausschuss-mitgliedschaften` · `https://de.wikipedia.org/wiki/Christian_Goiny` · `https://www.cdu-lichterfelde.de/christian-goiny` · `https://www.tagesspiegel.de/berlin/trotz-schwerer-vorwurfe-in-der-fordergeldaffare-berliner-cdu-politiker-christian-goiny-behalt-seinen-sprecherposten-15533837.html`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ausschussliste der 19. WP bytegenau auf parlament-berlin.de pruefen (abgeordnetenwatch-Snippet ist Sekundaerquelle; Rollen ordentlich/stellvertretend dort nicht sichtbar)
  1. Exakte amtliche Bezeichnung des Medien-/Europaausschusses in der 19. WP (Zuschnitt nach Wiederholungswahl)
  1. Direktmandat Steglitz-Zehlendorf 3 bei der Wiederholungswahl 12.02.2023 (40,5 % Erststimmen laut Sekundaerquellen dewiki/Wikipedia) amtlich auf wahlen-berlin.de gegenpruefen
  1. Aktueller Stand der Sprecherfunktionen: Tagesspiegel berichtet ueber Foerdergeldaffaere und Verbleib als haushaltspolitischer Sprecher 'vorerst' — moegliche spaetere Aenderungen pruefen
- **Hinweise:** Alle Angaben beruhen auf Suchmaschinen-Snippets; Direktabruf amtlicher Seiten und abgeordnetenwatch gesperrt. Wichtig: aeltere Trefferlisten von abgeordnetenwatch vermischen WP-Zaehlungen — Ausschuesse Wissenschaft/Forschung etc. betreffen 2016-2021 und wurden NICHT uebernommen. Geburtsdatum laut Wikipedia-Snippet 28.04.1965, Jurist, MdA seit 2006.

### Danny Freymark

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/danny-freymark`
- **URL-Beleg:** URL erschien als Suchtreffer-Titel 'Danny Freymark – Abgeordnetenhaus Berlin' in der WebSearch-Trefferliste (mehrfach, auch mit ?groupStrategy=fraktion)
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf https://www.parlament-berlin.de/Abgeordnete/danny-freymark am 2026-08-24 vom Egress-Proxy blockiert)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.cdu-fraktion.berlin.de/person/22/Danny-Freymark` · `https://www.danny-freymark.de/` · `https://www.abgeordnetenwatch.de/profile/danny-freymark/ausschuss-mitgliedschaften` · `https://www.cdu-lichtenberg.de/personen/danny-freymark-2`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte amtliche Ausschussbezeichnungen und Rollen (ordentlich/stellvertretend) in der 19. WP nur auf parlament-berlin.de bytegenau prüfbar
  1. Ob Freymark im Petitionsausschuss eine Vorsitz-/Sprecherfunktion hat (Snippets uneindeutig)
  1. Amtliche Wahlkreisnummer/-bezeichnung 'Lichtenberg 1' gegen die amtliche Wahlleiter-/Parlamentsseite verifizieren (Snippet-Basis: Wikipedia/dewiki, Erststimmenergebnis 2023 ca. 40,8 %)
  1. Fortbestand der Funktion 'stellv. Fraktionsvorsitzender' in der laufenden 19. WP (CDU stellt seit 2023 den Regierenden Bürgermeister, Fraktionsspitze umgebildet)
- **Hinweise:** Direktabruf amtlicher Seiten und abgeordnetenwatch.de in dieser Umgebung gesperrt; alle Angaben beruhen auf Suchmaschinen-Snippets und Trefferlisten-URLs. Wahlkreis-Direktmandat Lichtenberg 1 2021 erstmals gewonnen, 2023 (Wiederholungswahl) verteidigt.

### Raed Saleh

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/raed-saleh`
- **URL-Beleg:** URL erschien als Suchtreffer-Titel 'Raed Saleh – Abgeordnetenhaus Berlin' in mehreren WebSearch-Trefferlisten
- **Direktabruf-Versuch:** Nicht separat versucht; identische Domain wurde in derselben Sitzung für Freymark mit EGRESS_BLOCKED beantwortet (Egress-Proxy sperrt www.parlament-berlin.de). Zusätzlicher Versuch auf www.abgeordnetenwatch.de ebenfalls EGRESS_BLOCKED.
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.spdfraktion-berlin.de/abgeordnete/raed-saleh` · `https://www.raed-saleh.de/` · `https://spd.berlin/personen/raed-saleh-agh/` · `https://spd-spandau.de/personen/raed-saleh/` · `https://www.abgeordnetenwatch.de/profile/raed-saleh`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Aktuelle Ausschussmitgliedschaften in der 19. WP (kein Snippet nannte konkrete Ausschüsse — häufig sitzen Fraktionsvorsitzende z.B. im Hauptausschuss, das ist hier NICHT belegt und daher nicht eingetragen)
  1. Exakte Listenbezeichnung und Listenplatz (Bezirksliste Spandau) nur amtlich prüfbar
  1. Ob Saleh noch SPD-Landesvorsitzender ist: Snippets belegen die Abgabe des Parteivorsitzes 2024 — aktueller Stand nur amtlich/parteiseitig prüfbar; deshalb nicht als Funktion gelistet
  1. Vollname exakt wie im amtlichen Verzeichnis (Snippet-Basis)
- **Hinweise:** 2023 verlor Saleh das Direktmandat im Wahlkreis Spandau 2 an Ersin Nas (CDU) und zog über die Liste ein (mehrere übereinstimmende Presse-/Wikipedia-Snippets). Fraktionsvorsitz durchgehend seit 2011. Alle Angaben Snippet-basiert, amtliche Seite gesperrt.

### Jörg Stroedter

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/jorg-stroedter`
- **URL-Beleg:** In Suchtrefferliste sichtbar (Titel 'Jörg Stroedter – Abgeordnetenhaus Berlin') bei mehreren Suchen
- **Direktabruf-Versuch:** EGRESS_BLOCKED (www.parlament-berlin.de vom Egress-Proxy gesperrt); auch joerg-stroedter.de und abgeordnetenwatch.de EGRESS_BLOCKED
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.spdfraktion-berlin.de/abgeordnete/joerg-stroedter` · `https://joerg-stroedter.de/` · `https://joerg-stroedter.de/im-abgeordnetenhaus/` · `https://www.abgeordnetenwatch.de/profile/joerg-stroedter` · `https://de.wikipedia.org/wiki/J%C3%B6rg_Stroedter`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte Ausschussliste 19. WP inkl. Rollen (ordentlich/stellvertretend, Vorsitz/stellv. Vorsitz im Wirtschaftsausschuss) auf parlament-berlin.de/Abgeordnete/jorg-stroedter
  1. Listenart und Listenplatz des Mandats 2023 (Bezirksliste Reinickendorf vs. Landesliste)
  1. Ob 'stellvertretender Fraktionsvorsitzender' (in Snippets, Stand evtl. vor 2023) in der 19. WP noch gilt
  1. Amtliche Schreibweise des Vollnamens im Abgeordnetenverzeichnis
- **Hinweise:** Alle Angaben aus Suchmaschinen-Snippets, kein Direktabruf möglich (Egress-Proxy). Mandat in der 19. WP selbst ist gut belegt (19.-WP-Ausschussprotokolle und Schriftliche Anfragen 19. WP auf parlament-berlin.de/pardok). Vorsicht: mehrere Snippets vermischen 18. und 19. WP.

### Bettina Jarasch

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/bettina-jarasch`
- **URL-Beleg:** In Suchtrefferliste sichtbar (Titel 'Bettina Jarasch – Abgeordnetenhaus Berlin'), auch Variante mit ?groupStrategy=fraktion
- **Direktabruf-Versuch:** EGRESS_BLOCKED (www.parlament-berlin.de vom Egress-Proxy gesperrt); auch abgeordnetenwatch.de EGRESS_BLOCKED
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://gruene-fraktion.berlin/kontakt/bettina-jarasch-2/` · `https://www.bettina-jarasch.de/` · `https://gruene.berlin/politik-aendern-mit-bettina-jarasch` · `https://www.abgeordnetenwatch.de/profile/bettina-jarasch` · `https://en.wikipedia.org/wiki/Bettina_Jarasch`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ausschussmitgliedschaften 19. WP: aus keinem Suchtreffer belegbar (als Fraktionsvorsitzende evtl. z. B. Hauptausschuss o. ä. — reine Vermutung, daher leer gelassen); nur auf parlament-berlin.de/Abgeordnete/bettina-jarasch prüfbar
  1. Genauer Beginn des Fraktionsvorsitzes (März vs. April 2023) und des Mandats (16.03.2023, Mandatswechsel-Meldung parlament-berlin.de/Meldungen/mandatswechsel-3)
  1. Bestätigung Landesliste Platz 1 als amtliche Mandatsgrundlage
  1. Amtliche Schreibweise des Vollnamens (ggf. weitere Vornamen) im Abgeordnetenverzeichnis
- **Hinweise:** Achtung bei Suchtreffern: Angaben zu ihrer Zeit als Senatorin für Umwelt, Mobilität, Verbraucher- und Klimaschutz (12/2021–04/2023) und zur 18. WP (Mandatsverzicht 31.12.2021) sind historisch. Aktuell (19. WP) ist sie Abgeordnete und Fraktionsvorsitzende. Alle Angaben aus Suchmaschinen-Snippets, kein Direktabruf der amtlichen Seite möglich.

### Werner Sebastian Graf

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/werner-sebastian-graf`
- **URL-Beleg:** In Suchtrefferliste sichtbar (Titel: "Werner Sebastian Graf – Abgeordnetenhaus Berlin"), Suche "werner-sebastian-graf site:parlament-berlin.de"; zusätzlich existiert offenbar eine Variante /Abgeordnete/werner-graf?groupStrategy=fraktion in den Treffern
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf https://www.parlament-berlin.de/Abgeordnete/werner-sebastian-graf durch Egress-Proxy gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://gruene-fraktion.berlin/kontakt/werner-graf/` · `https://de.wikipedia.org/wiki/Werner_Graf_(Politiker)` · `https://www.abgeordnetenwatch.de/profile/werner-graf` · `https://werner-graf.net/ueber-mich/`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ausschussmitgliedschaften 19. WP: kein Suchtreffer belegt konkrete Ausschüsse — nur bytegenau auf der amtlichen Profilseite prüfbar
  1. Listenplatz/Mandatsgrundlage nach der Wiederholungswahl 2023 (amtliche Angabe zu Liste vs. Wahlkreis)
  1. Ob die amtliche Seite den Vollnamen exakt als "Werner Sebastian Graf" führt (Suchtreffer-Titel legt es nahe, Snippet ist kein endgültiger Beleg)
- **Hinweise:** Alle Angaben beruhen auf Suchmaschinen-Snippets und Sekundärquellen (Wikipedia, Fraktionsseite); Direktabruf der amtlichen Seite ist aus dieser Umgebung gesperrt. Fraktionsvorsitzende sind in Berlin häufig nicht ordentliche Mitglieder von Fachausschüssen — leer heißt hier "nicht belegt", nicht "keine".

### Katrin Schmidberger

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/katrin-schmidberger`
- **URL-Beleg:** In Suchtrefferliste sichtbar (Titel: "Katrin Schmidberger – Abgeordnetenhaus Berlin"), Suche "Katrin Schmidberger site:parlament-berlin.de"
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf https://www.parlament-berlin.de/Abgeordnete/katrin-schmidberger durch Egress-Proxy gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://gruene-fraktion.berlin/kontakt/katrin-schmidberger/` · `https://www.katrin-schmidberger.de/` · `https://www.abgeordnetenwatch.de/profile/katrin-schmidberger` · `https://gruene-xhain.de/abgeordnete/katrin-schmidberger/`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Vollständige Liste der Ausschussmitgliedschaften 19. WP inkl. ordentlich/stellvertretend — nur auf der amtlichen Profilseite bytegenau prüfbar
  1. Amtliche Wahlkreisbezeichnung inkl. Nummer auf parlament-berlin.de (WK Friedrichshain-Kreuzberg 1 bislang nur über abgeordnetenwatch/eigene Website belegt)
  1. Ob weitere Sprecherrollen/Funktionen in der 19. WP aktuell sind (Fraktionsangaben teils ohne WP-Datierung; ein Treffer bezog sich erkennbar auf die 18. WP)
- **Hinweise:** Direktabruf der amtlichen Seite gesperrt; Belege sind Suchmaschinen-Snippets und Sekundärquellen. Die Ausschusszuordnung Stadtentwicklung/Bauen/Wohnen ist durch die amtliche committeeSlug-URL (19. WP) gut gestützt.

### Tobias Schulze

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/tobias-schulze`
- **URL-Beleg:** URL sichtbar in Suchtrefferliste (Titel: 'Tobias Schulze – Abgeordnetenhaus Berlin') bei Suche 'Tobias Schulze site:parlament-berlin.de'
- **Direktabruf-Versuch:** EGRESS_BLOCKED — Zugriff auf www.parlament-berlin.de vom Egress-Proxy blockiert
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.linksfraktion.berlin/abgeordnete/tobias-schulze/` · `https://tobiasschulze.berlin/` · `https://www.abgeordnetenwatch.de/profile/tobias-schulze` · `https://de.wikipedia.org/wiki/Tobias_Schulze_(Politiker)`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte amtliche Ausschussmitgliedschaften 19. WP (Namen, ordentlich/stellvertretend) — nur auf parlament-berlin.de bytegenau prüfbar
  1. Amtlicher Vollname exakt laut Abgeordnetenverzeichnis
  1. Ob Sprecherrollen (Gesundheit, Digitalisierung) nach Übernahme des Fraktionsvorsitzes 2024 fortbestehen
  1. Genaue Mandatskonstruktion 2023 (Listenplatz, amtliche Wahlkreisnummer/-bezeichnung)
- **Hinweise:** MdA seit Oktober 2016. Seit 2024 Co-Fraktionsvorsitzender der Linksfraktion (mit Anne Helm). Alle Ausschussangaben beruhen auf Suchmaschinen-Snippets von Sekundärquellen, nicht auf der gesperrten amtlichen Seite. Achtung Verwechslungsgefahr mit gleichnamigen Politikern (u.a. Tobias Schulze, Grüne/andere Länder).

### Niklas Schrader

- **Amtliche Profilseite (unbestätigt):** `https://www.parlament-berlin.de/Abgeordnete/niklas-schrader`
- **URL-Beleg:** URL sichtbar in Suchtrefferliste (Titel: 'Niklas Schrader – Abgeordnetenhaus Berlin') bei Suche 'Niklas Schrader site:parlament-berlin.de'
- **Direktabruf-Versuch:** EGRESS_BLOCKED — Zugriff auf www.parlament-berlin.de vom Egress-Proxy blockiert
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.linksfraktion.berlin/abgeordnete/niklas-schrader/` · `https://www.abgeordnetenwatch.de/profile/niklas-schrader` · `https://www.abgeordnetenwatch.de/profile/niklas-schrader/ausschuss-mitgliedschaften` · `http://niklas-schrader.de/` · `https://en.wikipedia.org/wiki/Niklas_Schrader`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte amtliche Ausschussmitgliedschaften 19. WP inkl. amtlicher Bezeichnung des Innenausschusses und Rolle (ordentlich/stellvertretend)
  1. Mitgliedschaft im Untersuchungsausschuss zur Neuköllner Anschlagsserie in der 19. WP (Snippet könnte sich auf die 18. WP beziehen)
  1. Amtlicher Vollname exakt laut Abgeordnetenverzeichnis
  1. Listenplatz/Mandatskonstruktion bei der Wiederholungswahl Februar 2023
- **Hinweise:** MdA seit Oktober 2016, geboren 1981 in Berlin. Seit Juni 2024 Parlamentarischer Geschäftsführer der Linksfraktion. Alle Ausschussangaben beruhen auf Suchmaschinen-Snippets von Sekundär- und Fraktionsquellen; die amtliche Seite war per Direktabruf gesperrt.

## Brandenburg (Landtag, 8. Wahlperiode)

### Björn Lüttmann

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/luettmann_bjoern/24183`
- **URL-Beleg:** URL sichtbar als Treffer 1 der Suche 'Björn Lüttmann site:landtag.brandenburg.de' (Titel: 'Lüttmann, Björn - Landtag Brandenburg')
- **Direktabruf-Versuch:** EGRESS_BLOCKED — WebFetch auf https://www.landtag.brandenburg.de/de/luettmann_bjoern/24183 vom Egress-Proxy blockiert (www.landtag.brandenburg.de gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.abgeordnetenwatch.de/profile/bjoern-luettmann` · `https://bjoern-luettmann.de/` · `https://spd-fraktion-brandenburg.de/unsere-fraktion/` · `https://www.spd-oder-spree.de/meldungen/bjoern-luettmann-neuer-fraktionsvorsitzender/` · `https://www.landtag.brandenburg.de/de/meldungen/ausschuesse_des_8._landtages_brandenburg_haben_sich_konstituiert/41932`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Vollständige Liste seiner Ausschussmitgliedschaften der 8. WP (nur Hauptausschuss-Vorsitz und Enquete-Kommission per Snippet belegt; weitere Mitgliedschaften/Stellvertretungen unbekannt)
  1. Amtliche Wahlkreisbezeichnung von Wahlkreis 9 bytegenau (Zuschnitt 2024) auf landtag.brandenburg.de
  1. Bestätigung Listenplatz 7 und Direktmandats-Ergebnis auf der amtlichen Profilseite
  1. Rolle in der Enquete-Kommission (ordentlich vs. stellvertretend)
- **Hinweise:** Alle Angaben beruhen auf Suchmaschinen-Snippets, kein Direktabruf möglich (Egress-Proxy). Ältere Treffer (stellv. Fraktionsvorsitzender, Vorsitz Gesundheitsausschuss) betreffen die 7. WP und wurden nicht als aktuell übernommen. MdL seit 08.10.2014.

### Ludwig Scheetz

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/scheetz_ludwig/24191`
- **URL-Beleg:** URL sichtbar in der Trefferliste der Suche 'Ludwig Scheetz site:landtag.brandenburg.de' (Titel: 'Scheetz, Ludwig - Landtag Brandenburg')
- **Direktabruf-Versuch:** EGRESS_BLOCKED — WebFetch auf https://www.landtag.brandenburg.de/de/scheetz_ludwig/24191 vom Egress-Proxy blockiert (www.landtag.brandenburg.de gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.abgeordnetenwatch.de/profile/ludwig-scheetz` · `https://de.wikipedia.org/wiki/Ludwig_Scheetz` · `https://ludwig-scheetz.de/arbeit-im-landtag/` · `https://spd-fraktion-brandenburg.de/press/ludwig-scheetz-4-maerz2025/` · `https://www.landtag.brandenburg.de/de/parlament/praesidentin_und_praesidium/praesidium/25223`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ausschussliste der 8. WP bytegenau auf der amtlichen Profilseite (Innen/Kommunales, Hauptausschuss, Wahlprüfungsausschuss bislang nur über Wikipedia-/Suchsnippets belegt), inkl. ordentlich vs. stellvertretend
  1. Amtliche Wahlkreisbezeichnung 'Wahlkreis 27 Dahme-Spreewald II/Oder-Spree I' im amtlichen Wortlaut
  1. Aktueller Status als Parlamentarischer Geschäftsführer per amtlicher/Fraktionsseite (letzter datierter Beleg: Fraktions-Pressemitteilung 04.03.2025 und PK-Termine)
  1. Mitgliedschaft in der Ständigen Parlamentarierkonferenz mit dem Abgeordnetenhaus von Berlin (nur Snippet-Hinweis)
- **Hinweise:** Alle Angaben beruhen auf Suchmaschinen-Snippets, kein Direktabruf möglich (Egress-Proxy). MdL seit 2019, Direktmandat im Wahlkreis 27 bei der Landtagswahl September 2024 erneut gewonnen (Snippets abgeordnetenwatch/Wikipedia). Der Treffer 'PK mit Fraktionsvorsitzendem Daniel Keller' stammt aus der Zeit vor Dezember 2024 (Keller schied als Fraktionsvorsitzender aus) und belegt nur die damalige PGF-Rolle.

### Prof. Dr. Ulrike Liedtke

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/liedtke_ulrike_(prof._dr.)/11247`
- **URL-Beleg:** In der Suchtrefferliste sichtbar: Titel "Liedtke, Ulrike (Prof. Dr.) - Landtag Brandenburg" mit URL .../de/liedtke_ulrike_(prof._dr.)/11247 (WebSearch site:landtag.brandenburg.de, 2026-08-24)
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf die amtliche Profil-URL wurde vom Egress-Proxy blockiert)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.landtag.brandenburg.de/de/parlament/praesidentin_und_praesidium/praesidentin/25222` · `https://www.landtag.brandenburg.de/de/meldungen/landtag_konstituiert_sich_zur_8._wahlperiode_und_bestaetigt_praesidentin_ulrike_liedtke_im_amt/40863` · `https://wahlergebnisse.brandenburg.de/12/500/20240922/landtagswahl_land/ergebnisse_wahlkreis_03.html` · `https://ulrike-liedtke.de/de/home/` · `https://www.abgeordnetenwatch.de/profile/ulrike-liedtke`
- **Konfidenz der Recherche:** hoch
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte amtliche Schreibweise des Profils (Titel, Namensreihenfolge) auf landtag.brandenburg.de
  1. Ob für die 8. WP eine (ggf. stellvertretende) Ausschussmitgliedschaft besteht — Snippets nennen keine, Negativbeweis fehlt
  1. Amtliche Wahlkreisbezeichnung/Nummer ("Wahlkreis 03 Ostprignitz-Ruppin I") bytegenau gegen die amtliche Seite
  1. Listenplatz 2 der SPD-Landesliste 2024 (nur aus Suchsnippet)
  1. Vollständige aktuelle Funktionen/Mitgliedschaften laut amtlichem Profil
- **Hinweise:** Direktmandat 2024 im Wahlkreis 03 Ostprignitz-Ruppin I: laut Suchtreffern (wahlergebnisse.brandenburg.de / en.wikipedia.org) 11.663 Erststimmen (34,6%), vor Henry Preuß (AfD, 32,2%). Als Landtagspräsidentin wiedergewählt bei der Konstituierung zur 8. WP im Oktober 2024 (amtliche Meldungen 40861/40863 in Suchtreffern, 70 Stimmen im ersten Wahlgang laut Snippet). Keine Fachausschuss-Mitgliedschaft für die 8. WP in Suchtreffern belegt — als Präsidentin üblich, aber nicht verifiziert. Alle Angaben beruhen auf Suchmaschinen-Snippets, nicht auf Direktabruf der amtlichen Seite.

### Katja Poschmann

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/poschmann_katja/24188`
- **URL-Beleg:** In der Suchtrefferliste sichtbar: Titel "Poschmann, Katja - Landtag Brandenburg" mit URL .../de/poschmann_katja/24188 (WebSearch site:landtag.brandenburg.de, 2026-08-24)
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf die amtliche Profil-URL wurde vom Egress-Proxy blockiert)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.abgeordnetenwatch.de/profile/katja-poschmann` · `https://de.wikipedia.org/wiki/Katja_Poschmann` · `https://katja-poschmann.de/` · `https://spd-fraktion-brandenburg.de/unsere-fraktion/` · `https://www.landtag.brandenburg.de/de/buergerbuero/buergerbuero_katja_poschmann/11194`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Hauptausschuss-Mitgliedschaft (ordentlich/stellvertretend/keine) für die 8. WP
  1. Vollständige Ausschussliste inkl. stellvertretender Mitgliedschaften auf dem amtlichen Profil
  1. Exakter Listenplatz auf der SPD-Landesliste 2024
  1. Amtliche Bezeichnung und Nummer des Betreuungswahlkreises (Suchtreffer: Wahlkreis 4 Ostprignitz-Ruppin III/Havelland III)
  1. Genaue aktuelle Sprecherfunktion(en) in der SPD-Fraktion (bildungs- vs. wissenschaftspolitisch)
  1. Bestätigung der stellvertretenden Fraktionsvorsitz-Funktion für die 8. WP auf amtlicher/fraktionsamtlicher Seite
- **Hinweise:** MdL seit 2019 (7. WP: Direktmandat Ostprignitz-Ruppin III/Havelland III). 2024 Direktmandat laut Suchtreffern verloren, Einzug über Landesliste — daher mandatsart liste. Ein Snippet nannte sie zudem wissenschaftspolitische Sprecherin; ein anderes bildungspolitische Sprecherin — genaue aktuelle Sprecherrolle nur amtlich/fraktionsseitig prüfbar. Alle Angaben beruhen auf Suchmaschinen-Snippets, nicht auf Direktabruf.

### Steeven Bretz

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/bretz_steeven/13468`
- **URL-Beleg:** URL in Suchtrefferliste sichtbar (Treffer 'Bretz, Steeven - Landtag Brandenburg' bei Suche 'Steeven Bretz site:landtag.brandenburg.de')
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf www.landtag.brandenburg.de vom Egress-Proxy blockiert)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.cdu-fraktion-brandenburg.de/person/10/Steeven-Bretz` · `https://www.abgeordnetenwatch.de/profile/steeven-bretz` · `https://en.wikipedia.org/wiki/Steeven_Bretz` · `https://buergerbeteiligung.potsdam.de/content/landtagswahl-2024-ergebnisse-potsdam`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakter Listenplatz auf der CDU-Landesliste 2024 (Quellen nennen Platz 5 bzw. 6) — nur auf wahlen.brandenburg.de/amtlicher Bekanntmachung bytegenau pruefbar
  1. Vollstaendige, aktuelle Ausschussliste der 8. WP inkl. Rollen — nur auf der amtlichen Profilseite pruefbar (Direktabruf blockiert)
  1. Genaues Datum der Uebernahme des Fraktionsvorsitzes (Maerz 2026 laut Snippet)
  1. Ob weitere Gremien (z.B. Parlamentarisches Kontrollgremium, Wahlpruefungsausschuss) bestehen
- **Hinweise:** Alle Ausschussangaben stammen aus Suchmaschinen-Snippets mit explizitem 8.-WP-Bezug; amtliche Seite nicht direkt abrufbar. Bretz war 2019-2024 (7. WP) Parlamentarischer Geschaeftsfuehrer — diese Funktion endete laut Snippets mit Uebernahme des Fraktionsvorsitzes im Maerz 2026 (2024 bis Maerz 2026 PGF in der 8. WP).

### Kristy Augustin

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/augustin_kristy/13480`
- **URL-Beleg:** im Auftrag vorgegeben; zusaetzlich in Suchtrefferliste sichtbar ('Augustin, Kristy - Landtag Brandenburg')
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch auf www.landtag.brandenburg.de vom Egress-Proxy blockiert)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.cdu-fraktion-brandenburg.de/person/11/-Kristy-Augustin.html` · `https://www.abgeordnetenwatch.de/profile/kristy-augustin` · `https://www.kristy-augustin.de/` · `https://en.wikipedia.org/wiki/Kristy_Augustin`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Bytegenaue Ausschussliste der 8. WP auf der amtlichen Profilseite (Direktabruf blockiert) — insbesondere ob Petitionsausschuss-Mitgliedschaft in der 8. WP fortbesteht oder nur 7. WP war
  1. Amtliche Bezeichnung und Rolle im Landwirtschafts-/Umwelt-/Verbraucherschutzausschuss der 8. WP
  1. Ob sie in der 8. WP weitere Gremien (z.B. Richterwahlausschuss) besetzt
  1. Exakte amtliche Schreibweise des Vollnamens im Handbuch der 8. WP
- **Hinweise:** Mandatsart gemaess Auftragskorrektur: Einzug ueber Landesliste Platz 2, NICHT ueber Wahlkreis 34 (dort nur Kandidatur, 15,2 %). Die 7.-WP-Ausschuesse (u.a. Bildung/Jugend/Sport) wurden nicht ungeprueft uebernommen; die Bildungs-Zuordnung stuetzt sich auf das aktuelle 8.-WP-Fraktionsprofil (Sprecherrolle), bleibt aber Snippet-basiert.

### Niels-Olaf Lüders

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/lueders_niels-olaf/40623`
- **URL-Beleg:** URL mehrfach in Suchtrefferlisten sichtbar (Titel: "Lüders, Niels-Olaf - Landtag Brandenburg")
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch am 2026-08-24, Domain per Egress-Proxy gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://bsw-fraktion-brandenburg.de/abgeordnete/niels-olaf-lueders/` · `https://www.abgeordnetenwatch.de/profile/niels-olaf-lueders/ausschuss-mitgliedschaften` · `https://de.wikipedia.org/wiki/Niels-Olaf_L%C3%BCders` · `https://www.tagesspiegel.de/potsdam/brandenburg/neue-bsw-fraktionsspitze-niels-olaf-luders-neuer-bsw-fraktionschef-im-landtag-12871069.html`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Exakte aktuelle Ausschussliste inkl. ordentlich/stellvertretend auf der amtlichen Profilseite
  1. Amtliche Bezeichnung des Rechtsausschusses der 8. WP ("Ausschuss für Recht und Digitalisierung"?)
  1. Listenplatz 4 der BSW-Landesliste
  1. Präsidiumsmitgliedschaft (Funktion im Präsidium)
  1. Fortbestand des Fraktionsvorsitzes zum Stichtag 2026-08-24
- **Hinweise:** Amtliche Schreibweise mit Bindestrich: "Niels-Olaf Lüders". Rechtsanwalt, geb. 1966 in Güstrow, wohnhaft Strausberg. 2024 von der Linken zum BSW gewechselt. Kontext August 2026: vier Abgeordnete traten aus der BSW-Partei aus (blieben aber in der Fraktion); Lüders selbst blieb BSW und Fraktionschef (Tagesspiegel). Alle Ausschussangaben stammen aus Suchmaschinen-Snippets, nicht aus Direktabruf.

### Christian Dorst

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/dorst_christian/40618`
- **URL-Beleg:** URL in Suchtrefferliste sichtbar (Titel: "Dorst, Christian - Landtag Brandenburg")
- **Direktabruf-Versuch:** EGRESS_BLOCKED (WebFetch am 2026-08-24, Domain per Egress-Proxy gesperrt)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://bsw-fraktion-brandenburg.de/abgeordnete/christian-dorst/` · `https://www.abgeordnetenwatch.de/profile/christian-dorst/ausschuss-mitgliedschaften` · `https://de.wikipedia.org/wiki/Christian_Dorst`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ob Dorst aktuell (noch) Mitglied des Ausschusses für Infrastruktur und Landesplanung ist — Sekundärquellen ja, amtlicher Snippet nein; bytegenau auf landtag.brandenburg.de zu klären
  1. Ordentlich vs. stellvertretend bei Inneres/Kommunales und Bildung/Jugend/Sport (Widerspruch zwischen amtlichem Snippet und Sekundärquellen)
  1. Amtliche Bezeichnung der Corona-Enquete-Kommission und des Rechtsausschusses der 8. WP
  1. Listenplatz auf der BSW-Landesliste 2024
  1. Aktuelle Sprecherfunktionen zum Stichtag 2026-08-24
- **Hinweise:** KORREKTUR BEACHTET: Die Mitgliedschaft im Ausschuss für Infrastruktur und Landesplanung wird NICHT als gesichert geführt. Sie erscheint nur in Sekundärquellen-Snippets (abgeordnetenwatch/Wikipedia, möglicherweise veralteter Stand von der Konstituierung 2024); der Snippet zur amtlichen Profilseite nennt sie NICHT, sondern Bildung/Jugend/Sport, Inneres/Kommunales und Haushalt/Finanzen — mögliche zwischenzeitliche Umbesetzung. Bauunternehmer, geb. 1970, seit Mai 2024 BSW-Mitglied, MdL seit Oktober 2024. Alle Angaben aus Suchmaschinen-Snippets, kein Direktabruf möglich.

### Jenny Meyer

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/meyer_jenny/40625`
- **URL-Beleg:** URL in Suchtrefferliste sichtbar (Titel: 'Meyer, Jenny - Landtag Brandenburg', Site-Search auf landtag.brandenburg.de)
- **Direktabruf-Versuch:** EGRESS_BLOCKED (www.landtag.brandenburg.de vom Egress-Proxy gesperrt); Fraktionsseite bsw-fraktion-brandenburg.de ebenfalls EGRESS_BLOCKED
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://bsw-fraktion-brandenburg.de/abgeordnete/jenny-meyer/` · `https://www.abgeordnetenwatch.de/profile/jenny-meyer` · `https://de.wikipedia.org/wiki/Jenny_Meyer_(Politikerin)`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Ordentliche Mitgliedschaft im Ausschuss für Infrastruktur und Landesentwicklung bytegenau auf amtlicher Profil-/Ausschussseite bestätigen (Snippets widersprüchlich; ein Suchlauf bestätigte Mitgliedschaft, ein anderer nicht)
  1. Rolle im Ausschuss für Haushaltskontrolle klären (ordentlich vs. stellvertretend)
  1. Vollständige und aktuelle Liste aller Ausschussmitgliedschaften der 8. WP gegen amtliche Seite abgleichen (Fraktionsseiten-Snippets sind kein amtlicher Beleg)
  1. Sprecherrolle Wissenschaftspolitik verifizieren (nur in einem Suchtreffer-Snippet genannt)
  1. Schriftführerinnen-Funktion auf amtlicher Seite bestätigen
- **Hinweise:** Infrastruktur-Profil plausibel belegt: Sprecherin für Energie, Bauen/Wohnen und Landesplanung (Fraktionsseite) plus Hinweis auf Mitgliedschaft im Ausschuss für Infrastruktur und Landesentwicklung — die Ausschussmitgliedschaft selbst ist aber nur snippet-belegt und in einem Gegencheck nicht erneut bestätigt worden. Diplom-Chemikerin, geb. 1975; bis 2023 Die Linke, seit 2024 BSW (Landesvorstand BSW Brandenburg). Alle Angaben beziehen sich erkennbar auf die 8. WP (seit 2024).

### Falk Peschel

- **Amtliche Profilseite (unbestätigt):** `https://www.landtag.brandenburg.de/de/peschel_falk/40626`
- **URL-Beleg:** im Auftrag vorgegeben; zusätzlich in Suchtrefferliste sichtbar (Titel: 'Peschel, Falk - Landtag Brandenburg')
- **Direktabruf-Versuch:** EGRESS_BLOCKED (www.landtag.brandenburg.de vom Egress-Proxy gesperrt); Fraktionsseite bsw-fraktion-brandenburg.de ebenfalls EGRESS_BLOCKED
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://bsw-fraktion-brandenburg.de/abgeordnete/falk-peschel/` · `https://www.abgeordnetenwatch.de/profile/falk-peschel/ausschuss-mitgliedschaften` · `https://de.wikipedia.org/wiki/Falk_Peschel`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Hauptausschuss-Mitgliedschaft bytegenau auf der amtlichen Profilseite bestätigen (Auftrag warnt vor Übernahme alter Angaben; aktuelle Sekundärquellen nennen ihn aber übereinstimmend als ordentliches Mitglied der 8. WP)
  1. Stellvertretende Mitgliedschaft im Ausschuss für Haushaltskontrolle klären (nur in einem Suchlauf genannt)
  1. Amtliche Bezeichnung und Rolle beim Rat für Angelegenheiten der Sorben/Wenden prüfen
  1. Vollständigkeit der Ausschussliste der 8. WP gegen amtliche Seite abgleichen
  1. Etwaige Fraktionsämter (z.B. Parlamentarischer Geschäftsführer) prüfen — aus Suchtreffern nicht belegbar
- **Hinweise:** Geb. 13.07.1974 in Hoyerswerda, Diplom-Verwaltungswirt; MdL seit 2024 (8. WP). Alle Ausschussangaben stammen aus Suchmaschinen-Snippets zu Fraktionsseite und abgeordnetenwatch, die erkennbar die 8. WP (2024–2029) betreffen — kein endgültiger amtlicher Beleg, da landtag.brandenburg.de aus dieser Umgebung gesperrt ist. Die im Auftrag als korrekturbedürftig markierten Angaben (Hauptausschuss, Haushaltskontrolle) wurden nicht ungeprüft übernommen: Hauptausschuss ist mehrfach aktuell belegt (ordentlich), Haushaltskontrolle bleibt unklar.

## Sonderprüfung: Annika Klose (Bundestag, 21. WP — bestehendes aktives Mandat, NICHT Teil des Pakets)

### Annika Klose

- **Amtliche Profilseite (unbestätigt):** `https://www.bundestag.de/abgeordnete/biografien/K/klose_annika-1045438`
- **URL-Beleg:** URL mehrfach in WebSearch-Trefferlisten sichtbar (Titel: "Abgeordnetenbiografie von Annika Klose - Deutscher Bundestag"); die ältere ID 860418 ist die archivierte 20.-WP-Biografie
- **Direktabruf-Versuch:** EGRESS_BLOCKED — WebFetch auf www.bundestag.de vom Egress-Proxy blockiert (protokolliert 2026-08-24)
- **Weitere gefundene Quellen (Sekundär, unbestätigt):** `https://www.spdfraktion.de/abgeordnete/klose-annika` · `https://www.annika-klose.de/` · `https://www.abgeordnetenwatch.de/profile/annika-klose` · `https://www.bundestag.de/webarchiv/abgeordnete/biografien20/K/klose_annika-860418`
- **Konfidenz der Recherche:** mittel
- **Fehlende bytegenaue Prüfungen:**
  1. Bytegenaue Bestätigung der 21.-WP-Ausschussliste auf https://www.bundestag.de/abgeordnete/biografien/K/klose_annika-1045438 (Direktabruf blockiert; alle Angaben beruhen auf Suchmaschinen-Snippets)
  1. Amtliche Bestätigung der Obfrau-Funktion im Ausschuss für Arbeit und Soziales (Snippets belegen nur 'arbeits- und sozialpolitische Sprecherin' der Fraktion, nicht das Wort 'Obfrau')
  1. Amtliche Wahlkreisnummer/-bezeichnung von Berlin-Mitte für die Bundestagswahl 2025 (Nummer in Treffern nicht sichtbar; daher wahlkreis=null)
  1. Exakter Landeslistenplatz (Platz 2 nur aus Sekundärquelle wen-waehlen.de)
  1. Etwaige Ausschuss-Umbesetzungen 2026 (keine Hinweise in Suchtreffern gefunden, aber Abwesenheit von Treffern ist kein Beweis)
  1. Fortbestand der Rolle als Sprecherin der Landesgruppe Berlin in der 21. WP
- **Hinweise:** Kein Hinweis auf Änderungen gegenüber dem Projekt-Altstand (WP-21-Korrektur 2026-08-04) gefunden: Ausschuss für Arbeit und Soziales ordentlich, Finanzausschuss stellvertretend, jeweils seit 21.05.2025. Petitionsausschuss war laut Webarchiv-Treffern nur 20. WP und taucht für die 21. WP nirgends auf. 5 Suchanfragen durchgeführt; amtliche Seite nicht direkt abrufbar (EGRESS_BLOCKED), daher Konfidenz nicht 'hoch'.

