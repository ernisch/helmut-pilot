# Fachliche Paketvollständigkeit — Nachweis (Phase-1-Punkt 13)

**Erhebung:** 2026-07-26 · **Korrekturen:** Ausschuss-Sollmenge (§2a), Abschlusskorrektur Niedersachsen / nicht-anwendbar / Fraktionen (§2b) und **Vollabgleich der Ausschussstruktur gegen die amtliche Bundestagsgrundlage (§2c)**, alle 2026-07-26 · **Grundlage:** `main` `9f1def5` (Merge #130) + Arbeitsbranch
`claude/helmut-phase1-punkt13-9iwu69` · **Methode:** rein lesend gegen den committeten Code,
**kein** Production-Zugriff, **keine** Datenänderung

> **Was diese Datei beantwortet.** „Ist jedes Quellenpaket **fachlich** vollständig — oder nur
> technisch angelegt?" Sie erfüllt Punkt **13** aus
> [`../roadmap/phase_1_checkliste.md`](../roadmap/phase_1_checkliste.md).
>
> **Abgrenzung zur Inventur.** [`30-paket-inventur-production.md`](30-paket-inventur-production.md)
> misst den **Ist-Zustand der Production-Datenbank** (Zeilen, Ertrag, letzte Lieferung). Diese
> Datei bewertet die **fachliche Zusammensetzung der Paketdefinition** im Code. Beides ist nötig
> und beides ist verschieden: ein Paket kann fachlich vollständig zusammengesetzt sein und
> trotzdem nichts liefern (Berlin/Brandenburg), und ein Paket kann liefern und trotzdem fachlich
> unzureichend sein (`regional-niedersachsen`).
>
> **„Vollständig" heißt hier ausdrücklich NICHT „liefert".** Lieferwahrheit steht in der Inventur
> §3 und gehört zu den Punkten 10/14/15/16.

---

## 1 · Warum Punkt 13 vorher nicht beweisbar war

| Befund | Wirkung |
|---|---|
| `bund-basis`, `arbeit-und-soziales`, `die-linke-bund`, `regional-niedersachsen` trugen `required_classes: []` | Für **4 von 8** Paketen existierte kein maschinell prüfbares Vollständigkeitskriterium — „fachlich vollständig" war weder belegt noch widerlegt (Inventur §4) |
| Klassenabdeckung der Landespakete wurde aus der **Namenskonvention der Abrufweg-Ids** abgeleitet (`be-<klasse>`) | Systematische **Unterzählung**: deduplizierte Rohquellen tragen nur die *erste* Klasse in ihrer Id. Die Inventur hat das selbst als „Hilfsableitung, keine Systemwahrheit" markiert |
| `buildFullModel()` kennt für die vier `prepared`-Landespakete **0 Abrufwege** | Im kanonischen Codemodell sind sie leere Platzhalter; ihre Wege liegen ausschließlich im Landesmodul-Seed. Kein Codepfad vereinigte beide |
| Vollzähligkeitszusagen standen nur im Fließtext (`purpose`: „alle Ausschuesse", „alle Fraktionen") | Nicht prüfbar, also nicht durchgesetzt |
| **Die erste Fassung dieser Prüfung war katalogrelativ** — die Ausschuss-Sollmenge wurde aus dem Katalog abgeleitet und dann gegen den Katalog geprüft | Sie konnte nur beweisen, dass jeder *bekannte* Ausschuss im Pflichtpaket liegt, nicht dass die Menge stimmt. **Genau dort lag der Fehler: 23 statt 24** (§2a) |

## 2 · Fachliche Kriterien (jetzt ausführbar)

Umgesetzt in [`../../lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js`](../../lib/helmut/quellenarchitektur/paket-vollstaendigkeit.js),
abgesichert durch `scripts/paketvollstaendigkeit-test.js`.

| # | Kriterium | Umsetzung |
|---|---|---|
| 1 | **Zweck und politische Zuständigkeit** sind je Paket eindeutig benannt | `PACKAGE_REQUIREMENTS[key].zweck` / `.zustaendigkeit`, mit `belegt`-Herkunftsangabe |
| 2 | **Pflichtklassen** (Themen/Ebenen/Institutionstypen) sind besetzt | `required_classes` der Paketdefinition (geht in die DB) ∩ abgeleitete Klassen der zugeordneten Abrufwege |
| 3 | **Pflicht-Herausgeberklassen** sind vertreten | `evidence_role` der Herausgeber (`official_primary`/`direct_interest`/`journalistic`/`data_source`/`aggregator`) |
| 4 | **Vollzähligkeit** statt Behauptung | Regeln `alle_institutionellen_ausschuesse`, `alle_bundestagsfraktionen`, `alle_genannten_regionen` |
| 5 | **Mindestens ein benannter Herausgeber** je Paket | ≥ 1 Abrufweg mit `evidence_role != aggregator` |
| 6 | **Leere Platzhalter** werden erkannt | Pflichtklassen deklariert + 0 Abrufwege → `blockiert` |
| 7 | **Falsche/doppelte Zuordnungen** werden erkannt | jede Mehrfachzuordnung muss in `ZULAESSIGE_UEBERSCHNEIDUNGEN` deklariert und begründet sein |
| 8 | **Fachlich unmögliche** Pflichtklassen werden getrennt geführt | `nichtAnwendbar` mit Begründung — zählt **nicht** als erledigt, Paket bleibt „teilweise" |
| 9 | **Vorbereitet ≠ aktiv** | Status- und `activation_mode`-Prüfung; Berlin/Brandenburg bleiben `prepared`/`manual` |
| 10 | **Determinismus** | Generatorlauf byte-identisch, zwei Bewertungsläufe identisch, Drift-Gate greift |

### Klassenableitung

Die Klasse eines Abrufwegs wird **deterministisch aus committeten Katalogmerkmalen** abgeleitet
(`type`, `neutral`, `regional`, `party`, Id-Herkunft) — nicht aus einer gepflegten Namensliste.
Für die Landesmodul-Wege wird die im Seed bereits vorhandene `covers`-Angabe übernommen statt neu
geraten. 18 Bundesklassen, 15 Landesklassen; **jede** der 143 Katalogquellen erhält mindestens
eine Klasse (getestet).

Der institutionelle Ausschussweg ist am Namensanfang `„Ausschuss …"` verankert. Das ist nötig,
weil die 25 Themen-×-Kontext-Bündel denselben `type: "committee"` tragen, aber
`„<Thema> · Ausschuss …"` heißen — ohne die Verankerung hätten Themensuchen als
Ausschussabdeckung gezählt (getestet als Negativkontrolle).

## 2a · Korrektur: die Ausschuss-Sollmenge ist jetzt extern verankert

**Befund (2026-07-26, externe Prüfung).** Der Katalog führte **23** ständige Bundestagsausschüsse.
Der 21. Deutsche Bundestag hat **24** — eingesetzt durch Beschluss vom **15. Mai 2025** auf
Grundlage der **Drucksache 21/150** vom 13. Mai 2025 (gemeinsamer Antrag CDU/CSU und SPD,
„Einsetzung von Ausschüssen"). Amtliche Bekanntgabe der Zahl:
`bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982` und
`bundestag.de/presse/hib/kurzmeldungen-1065308`.

### Was gefehlt hat

**Der Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung** (§ 128 GO-BT; einer der vier
kleinsten Ausschüsse der Wahlperiode mit 14 Mitgliedern) war im Katalog **überhaupt nicht
vorhanden** — kein Abrufweg, keine Zuordnung, keine Erwähnung. Für die 21. Wahlperiode belegt
durch die amtliche Ausschuss-Tagesordnung `bundestag.de/resource/blob/1178498/to07.pdf`
(7. Sitzung) und die kanonische Ausschussseite `bundestag.de/go`.

### Ursache der Abweichung 23 statt 24

Kein Zählfehler, sondern eine **fehlende externe Verankerung** in zwei Schichten:

1. Die Katalogliste `bundestagCommitteeSources` war eine **handgepflegte Auswahl von
   Politikfeldern** („Breite Abdeckung ALLER Bundestags-Ausschüsse/Politikfelder"), nie ein
   Abgleich gegen den Einsetzungsbeschluss. Ein Ausschuss ohne eigenes Sachpolitikfeld —
   Wahlprüfung/Immunität/Geschäftsordnung ist parlamentarische Selbstorganisation — fiel dabei
   durch das Raster.
2. Die Vollzähligkeitsregel leitete ihre Sollmenge **aus demselben Katalog** ab. Sie war damit
   per Konstruktion erfüllbar: sie konnte 23 von 23 bestätigen, ohne zu wissen, dass 24 richtig ist.

**Zusätzlich stammten mehrere Bezeichnungen und Zuschnitte aus der 20. Wahlperiode** — die
Ausschussstruktur wurde zur 21. Wahlperiode am neuen Ressortzuschnitt ausgerichtet:

| Katalog-Id (unverändert) | vorher (20. WP) | jetzt (21. WP, amtlich) |
|---|---|---|
| `committee-landwirtschaft` | Ausschuss Ernährung und Landwirtschaft | **Ausschuss für Landwirtschaft, Ernährung und Heimat** |
| `committee-familie` | Ausschuss Familie, Senioren, Frauen und Jugend | **Ausschuss für Bildung, Familie, Senioren, Frauen und Jugend** |
| `committee-bildung` | Ausschuss Bildung und Forschung | **Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung** |
| `committee-klima-umwelt` | Ausschuss Klima und Umwelt | **Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit** |
| `committee-recht` | Ausschuss Recht | **Ausschuss für Recht und Verbraucherschutz** |
| `committee-digitales` | Ausschuss Digitales | **Ausschuss für Digitales und Staatsmodernisierung** |
| `committee-bau-wohnen` | Ausschuss Bauen und Wohnen | **Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen** |
| `committee-sport` | Ausschuss Sport | **Ausschuss für Sport und Ehrenamt** |
| `committee-europa` | Ausschuss Europäische Union | **Ausschuss für die Angelegenheiten der Europäischen Union** |
| `committee-verteidigung` · `committee-finanzen` · `committee-haushalt` · `committee-auswaertiges` · `committee-petitionen` | Kurzform „Ausschuss …" | **Verteidigungsausschuss · Finanzausschuss · Haushaltsausschuss · Auswärtiger Ausschuss · Petitionsausschuss** |

Die Umbenennung von `committee-bildung` ist keine Kosmetik, sondern ein **Zuschnittwechsel**:
Bildung liegt in der 21. Wahlperiode beim Familienausschuss, Forschung/Technologie/Raumfahrt
bildet einen eigenen Ausschuss. Beide Suchdefinitionen sind entsprechend korrigiert.

### Was geändert wurde

1. **Neue kanonische Quelle:**
   [`../../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js`](../../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js) —
   Wahlperiode, Einsetzungsbeschluss und die **24** Ausschüsse mit stabiler fachlicher Kennung,
   amtlicher Bezeichnung und je eigenem amtlichen Fundstellenhinweis. Diese Datei wird **nicht**
   aus dem Katalog abgeleitet; der Katalog wird gegen sie geprüft.
2. **Katalog korrigiert:** alle 24 Ausschussquellen tragen jetzt die amtliche Bezeichnung (aus der
   Sollmenge geholt, nicht doppelt gepflegt) und eine `ausschussKey`-Kennung. Der fehlende
   24. Ausschuss ist als Abrufweg `rp-committee-wahlpruefung` ergänzt — **derselbe
   Google-News-Suchweg wie die anderen 22**, mit Suchbegriffen strikt aus der amtlichen
   Bezeichnung („Wahlprüfung OR Immunität OR Geschäftsordnung OR Wahlrecht"). Keine erfundene
   Quelle, keine erfundene URL.
3. **Katalog-Ids eingefroren.** Auch wo der Slug nicht mehr zum Namen passt (`committee-bildung`
   trägt jetzt den Forschungsausschuss). Eine Id-Änderung würde beim Seed-Einspielen eine **neue**
   `retrieval_paths`-Zeile anlegen und die alte als Waise im Pflichtpaket zurücklassen, wo sie
   weiter gecrawlt würde. Die fachliche Bindung läuft deshalb über `ausschussKey`, nicht über den Slug.
4. **Erkennung umgestellt:** „institutioneller Ausschuss" wird über `ausschussKey` erkannt, nicht
   mehr über das Namensmuster `^Ausschuss `. Fünf der 24 amtlichen Bezeichnungen beginnen nicht
   mit „Ausschuss " — die Namensverankerung hätte sie ab jetzt übersehen.
5. **Vollzähligkeitsregel umgestellt:** `alle_institutionellen_ausschuesse` prüft gegen die
   externe Sollmenge (24) statt gegen das Kataloginventar und nennt die geprüfte Wahlperiode.
6. **Rückweg nachgezogen:** Seed 1 legt jetzt erstmals einen **neuen Abrufweg** an. Der gezielte
   Restore (`scripts/seed-restore-sql.js`) deckte diesen Fall nicht ab und hätte die neue Zeile
   stehen gelassen — gefangen durch die Byte-Gleichheitsprüfung des Restore-Tests. Er entfernt sie
   jetzt *guarded* (nur wenn keine `package_paths`-Zeile sie mehr referenziert, wegen
   `on delete cascade`).

### Ehrliche Grenze der Recherche

`bundestag.de` und `dserver.bundestag.de` sind aus der Agentensitzung **nicht direkt abrufbar**
(die Netzrichtlinie der Umgebung antwortet mit `403` auf `CONNECT`; die HTML-Seiten liefern
zusätzlich Bot-`403` — dieselbe Sperre, die auch `rp-bundestag` betrifft). Der **Volltext der
Drucksache 21/150 konnte daher nicht gelesen werden.** Die Sollmenge stützt sich auf amtliche
Bundestagsdokumente der 21. Wahlperiode, die erreichbar waren — insbesondere die
**Ausschuss-Tagesordnungen** (`bundestag.de/resource/blob/…`), die jede Bezeichnung wörtlich im
Kopf tragen, sowie die kanonischen Ausschussseiten. Jeder Eintrag der Sollmenge nennt seine
Fundstelle. **Empfehlung:** die Liste beim nächsten Zugang zu `dserver.bundestag.de` einmal
direkt gegen den Volltext von 21/150 abgleichen.

> **Nachgezogen in §2c.** Diese Empfehlung wurde umgesetzt, soweit ohne den Volltext möglich — und
> hat **zwei falsche Bezeichnungen und eine falsche Reihenfolge** gefunden. Die Anzahl war die
> ganze Zeit richtig. Siehe [§2c](#2c--vollabgleich-der-ausschussstruktur-gegen-die-amtliche-bundestagsgrundlage).
> Der Volltextabgleich bleibt als einzige offene Restprüfung bestehen.

## 2b · Abschlusskorrektur: Niedersachsen, „nicht anwendbar" und die Fraktionssollmenge

Der erste Abschluss ließ drei Punkte offen. Alle drei sind jetzt behoben — jeweils an der
kanonischen Quelle, nicht am Testwert.

### 2b.1 · `regional-niedersachsen` hat eine benannte Basis (vorbereitet, inaktiv)

**Befund.** Das Paket enthielt ausschließlich Google-News-**Themen**suchen („Salzgitter Arbeit und
Soziales"). Deren Herausgeber ist der Aggregator — 0 benannte Herausgeber, 0 amtliche und 0
journalistische Beleglage. Ursache: die Regionalmedien der Region **lagen im Katalog**, wurden aber
von `keepCuratedSource` entfernt (`type: "media"` erst ab `priority >= 64`, regionale Medien
tragen 52–60).

**Fachliche Sollmenge** eines Regionspakets (jetzt `REGIONALPAKET_PFLICHTKLASSEN`, 6 Klassen):

| Pflichtklasse | Erfüllt durch | Herausgeber | Belegfunktion | Zustand |
|---|---|---|---|---|
| `landesparlament` | `rp-nds-landtag` | `landtag-niedersachsen.de` | `official_primary` | `paused` / `manual` |
| `landesregierung` | `rp-nds-landesregierung` | `niedersachsen.de` | `official_primary` | `paused` / `manual` |
| `regionale_leitmedien` | `rp-news-haz` | `haz.de` (Hannoversche Allgemeine) | `journalistic` | `paused` / `manual` |
| `oer_landesberichterstattung` | `rp-news-ndr` | `ndr.de` | `journalistic` | `paused` / `manual` |
| `wahlkreismedien` | `rp-news-braunschweiger-zeitung`, `rp-news-salzgitter-zeitung`, `rp-news-regionalheute` | `braunschweiger-zeitung.de`, `salzgitter-zeitung.de`, `regionalheute.de` | `journalistic` | `paused` / `manual` |
| `regionalquellen` (**ergänzend**, nie allein ausreichend) | 4 bestehende Themensuchen | Aggregator | `aggregator` | unverändert `auto` |

**Wiederverwendung vor Neuanlage:** 5 der 7 benannten Wege existierten schon im Katalog und sind
hier nur angereichert (identische URL und Query). **Neu angelegt sind genau 2** — die amtliche
Landesebene, die im Katalog fehlte. Beide sind `site:`-gebundene Google-News-Suchen auf die
verifizierten amtlichen Domains (`landtag-niedersachsen.de`, `niedersachsen.de`); ein Direktfeed-
Pfad ist von hier aus nicht verifizierbar und wäre geraten — dieselbe Zurückhaltung wie im
Landesmodul BE/BB („googlenews-Ersatz site:…, kein Direkt-Feed auffindbar").

**Keine zusätzliche Crawl-Last — drei unabhängige Riegel, alle getestet:**

| # | Riegel | Wirkung |
|---|---|---|
| 1 | `crawler.crawlAllSources`: `sources.filter((source) => source.active)` | eine Quelle mit `active: false` wird nie abgerufen |
| 2 | `scheduler.sourceAllowedForProfile`: `if (source.active === false) return false;` | sie erscheint nicht in der Profilauswahl des Fallback-Pfads |
| 3 | `source-mode.buildRelationalCrawlPlan` Regel 4: `status === "paused"` | sie wird aus dem relationalen Plan ausgeschlossen („nicht-reaktiviert") |

Riegel 1 bestand bereits und ist die eigentliche Garantie; Riegel 2 wurde in diesem Sprint
ergänzt, damit die Quelle auch nicht in Auswahl und Zählwerten des Fallback-Pfads auftaucht.
Gemessen: Fallback-Pfad für ein Niedersachsen-Profil = **0 von 7**; relationaler Plan = **0 von 7**,
Ausschlussgrund `nicht-reaktiviert (status=paused)`. Zusätzlich liefert `model.isPathActive` für
einen `paused`-Weg `false`, auch bei aktivem Paket.

**Zweck präzisiert.** Der `purpose` trennt jetzt Region von Fachthema („Region, NICHT Fachthema"),
symmetrisch zur bestehenden Klarstellung bei `arbeit-und-soziales`. Die benannte Basis ist
themenoffen; nur die 4 ergänzenden Suchen tragen eine Fachbindung.

**Ergebnis:** `vollständig` (6/6 Klassen, 2 amtliche + 5 journalistische + 4 Aggregator-Wege) —
und weiterhin **nicht aktiviert**. Die Aktivierung der benannten Basis ist eine eigene
Freigabeentscheidung.

### 2b.2 · „Fachlich nicht anwendbar" ist jetzt überprüfbar

**Befund.** Die beiden Ausnahmen von `die-linke-brandenburg` standen als **Freitext** im
Anforderungsobjekt. Damit war nicht prüfbar, ob die politische Voraussetzung wirklich zutrifft —
eine echte Quellenlücke hätte sich dahinter verstecken können.

**Neu:** jede Ausnahme ist ein Objekt mit sechs Pflichtfeldern und wird gegen die kanonische
Parlamentszusammensetzung geprüft
([`../../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung.js`](../../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung.js)):

| Feld | `fraktion_pilot` | `person_pilot` |
|---|---|---|
| `kennung` | `bb8-linke-ohne-landtagsfraktion` | `bb8-linke-ohne-mandat` |
| `wahlperiode` | 8 | 8 |
| `gueltig_fuer` | Landtag Brandenburg, 8. WP (2024–2029) | Landtag Brandenburg, 8. WP (2024–2029) |
| `beleg` | Landeswahlleiterin (Endergebnis LTW 22.09.2024) + Landtagshandbuch 8. WP | Landeswahlleiterin (Landesliste nicht berücksichtigt, kein Direktmandat) |
| `voraussetzung` | `keine_fraktion` · Landtag Brandenburg · WP 8 · Partei `linke` | `keine_mandate` · Landtag Brandenburg · WP 8 · Partei `linke` |

**Amtliche Grundlage.** Landtag Brandenburg, 8. Wahlperiode: **4 Fraktionen** — SPD (32), AfD (30),
BSW (14), CDU (12), zusammen 88 Sitze. Alle weiteren Landeslisten blieben unberücksichtigt, weil
sie weder die Fünf-Prozent-Hürde überwanden noch ein Direktmandat gewannen — darunter Die Linke.
Belege: `wahlen.brandenburg.de` (Endgültiges Ergebnis LTW 24) und
`landtag.brandenburg.de/media_fast/6/Handbuch_lang_Inhalt_2025-web.pdf` (Landtagshandbuch
8. Wahlperiode).

**Vierte Ergebniskategorie.** `vollstaendig_mit_belegten_ausnahmen` — sie setzt voraus, dass **jede**
Ausnahme bestätigt wurde. Eine unbestätigte Ausnahme erzeugt den Mangel
`nicht-anwendbar-unbegruendet` **und** lässt die Klasse als offene Lücke stehen; eine Ausnahme für
eine besetzte Klasse erzeugt `nicht-anwendbar-ohne-not`. Beides führt auf „teilweise".

**Wahlperiodenwechsel.** Kehrt die Partei in den Landtag zurück, trifft `keine_fraktion` nicht mehr
zu → die Ausnahme wird unbegründet → das Paket fällt auf „teilweise" und verlangt eine bewusste
Aktualisierung. Genau das ist gewollt.

### 2b.3 · Fraktionssollmenge extern verankert — und die Alt-Angabe war falsch

**Befund.** Die Regel `alle_bundestagsfraktionen` leitete ihre Sollmenge aus **allen**
`fraction-*`-Ids des Katalogs ab und meldete „8 von 8" — dasselbe katalogrelative Fehlermuster wie
bei den Ausschüssen. Die Zahl war fachlich falsch:

| Katalogeintrag | tatsächlicher Status im 21. Bundestag | Behandlung |
|---|---|---|
| `fraction-cdu-csu`, `fraction-spd`, `fraction-gruene`, `fraction-linke`, `fraction-afd` | **Fraktion** | zählen als Fraktion (`fraktionKey`) |
| `fraction-fdp` | **nicht im Bundestag vertreten** (4,3 %) | Klasse `parteien_ohne_fraktionsstatus`; Name „FDP-Fraktion" → „FDP" |
| `fraction-bsw` | **nicht im Bundestag vertreten** (4,97 %) | Klasse `parteien_ohne_fraktionsstatus` |
| `fraction-ssw` | **1 Mandat, kein Fraktionsstatus** (Minderheitenpartei, von der 5-%-Hürde befreit) | Klasse `parteien_ohne_fraktionsstatus` |

Richtig sind **5 Fraktionen**, nicht 8. Amtliche Grundlage: Sitzverteilung des 21. Deutschen
Bundestages (630 Sitze) — CDU 164 + CSU 44 = 208 · AfD 152 · SPD 120 · Bündnis 90/Die Grünen 85 ·
Die Linke 64 · SSW 1. Belege: `bundestag.de/parlament/plenum/sitzverteilung` und
`bundestag.de/dokumente/textarchiv/2025/kw09-wahlergebnis-1049580`.

**Gruppen:** keine. Das ist als **Ableitung** aus der Sitzverteilung markiert (alle 630 Sitze
entfallen auf 5 Fraktionen und ein Einzelmandat — für eine Gruppe bleibt kein Mandat übrig), nicht
als separat zitierte Tatsache.

**Keine Quelle entfernt, keine Crawl-Änderung.** Die drei Quellen bleiben im Katalog und im
Pflicht-Basispaket (sie liefern politisch relevante Parteiberichterstattung); nur ihre fachliche
Einordnung ändert sich. `parteien_ohne_fraktionsstatus` ist eine **zusätzliche**, keine
Pflichtklasse von `bund-basis`. Alle 8 `fraction-*`-Wege behalten `activation_mode: "auto"` und
`status: "needs_review"` — 0 zusätzliche und 0 entfallene Abrufe.

## 2c · Vollabgleich der Ausschussstruktur gegen die amtliche Bundestagsgrundlage

§2a hatte die **Anzahl** extern verankert (24) und selbst empfohlen, die **Bezeichnungen** noch
einmal direkt gegen die amtliche Grundlage abzugleichen. Genau das ist hier geschehen — und der
Abgleich hat zwei Fehler gefunden. Das ist der Kernbefund dieses Nachtrags:

> **Die richtige Anzahl beweist nicht die richtige Struktur.** Die Sollmenge führte 24 von 24
> Ausschüssen und war trotzdem bei 2 Bezeichnungen falsch. Eine reine Zählprüfung hätte das
> nie gefunden.

### Verwendete amtliche Primärquelle

In der vom Betreiber vorgegebenen Reihenfolge geprüft:

| Rang | Quelle | Ergebnis |
|---|---|---|
| 1 | **Drucksache 21/150** (Volltext, `dserver.bundestag.de/btd/21/001/2100150.pdf`) | **nicht abrufbar** — HTTP `403` auf jedem Pfad; DIP ist eine JavaScript-Anwendung und liefert kein Dokument |
| 2 | **Amtliche Bundestagsseiten zum Einsetzungsbeschluss** — `textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982`, `presse/hib/kurzmeldungen-1065308`, `textarchiv/2025/kw33-ausschuesse-erklaertext-1104972` | **verwendet.** Diese Seiten zählen **alle 24 Ausschüsse in der Reihenfolge des Beschlusses mit ihren Mitgliederzahlen** auf — damit Anzahl, Bezeichnungen und Nummerierung |
| 3 | **Kanonische Ausschussseiten der 21. WP** (`bundestag.de/inneres`, `bundestag.de/ausschuesse/verkehr`, `…/umwelt`, `…/forschung`) | **verwendet** zur Bestätigung der amtlichen Einzelbezeichnung |
| 4 | **Ausschuss-Tagesordnungen der 21. WP** (`bundestag.de/resource/blob/…`) | **verwendet** — tragen die Bezeichnung wörtlich im Kopf; je Sollmengen-Eintrag als Fundstelle hinterlegt |
| 5 | **Webarchiv der 19./20. WP** (`bundestag.de/webarchiv/…`) | **verwendet, aber ausschließlich als Negativbeleg** für frühere Bezeichnungen |

**Keine Drittquelle** ist eingeflossen — keine Presseartikel, keine Wikipedia, keine
Abgeordnetenportale. Alle Fundstellen liegen auf `bundestag.de`.

**Konnte die Primärquelle vollständig geprüft werden?** Der **Volltext der Drucksache 21/150 nicht**
— diese Grenze bleibt und ist jetzt als **Datum** in der Sollmenge hinterlegt
(`EINSETZUNGSBESCHLUSS.volltext_abrufbar: false` mit Fundstelle), nicht nur als Prosa, und ist
getestet. **Anzahl, Bezeichnungen, Schreibweise und Reihenfolge konnten vollständig geprüft
werden**, weil die amtlichen Beschlussseiten (Rang 2) den Beschlussinhalt vollständig aufzählen und
jede Einzelbezeichnung zusätzlich über Rang 3/4 belegt ist.

### Gefundene Unterschiede

| Nr. | Vorher (Repository) | Amtlich (21. WP) | Art des Fehlers |
|---|---|---|---|
| **4** | „Ausschuss für Inneres und Heimat" | **„Innenausschuss"** | **Bezeichnung einer früheren Wahlperiode.** `webarchiv/…/ausschuesse20/a04_inneres` trägt genau diesen Titel — es war die Bezeichnung der **20.** WP |
| **15** | „Ausschuss für Verkehr" | **„Verkehrsausschuss"** | **Nie eine amtliche Bezeichnung.** Eine verkürzte Eigenbildung; die 19. WP hieß „Ausschuss für Verkehr und digitale Infrastruktur", die 21. heißt „Verkehrsausschuss" |

Der Innenausschuss zeigt, warum das wahlperiodengenau gepflegt werden muss:
**18. WP „Innenausschuss" → 19./20. WP „Ausschuss für Inneres und Heimat" → 21. WP wieder
„Innenausschuss"** (Belege: die Webarchiv-Seitentitel `…/ausschuesse18/a04`,
`…/ausschuesse19/a04_innenausschuss`, `…/ausschuesse20/a04_inneres` gegen die aktuelle Seite
`bundestag.de/inneres`). Eine Bezeichnung „von früher" kann also zufällig wieder richtig werden —
und genau deshalb ist sie ohne Wahlperiodenbezug kein Beleg.

**Zusätzlich korrigiert: die Reihenfolge.** Die Sollmenge behauptete im Kommentar, ihre Reihenfolge
sei die amtliche Ausschussnummerierung, prüfte das aber nicht — und für die Positionen **20–24**
stand **jede der fünf** falsch:

| Ausschuss | vorher | amtlich |
|---|---|---|
| Angelegenheiten der Europäischen Union | 24 | **20** |
| Digitales und Staatsmodernisierung | 22 | **21** |
| Kultur und Medien | 21 | **22** |
| Tourismus | 20 | **23** |
| Wohnen, Stadtentwicklung, Bauwesen und Kommunen | 23 | **24** |

Die Positionen 1–19 waren richtig. Die Nummer ist jetzt **Daten statt Kommentar** (`nummer` je
Eintrag) und wird geprüft. Unabhängig bestätigt durch die amtlichen Dokumentpräfixe der 21. WP:
`PA22_to14-pdf.pdf` für Kultur und Medien (= Nr. 22) und `a13-28-TO.pdf` für Bildung/Familie
(= Nr. 13).

### Was **nicht** abwich

- **Anzahl: 24** — bestätigt, dazu amtlich mitberichtet, dass die 21. WP **einen Ausschuss weniger**
  einsetzt als die 20. (25 → 24). Beides ist jetzt in der Sollmenge hinterlegt und getestet.
- **Die anderen 22 Bezeichnungen** — Wort für Wort bestätigt, einschließlich der Stolperstellen:
  „Ausschuss für **Landwirtschaft, Ernährung** und Heimat" (nicht „Ernährung, Landwirtschaft"),
  „Ausschuss für **die** Angelegenheiten der Europäischen Union" (mit Artikel), „Ausschuss für
  Umwelt, Klimaschutz, Naturschutz und **nukleare Sicherheit**", „Ausschuss für Forschung,
  Technologie, **Raumfahrt** und Technikfolgenabschätzung".
- **Sonderfälle** — die 7 Ausschüsse ohne `Ausschuss `-Präfix (Petitions-, Auswärtiger, Innen-,
  Finanz-, Haushalts-, Verteidigungs-, Verkehrsausschuss) werden weiter über die **Kennung**
  erkannt, nicht über den Namen. Genau dieser Entwurf hat die Korrektur schadlos aufgenommen: aus 5
  wurden 7 Kompositum-Namen, ohne dass eine Klassenzuordnung brach.
- **Zusammenlegungen / neu eingerichtete / weggefallene Ausschüsse** — die vier belegten
  Umbenennungen bzw. Neuzuschnitte gegenüber der 20. WP stehen als Negativkontrollen in
  `VERALTETE_AUSSCHUSSNAMEN` (Ernährung/Landwirtschaft, Digitales, Inneres und Heimat, Verkehr und
  digitale Infrastruktur). Ein Rückfall auf eine dieser Bezeichnungen macht die Prüfung rot, **auch
  wenn die Anzahl 24 bleibt**.

### Was geändert wurde

| Ebene | Änderung |
|---|---|
| Kanonische Sollmenge | `seeds/bundestag-ausschuesse.js`: 2 Bezeichnungen korrigiert · `nummer` (1–24) je Eintrag ergänzt und Positionen 20–24 in die amtliche Ordnung gebracht · Fundstellen der beiden Einträge auf die kanonischen Ausschussseiten der 21. WP umgestellt · 2 weitere veraltete Bezeichnungen als Negativbelege ergänzt · Abrufgrenze und 25→24-Delta als Daten hinterlegt · die Formprüfung akzeptiert jetzt strukturell `Ausschuss für …` \| `…ausschuss` \| `Auswärtiger Ausschuss` statt einer wachsenden Namensliste |
| Paketdefinition, Abrufwege, Herausgeber-Mapping, Vollständigkeitsmatrix | **keine Änderung nötig.** Die Bindung läuft über `ausschussKey`, der Name wird aus der Sollmenge gezogen — die Korrektur ist an genau **einer** Stelle passiert und im Katalog angekommen. Die Kennung `inneres-heimat` bleibt **absichtlich** stehen: eine stabile Kennung, die bei jeder Umbenennung mitwandert, wäre keine |
| Generierter Seed | `20260713_source_architecture_seed.sql`: **2 Zeilen**, nur das Namensfeld von `rp-committee-inneres` und `rp-committee-verkehr`. **0** neue Abrufwege · **0** neue Herausgeber · **0** neue Zuordnungen · **0** Änderung an Id, URL, Suchbegriffen, `status`, `activation_mode`, `is_critical`. Der Landesmodul-Seed ist **byte-identisch unverändert** |
| Tests | `bundestag-ausschuesse-test.js` **36 → 54** Prüfungen (Gruppe 6, s. §6c) · `paketvollstaendigkeit-test.js`: die Sonderfall-Prüfung von 5 auf 7 nachgezogen **und** um die namentliche Liste erweitert, damit sie nicht nur zählt · `paketzuweisung-nachweis-test.js`: Profil-Ausschussname auf die amtliche Bezeichnung gebracht |

### 6c · Zusicherung: Bezeichnung, Schreibweise, Nummer (18 Prüfungen)

Neue Gruppe 6 in `scripts/bundestag-ausschuesse-test.js`. Sie prüft **keine Zählwerte**:

- Nr. 4 heißt „Innenausschuss", Nr. 15 „Verkehrsausschuss" — namentlich festgenagelt.
- Die stabile Kennung `inneres-heimat` überlebt die Umbenennung.
- **Negativkontrolle:** fällt der Katalog auf „Ausschuss für Inneres und Heimat" zurück, erscheint
  das als `abweichenderName` **mit** Nachweis, dass die Bezeichnung einer früheren WP gehört.
- Nummern 1–24 lückenlos und eindeutig; Nummer und Listenposition über zwei unabhängige Zugriffe
  kreuzgeprüft; ein Vertauschen ohne Nummernpflege fällt auf.
- Nr. 22 = Kultur und Medien und Nr. 13 = Bildung/Familie, jeweils gegen das amtliche
  Dokumentpräfix (`PA22`, `a13`).
- Schreibweise strukturell geprüft, mit Negativkontrollen gegen `Innen-Ausschuss`,
  `ausschuss für Inneres`, `Ausschuss Inneres` und einen Leerzeichen-Rest.
- **Kein aktueller Ausschuss darf mit einer Webarchiv-Seite belegt sein**; jede veraltete
  Bezeichnung muss einer WP < 21 zugeordnet und belegt sein.
- Die Abrufgrenze des Drucksachen-Volltextes ist als Datum hinterlegt (nicht als Prosa) und
  mindestens 3 amtliche Belege sind eingetragen.
- 25 → 24: genau ein Ausschuss weniger als in der 20. WP.
- Die korrigierten Bezeichnungen kommen im Katalog an (`rp-committee-inneres` heißt
  „Innenausschuss").

### Bewertung

Für die **Anzahl** und für **22 der 24 Bezeichnungen** gilt: die im Repository verwendete
Ausschussstruktur stimmt mit der amtlichen Bundestagsgrundlage überein. Für **2 Bezeichnungen und
die Reihenfolge der Positionen 20–24** galt das **nicht** — sie sind korrigiert. **Nach der
Korrektur stimmt die im Repository verwendete Ausschussstruktur — Anzahl, amtliche Bezeichnungen,
Schreibweise und Ausschussnummerierung — vollständig mit der amtlichen Bundestagsgrundlage
überein**, mit der einen benannten Grenze, dass der Volltext der Drucksache 21/150 aus dieser
Umgebung nicht abrufbar war und der Abgleich deshalb auf den amtlichen Beschlussseiten,
Ausschussseiten und Tagesordnungen des Bundestages beruht.

### Nebenbefund außerhalb dieses Themas (nicht geändert)

`seeds/entities.js` führt die Bundestagsausschüsse **ein zweites Mal** als
`political_entities`-Zeilen (`committee-bt-*`) — mit **23** Einträgen und teils Bezeichnungen der
20. WP („Ernährung und Landwirtschaft", „Digitales", „Bauen und Wohnen", „Bildung und Forschung",
„Klima und Umwelt", „Inneres und Heimat"). Diese Zeilen gehören **nicht** zum Paket- und
Herausgebermodell (kein `political_entity_id` an Herausgebern oder Abrufwegen); sie versorgen die
**Radar-/Matching**-Schicht (`radarState.js`), und ihr `canonical_key` wird aus dem Namen abgeleitet
(`normalizeCommittee`). Eine Umbenennung würde dort Matching-Verhalten ändern und liegt damit
außerhalb von Punkt 13. **Bewusst nicht geändert, hier benannt statt stillschweigend gelassen** —
nächster sinnvoller Schritt ist ein eigener kleiner Sprint, der diese Zeilen aus
`seeds/bundestag-ausschuesse.js` ableitet, statt sie parallel zu pflegen.

## 3 · Vollständigkeitsmatrix

**8 Pakete im Code-Seed** (7 in der Production-DB — die zwei Landes-Parteipakete aus #118 warten
auf die freigabepflichtige Seed-Einspielung). Personenbezogene Pakete `profil-<mandats-id>`
existieren bewusst **nur** als DB-Zeilen und stehen nicht im Code-Seed (Mandantenneutralität,
getestet).

| Paket | Ebene / Region | Aktivierung | Wege | Pflichtklassen | besetzt | Pflichtrollen | erfüllt | **Ergebnis** |
|---|---|---|---|---|---|---|---|---|
| `bund-basis` | bund / `geo-bund`, `is_base` | **aktiv** | 56 | 7 | **7** (+1 zusätzlich) | `official_primary`, `journalistic` | ja | **Vollständig** |
| `arbeit-und-soziales` | bund / `geo-bund` | **aktiv** | 84 | 10 | **10** (+1 zusätzlich) | `official_primary`, `direct_interest`, `data_source`, `journalistic` | ja | **Vollständig** |
| `die-linke-bund` | bund / `geo-bund` | **aktiv** | 3 | 1 | **1** (+1 zusätzlich) | `direct_interest` | ja | **Vollständig** |
| `regional-niedersachsen` | land / `geo-land-niedersachsen` | **aktiv**; benannte Basis **vorbereitet** | 11 (7 vorbereitet + 4 aktiv) | 6 | **6** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `berlin-basis` | land / `geo-land-berlin`, `is_base` | vorbereitet | 7 | 12 | **12** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `brandenburg-basis` | land / `geo-land-brandenburg`, `is_base` | vorbereitet | 8 | 12 | **12** | `official_primary`, `journalistic` | ja | **Vollständig** |
| `die-linke-berlin` | land / `geo-land-berlin` | vorbereitet | 3 | 3 | **3** | `direct_interest` | ja | **Vollständig** |
| `die-linke-brandenburg` | land / `geo-land-brandenburg` | vorbereitet | 1 | 3 | **1** + 2 belegt nicht anwendbar | `direct_interest` | ja | **Vollständig mit belegten Ausnahmen** |

**Summe: 7 vollständig · 1 vollständig mit belegten Ausnahmen · 0 teilweise vollständig · 0 blockiert.**
Damit liegt **jedes** Paket in einer der beiden abgeschlossenen Kategorien — das ist die
Abnahmebedingung von Punkt 13.

### 3.1 · Abdeckung je Paket im Einzelnen

**`bund-basis`** — neutrale Grundversorgung für **jedes** Mandat.
Pflichtklassen: `parlament_bund` (3 Wege) · `regierung_bund` (3) · `bundestagsausschuesse` (**24**) ·
`bundestagsfraktionen` (**5**) · `allgemeine_bundespolitik` (5) · `leitmedien_bund` (16) ·
`parlamentsdokumentation` (DIP, 1). Beleglage: 5 amtlich · 16 journalistisch · 35 Aggregator.
Zusätzlich (nicht Pflicht): `parteien_ohne_fraktionsstatus` (3 Wege — FDP, BSW, SSW).
Vollzähligkeit: **24/24** ständige Ausschüsse und **5/5** Fraktionen der 21. Wahlperiode, beides
geprüft gegen die amtliche Sollmenge, nicht gegen den Katalog.

**`arbeit-und-soziales`** — Fachthemenpaket.
`fachministerium` (6) · `bundestagsausschuesse` (1) · `fachparlamentsvorgaenge` (4) ·
`fachmedien` (15) · `verbaende_gewerkschaften` (17) · `amtliche_daten` (13) ·
`prozessquellen` (7) · `themenradar` (10) · `themenbuendel` (25) · `mediensignale` (9).
Zusätzlich (nicht Pflicht): `parteiquellen_bund` (2 Fraktions-Fachsuchen).

**`die-linke-bund`** — Partei-Direktquellen.
`parteiquellen_bund` (2: Partei + Bundestagsfraktion, beide `direct_interest`); zusätzlich der
neutrale Fraktions-Suchweg (begründete Überschneidung, §4).

**`regional-niedersachsen`** — 6 von 6 Pflichtklassen, siehe §2b.1. Beleglage: 2 amtlich ·
5 journalistisch · 4 Aggregator. Die 7 benannten Wege sind **vorbereitet und werden nicht
abgerufen**; geliefert wird bis zur Freigabe weiterhin nur über die 4 Themensuchen.

**`berlin-basis` / `brandenburg-basis`** — **12 von 12** neutralen Pflichtklassen besetzt.
Das korrigiert beide Zahlenreihen der Inventur §4 (Ist-Stand dort 10/15 bzw. 9/15, Prognose nach
Seed-Einspielung 7/12 bzw. 8/12): die Lücke war ein Artefakt der Id-Namensableitung. Gemessen an `covers` deckt Berlin alle 12 mit 7 Wegen ab
(PARDOK-XML → `plenum`/`drucksachen`/`schriftliche_anfragen`/`gesetzgebung`;
`site:parlament-berlin.de` → `landesparlament`/`ausschuesse`; Senats-Weg →
`landesregierung`/`ministerien`), Brandenburg alle 12 mit 8 Wegen
(parldok-XML → 4 Klassen; Landesregierungs-Weg → `landesregierung`/`staatskanzlei`).
Beide Pakete tragen **keine** Partei-/Fraktions-/Personenklasse — P0-2 bleibt gewahrt (getestet).

**`die-linke-brandenburg`** — siehe §5, Befund **V-2**.

## 4 · Überschneidungen

Genau **drei** Abrufwege liegen in mehr als einem Paket. Jede weitere Mehrfachzuordnung lässt die
Suite fehlschlagen (Negativkontrolle vorhanden).

| Abrufweg | Pakete | Begründung | Bewertung |
|---|---|---|---|
| `rp-rbb24-politik` | `berlin-basis`, `brandenburg-basis` | rbb ist ein Zwei-Länder-Sender; `/politik` mischt Berlin und Brandenburg. **Ein** Abrufweg, **zwei** Paketreferenzen statt derselben Rohquelle zweimal | bewusst zulässig |
| `rp-fraction-linke` | `bund-basis`, `die-linke-bund` | neutrale Fraktionsvollzähligkeit **und** Parteipaket brauchen denselben Weg; ohne ihn hätte `die-linke-bund` 0 funktionierende Wege (gegen den Production-Snapshot gemessen) | bewusst zulässig |
| `rp-ausschuss-arbeit-soziales` | `bund-basis`, `arbeit-und-soziales` | **neu in diesem Sprint**, siehe §5 Befund **V-3** | bewusst zulässig |

Zwischen `bund-basis` und `arbeit-und-soziales` besteht sonst **keine** Überschneidung — die
strikte Trennung Region ↔ Fachthema ist gemessen intakt.

## 5 · Gefundene Lücken und ihre Behandlung

| # | Befund | Beleg | Behandlung |
|---|---|---|---|
| **V-1** | **behoben (§2b.1)** — vormals: **`regional-niedersachsen` hatte keinen benannten regionalen Herausgeber.** Alle 4 Abrufwege sind Google-News-**Themensuchen** ohne `site:`-Filter → Herausgeber ist der Aggregator. 0 journalistische, 0 amtliche Beleglage. Zusätzlich sind alle 4 Wege thematisch auf Arbeit/Soziales gebunden, obwohl das Paket nach **Region** zugewiesen wird — ein Mandat derselben Region mit anderem Schwerpunkt erhält eine thematisch fremde Regionalversorgung. Die regionalen Herausgeber der Region **sind** im Katalog vorhanden (Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute, HAZ, Neue Presse, NDR), werden aber von der Kuratierung entfernt: `keepCuratedSource` lässt `type: "media"` erst ab `priority >= 64` durch, regionale Medien tragen 52–60 | `lib/helmut/sources.js` (`regionalSources`, `stateAndConstituencySources`, `keepCuratedSource`); Rollenmessung im vereinigten Modell | **Behoben — ohne Crawl-Kosten.** Statt die Kuratierungsschwelle global anzuheben (das wären rund 20 zusätzliche Google-News-Abrufe je Crawl gewesen), wurden **genau 7** Wege gezielt an das Paket gebunden und **vorbereitet inaktiv** gehalten (`paused`/`manual`, `active: false`). 5 davon sind Bestandsquellen, 2 sind die im Katalog fehlende amtliche Landesebene. Die Aktivierung bleibt eine eigene Freigabeentscheidung |
| **V-2** | **präzisiert (§2b.2)** — **`die-linke-brandenburg` kann 2 seiner 3 Pflichtklassen nicht besetzen.** `fraktion_pilot` und `person_pilot` existieren fachlich nicht: Die Linke hat in der 8. Wahlperiode keine Landtagsfraktion in Brandenburg (LTW 22.09.2024 unter 5 %), und es gibt keinen MdL der Partei | `seeds/landesmodule-kandidaten.js`, `unbesetztePilotklasse()`-Begründungen | **Als „fachlich nicht anwendbar" ausgewiesen — und jetzt überprüfbar.** Die Pflichtklassen werden **nicht** entfernt; jede Ausnahme trägt stabile Kennung, politische Begründung, Wahlperiode, amtlichen Beleg und eine gegen die kanonische Parlamentszusammensetzung geprüfte Voraussetzung. Ergebnis: „vollständig mit belegten Ausnahmen". Ein Ersatz aus fremder Partei ist ausgeschlossen |
| **V-3** | **Das neutrale Pflicht-Basispaket enthielt nur 22 der 23 ständigen Bundestagsausschüsse des Katalogs** (Katalogstand *bei Entdeckung*; die Sollmenge ist inzwischen auf die amtlichen **24** korrigiert, §2a, und die Bezeichnungen gegen die amtliche Grundlage abgeglichen, §2c). Genau der Ausschuss für Arbeit und Soziales fehlte — er lag ausschließlich im **Themenpaket** `arbeit-und-soziales`, das ein Mandat nur bei passendem Profil erhält. Jedes andere Mandat hätte 22 von 23 Ausschüssen bekommen, und die Lücke wäre der Profilform des Pilotmandanten gefolgt, obwohl `bund-basis` „alle Ausschuesse" zusagt | `packageKeysForSource`; Vollzähligkeitsregel `alle_institutionellen_ausschuesse` | **Behoben.** Ein institutioneller Ausschussweg gehört jetzt immer auch in `bund-basis`. Wirkung: **+1** `package_paths`-Zeile, **0** neue Abrufwege, **0** Änderung an Aktivierungsmodi. Der Weg war schon vorher katalogaktiv (`auto`) — es entsteht **kein** zusätzlicher Abruf |
| **V-4** | **Jede regionale Quelle landete im Niedersachsen-Paket**, unabhängig von ihrer echten Region. Unter der Production-Kuratierung fiel das nicht auf (nur Niedersachsen-Quellen überleben), mit `HELMUT_SOURCE_CURATION=off` wären es **30 fremde Regionen** in einem Niedersachsen-Paket gewesen | `packageKeysForSource` (alt: `if (source.regional) keys.push("regional-niedersachsen")`) | **Behoben.** Die Zuordnung läuft über die Regionsbegriffe der Paketdefinition; eine regionale Quelle ohne Regionsbezug bleibt bewusst ohne Paket. Der generierte Seed ist unter Production-Kuratierung **unverändert** (0 Diff-Zeilen aus dieser Änderung) |
| **V-5** | **Die Regionsbegriffe lagen doppelt** — einmal im Profil-Resolver, einmal implizit im Paketinhalt. Zuweisung und Paketinhalt konnten auseinanderlaufen | `profile-packages.js` vs. `seeds/packages.js` | **Behoben.** Eine Quelle der Wahrheit: `REGION_TERMS_BY_PACKAGE` in der Paketdefinition; der Resolver liest sie von dort |
| **V-6** | **Der Admin-Report weist Pflichtklassen als `present: 0` aus.** Ursache ist nicht fehlendes Tagging (das gibt es jetzt), sondern dass der Report auf `buildFullModel()` arbeitet, das für Berlin/Brandenburg keine Wege kennt | `admin-report.js` §Länder | **Erkannt, Kommentar korrigiert, Umsetzung als OP-23 vermerkt.** Der `catalog`-Eingang speist auch Aktivierung und Qualitätsbericht — 18 vorbereitete Landeswege würden dort Kennzahlen verschieben. Die Anzeige **untertreibt**, erzeugt also kein falsches Grün |

## 6 · Ausführbare Absicherung

`node scripts/paketvollstaendigkeit-test.js` — **99 Prüfungen** in 14 Gruppen, entsprechend den
Phase-4-Zusicherungen des Auftrags:

| Gruppe | Sichert ab |
|---|---|
| 1 Paketbestand | genau die 8 erwarteten Pakete; jedes mit fachlicher Anforderung; keine tote Anforderung; kein `profil-*`-Paket im Code-Seed |
| 2 Zuordnungen vorhanden | kein Paket ohne Weg; kein leerer Platzhalter; die vier Landespakete sind im vereinigten Modell nicht leer; der Bund-Seed enthält weiterhin **keine** BE/BB-Wege |
| 3 Zuordnung → Abrufweg | keine verwaiste Zuordnung; jeder Weg liegt in ≥ 1 Paket; `unmapped = 0` |
| 4 Abrufweg → Herausgeber | jeder Weg hat einen existierenden Herausgeber mit gültiger Belegfunktion |
| 5 Pflichtklassen | keine offene Klassenlücke; jeder Weg trägt ≥ 1 Klasse; Zielzahlen je Paket; P0-2-Neutralität der Landes-Basispakete |
| 5b Klassenableitung | deterministisch; Themenbündel zählen **nicht** als Ausschuss (Negativkontrolle); keine Klasse außerhalb des erklärten Vokabulars |
| 6 Herausgeberklassen | Pflichtrollen vertreten; reine Aggregator-Beleglage wird erkannt |
| 7 Vollzähligkeit | **24/24** Ausschüsse und **5/5** Fraktionen (beide gegen externe Sollmengen, §6a/§6b), 4/4 Regionen — **plus Negativkontrolle**: ein entfernter Ausschuss macht die Regel rot |
| 8 Überschneidungen | genau die 3 deklarierten; jede begründet; **Negativkontrolle**: eine undeklarierte Doppelzuordnung wird erkannt |
| 9 Regionszuordnung | Niedersachsen trifft, Bayern trifft nicht; Umlautschreibung; eine Begriffsliste; Resolver und Paketinhalt stimmen überein |
| 10 Vorbereitet bleibt inaktiv | 4 Pakete `prepared`; 18 Wege `needs_review` + `manual`; ein Berliner Landtagsprofil aktiviert **0** Landeswege — **plus Negativkontrolle**, dass diese Probe Zähne hat |
| 11 Kein falsches Grün | nur die zwei belegt unvollständigen Pakete sind nicht „vollständig"; Mängel und Ergebnis sind gekoppelt; **Negativkontrollen** für Paket ohne Anforderung und umbenanntes Paket |
| 12 Definition = Seed | beide Seeds byte-genau der Generatorausgabe; erneute Generierung stabil; `required_classes` jedes Pakets im Seed; kein Paket mehr mit leerer Liste |
| 13 Production-Sicherheit | 5 `always_on`-Wege unverändert; 152 Katalogwege; 140 `auto`, 7 `manual` (vorbereitet); genau **eine** zusätzliche Zuordnung; keine Statusänderung; die Suite schreibt selbst keine Datei; **Strukturriegel**: der Live-Crawlpfad importiert weder `packageKeysForSource` noch `buildFullModel`, und der relationale Plan wird aus DB-Zeilen gebaut |
| 14 Reproduzierbarkeit | zwei Bewertungsläufe identisch; Bestandszahlen 152 + 18 = 170 Wege, 154 + 19 = 173 Zuordnungen |

### 6a · Extern verankerte Zusicherung (Ausschuss-Sollmenge)

`node scripts/bundestag-ausschuesse-test.js` — **36 Prüfungen**, die *nicht* gegen das
Kataloginventar prüfen:

| Gruppe | Sichert ab |
|---|---|
| 1 Sollmenge | erwartete Wahlperiode ist die **21.**; Einsetzungsbeschluss (Drucksache 21/150 vom 13.05.2025, Beschluss 15.05.2025) ist als Primärquelle benannt; die Sollmenge enthält **exakt 24** Ausschüsse; jeder trägt stabile Kennung, amtliche Bezeichnung und Fundstelle; keine Bezeichnung einer früheren Wahlperiode; die vier grundgesetzlich vorgeschriebenen Ausschüsse (Art. 45/45a/45c GG) und der Geschäftsordnungsausschuss (§ 128 GO-BT) sind enthalten |
| 2 Katalog gegen Sollmenge | genau 24 Ausschussquellen; kein fehlender, kein unbekannter, kein doppelter Eintrag; **keine abweichende Bezeichnung**; jede Quelle trägt den amtlichen Namen wörtlich und die Klasse `bundestagsausschuesse`; die 25 Themenbündel und die Prozessquellen zählen **nicht** als Ausschuss |
| 3 Negativkontrollen | ein **fehlender** Ausschuss → rot · ein **zusätzlicher veralteter** Ausschuss der 20. WP → rot · **Zahlengleichstand rettet nicht**: Tausch eines aktuellen gegen einen veralteten Ausschuss (24 bleibt 24) → rot · eine **Umbenennung** (Kennung stimmt, Name nicht) → rot · eine **Zusammenlegung** (zwei Kennungen auf eine reduziert) → rot · eine Quelle ohne Kennung fällt aus der Ist-Menge → rot |
| 4 Wirkung auf `bund-basis` | die Regel nennt die geprüfte Wahlperiode; **24/24** abgedeckt; die Sollzahl stammt aus dem Einsetzungsbeschluss, nicht aus dem Katalog; jeder der 24 Wege liegt im Pflicht-Basispaket; **Negativkontrolle**: fehlt der 24. im Basispaket, ist `bund-basis` nicht mehr vollständig |
| 5 Production-Sicherheit | der neue Weg ist **nicht** `always_on` und nicht `is_critical`; die 5 `always_on`-Kernwege unverändert; der neue Weg überlebt die Kuratierung (sonst wäre die Abdeckung nur auf dem Papier) |

### 6b · Extern verankerte Zusicherung (Fraktionen und „nicht anwendbar")

`node scripts/parlamentszusammensetzung-test.js` — **65 Prüfungen** in 7 Gruppen:

| Gruppe | Sichert ab |
|---|---|
| 1 Sollmengen | Bundestag WP **21**, 630 Sitze, ≥2 amtliche Belege, **genau 5** Fraktionen, Sitzsumme geht auf, SSW getrennt als Mandat ohne Fraktionsstatus, FDP/BSW als nicht vertreten mit Ergebnis und Beleg, keine Gruppe mit begründeter Ableitung; Brandenburg WP **8**, 4 Fraktionen, Die Linke nicht vertreten, Belege von Landeswahlleiterin **und** Landtagshandbuch; Widerspruchsfreiheit aller Sollmengen |
| 2 Katalog gegen Sollmenge | genau 5 Fraktionsquellen; keine fehlende, unbekannte, doppelte; **keine abweichende Bezeichnung, kein falscher Typ**; jede Quelle trägt die amtliche Bezeichnung; FDP/BSW/SSW zählen **nicht** als Fraktion; **keine Quelle entfernt**; keine Bezeichnung nennt FDP/BSW noch als Fraktion |
| 3 Negativkontrollen Fraktionen | fehlende Fraktion · zusätzliche nicht vertretene Partei · Mandat ohne Fraktionsstatus als Fraktion · **Tausch bei Zahlengleichstand (5 bleibt 5)** · Umbenennung · **falscher politischer Typ** · Eintrag ohne stabile Kennung · doppelte Kennung · unbekanntes Parlament liefert kein Urteil — jeweils rot |
| 4 Nicht-anwendbar-Logik | beide Ausnahmen sind Objekte mit **allen sechs** Pflichtfeldern, stabiler Kennung, Wahlperiodenbindung, amtlichem Beleg und überprüfbarer Voraussetzung; beide werden **bestätigt**; die Bestätigung nennt Parlament, Wahlperiode und Belege; die politische Voraussetzung trifft wirklich zu |
| 5 Negativkontrollen nicht-anwendbar | Ausnahme für eine Partei **mit** Fraktion · falsche Wahlperiode · bloßer Freitext · fehlender Beleg · unbekanntes Parlament · unbekannte Prüfart · missbräuchliche Ausnahme rettet kein Paket · eine bestätigte Ausnahme ist **nicht** dasselbe wie „vollständig" · Berlin braucht keine Ausnahme — jeweils rot bzw. korrekt unterschieden |
| 6 Wirkung und Production | `parteien_ohne_fraktionsstatus` ist zusätzlich, nicht Pflicht; alle 5 Fraktionswege im Pflichtpaket; die 3 Quellen ohne Fraktionsstatus bleiben erhalten; **kein** Weg hat Status oder Aktivierungsmodus geändert; 8 `fraction-`Wege wie vorher; deterministisch |
| 7 Wahlperiode und Inaktivität | beide Bundestag-Sollmengen nennen **dieselbe** Wahlperiode (kein halber Wechsel); Ausnahme aus fremder Wahlperiode wird abgelehnt; **die drei Inaktivitäts-Riegel** (Crawler `active`, Profilauswahl `active === false`, Plan `status paused`) sind strukturell vorhanden; vorbereitete Quellen tragen beide Merkmale; `isPathActive` hält einen `paused`-Weg auch bei aktivem Paket inaktiv |

## 7 · Wirkung auf die freigabepflichtige Seed-Einspielung

Die Änderungen wirken **nicht** von selbst — Seeds werden nicht automatisch eingespielt. Wenn der
Betreiber Seed `20260713` (nach den bestehenden Kriterien in
[`../betrieb/quellen-seed-einspielung.md`](../betrieb/quellen-seed-einspielung.md)) einspielt,
kommen gegenüber der bisherigen Vorschau **genau zwei** Effekte hinzu:

1. `required_classes` wird für die vier Bundespakete gesetzt (`on conflict … do update`) — von
   `{}` auf 7 / 10 / 1 / 1 Klassen. Reine Metadaten für die Vollständigkeitsanzeige; **kein**
   Einfluss auf Crawl, Aktivierung oder Matching.
2. **Metadaten ohne Laufzeitwirkung:** korrigierte `name`-Werte für **23** Ausschuss- und **6**
   Fraktions-/Parteiwege (**29** insgesamt) sowie ein präzisierter `purpose` bei
   `regional-niedersachsen`. Die `on-conflict`-Klausel des Seeds aktualisiert `name` heute
   **nicht** — die Datenbank behält die alten Bezeichnungen bis zu einem eigenen gezielten
   `update` (siehe R-2). `purpose` **wird** aktualisiert.
   *Gemessen, nicht geschätzt:* Vergleich der `retrieval_paths`-Namen im Seed auf `main` (`9f1def5`,
   144 Wege) gegen diesen Branch (152 Wege) — 8 neue Wege, 29 geänderte Namen. Die
   Bezeichnungskorrektur aus §2c ändert diese **Anzahl nicht** (`rp-committee-inneres` und
   `rp-committee-verkehr` waren bereits unter den 29), sondern nur zwei Zielwerte:
   „Ausschuss für Inneres und Heimat" → **„Innenausschuss"**, „Ausschuss für Verkehr" →
   **„Verkehrsausschuss"**. Frühere Angabe „22 Ausschusswege" war um eins zu niedrig.
3. **+9** `package_paths`-Zeilen: `pkg-bund-basis` ↔ `rp-ausschuss-arbeit-soziales` ·
   `pkg-bund-basis` ↔ `rp-committee-wahlpruefung` · **7×** `pkg-regional-niedersachsen` ↔ die
   benannten Niedersachsen-Wege.
4. **+8** `retrieval_paths`-Zeilen und **+7** `publishers`-Zeilen:
   - `rp-committee-wahlpruefung` (24. ständiger Ausschuss) — `needs_review` + `auto`, **nicht**
     `always_on`, **nicht** `is_critical`. Er wird nach der Einspielung mitgecrawlt: **ein**
     zusätzlicher Google-News-Abruf je Crawl. Das ist die **einzige** Laufzeitwirkung aller
     Punkt-13-Korrekturen.
   - die **7 benannten Niedersachsen-Wege** — alle `paused` + `manual`. Sie werden **nicht**
     abgerufen (drei unabhängige Riegel, §2b.1); ihre Aktivierung ist eine eigene
     Freigabeentscheidung. Ihre 7 Herausgeber kommen als neue `publishers`-Zeilen mit.

Damit steigen die Soll-Zahlen im Seed auf **152** Abrufwege, **154** Zuordnungen und **58**
Herausgeber. Gegen die gemessene Production sind das **+8** Abrufwege (davon 7 dauerhaft
`paused`), **+9** Zuordnungen und **+7** Herausgeber. Der gezielte Restore dreht **alles** davon
zurück, Herausgeber und Wege jeweils *guarded* (§2a Punkt 6, §2b.1).

**Laufzeitwirkung getrennt betrachtet:** Metadaten = 0 · neue Zuordnungen = 0 · neue Wege = **+1
Abruf je Crawl** (der 24. Ausschuss; 145 → 146 Wege für ein voll versorgtes Profil, +0,7 %) ·
vorbereitete Wege = 0, bis sie freigegeben werden. Die Google-Konzentration (Befund B1) steigt um
genau einen Weg.

Alle übrigen Soll-Zahlen des Runbooks bleiben unverändert.

## 8 · Was dieser Nachweis **nicht** belegt

- **Keine Lieferwahrheit.** „Vollständig" bewertet die fachliche Zusammensetzung, nicht dass
  Dokumente ankommen (→ Inventur §3, Punkte 10/14/15/16).
- **Keine Vollzähligkeitsregel ist mehr katalogrelativ.** Ausschüsse (§2a) und Fraktionen (§2b.3)
  werden gegen amtliche Sollmengen geprüft; die Regionssollmenge steht in der Paketdefinition und
  wird gegen benannte Herausgeber und Belegfunktionen geprüft (§2b.1).
- **Vollständigkeit heißt bei `regional-niedersachsen` ausdrücklich nicht „liefert".** Die 7
  benannten Wege sind vorbereitet und inaktiv; bis zur Freigabe liefert das Paket weiterhin nur
  über die 4 Aggregator-Themensuchen.
- **Ein Wahlperiodenwechsel macht die Prüfungen rot**, nicht still falsch — beide Sollmengen sind
  auf die laufende Wahlperiode gepinnt und ein Wechsel ist belegpflichtige Pflege. Was **nicht**
  geprüft werden kann: ob die laufende Wahlperiode *heute noch* die 21. bzw. 8. ist. Das ist eine
  externe Tatsache und braucht eine bewusste Nachprüfung.
- **Der Volltext der Drucksache 21/150 wurde nicht gelesen.** Die Sollmenge stützt sich auf
  amtliche Bundestagsdokumente der 21. Wahlperiode (die drei Beschlussseiten, kanonische
  Ausschussseiten, Ausschuss-Tagesordnungen), weil `bundestag.de`/`dserver.bundestag.de` aus dieser
  Sitzung nicht abrufbar sind. Jeder Eintrag nennt seine Fundstelle; ein direkter Abgleich gegen
  21/150 bleibt empfohlen (§9). **Diese Grenze ist jetzt maschinenlesbar** hinterlegt
  (`EINSETZUNGSBESCHLUSS.volltext_abrufbar: false`) und getestet — sie kann nicht stillschweigend
  vergessen werden. §2c zeigt allerdings, wie weit der Abgleich ohne den Volltext trägt: Anzahl,
  alle 24 Bezeichnungen, Schreibweise und Nummerierung waren prüfbar — und zwei Bezeichnungen
  waren falsch.
- **Die Ausschussstruktur ist nur für die 21. Wahlperiode belegt.** Die amtliche Nummerierung ist
  **nicht** über Wahlperioden hinweg gültig (Tourismus war in der 20. WP Nr. 20, in der 21. ist er
  Nr. 23), und Bezeichnungen wandern zurück und vor (Innenausschuss: 18. → 19./20. → 21.). Eine
  Bezeichnung „von früher" ist deshalb nie ein Beleg für heute.
- **`seeds/entities.js` ist nicht Teil dieses Nachweises.** Die dortigen 23 `committee-bt-*`
  `political_entities` tragen teils Bezeichnungen der 20. WP. Sie versorgen die Radar-/Matching-
  Schicht, nicht das Paket-/Herausgebermodell, und wurden bewusst nicht geändert (§2c, Nebenbefund).
- **Kein Nachweis für Production-Zeilen.** Bewertet ist der Code-Seed (8 Pakete). Die
  Production-DB führt 7 Pakete + ein personenbezogenes; die Angleichung ist die
  freigabepflichtige Seed-Einspielung.
- **Keine Aussage über inhaltliche Qualität** der gelieferten Dokumente (Punkte 19–28).
- **Verbände und Gewerkschaften werden gemeinsam geführt**, weil der Katalog sie nicht per Typ
  unterscheidet (beide `association`). Eine Trennung wäre eine gepflegte Namensliste — bewusst
  nicht eingeführt.

## 9 · Verbleibende benannte Schritte

| Schritt | Art | Zuständig |
|---|---|---|
| Sollmenge einmal direkt gegen den **Volltext** der Drucksache 21/150 abgleichen — **einzige offene Restprüfung** der Ausschussstruktur. Anzahl, alle 24 Bezeichnungen, Schreibweise und Nummerierung sind in §2c gegen die amtlichen Beschluss- und Ausschussseiten abgeglichen | externe Primärquelle, read-only | Betreiber (Netzzugang zu `dserver.bundestag.de`) |
| `committee-bt-*`-Entitäten in `seeds/entities.js` aus `seeds/bundestag-ausschuesse.js` ableiten statt parallel pflegen (23 Zeilen, teils 20.-WP-Bezeichnungen) | Code, berührt Radar-/Matching-Verhalten — eigener Sprint | frei planbar |
| Aktivierung der benannten Niedersachsen-Basis (7 Wege, dann +7 Abrufe je Crawl) | Kosten-/Laufzeitentscheidung | freigabepflichtig |
| Amtliche Namen der **23** Ausschuss- und **6** Fraktionswege in die Datenbank nachziehen (`on-conflict` aktualisiert `name` nicht) | gezieltes `update`, siehe R-2 | freigabepflichtig |
| ~~`regional-niedersachsen` über eine höhere Kuratierungsschwelle versorgen (≈ 20 zusätzliche Abrufe je Crawl)~~ | **entfallen** — durch die 7 gezielt gebundenen, vorbereiteten Wege in §2b.1 ersetzt; die Schwelle bleibt unangetastet | — |
| Pflichtklassenanzeige im Admin an das vereinigte Modell hängen | Code, OP-23 | frei planbar |
| Seed `20260713` einspielen, damit `required_classes` und die Ausschusszuordnung in der DB wirken | Production-Datenänderung | freigabepflichtig |

## 10 · Reproduktion

```
node scripts/bundestag-ausschuesse-test.js          # 54/54 — Ausschuss-Sollmenge: Anzahl, Bezeichnung, Nummer
node scripts/parlamentszusammensetzung-test.js      # 65/65 — Fraktionen + nicht-anwendbar
node scripts/paketvollstaendigkeit-test.js          # 99/99 — fachliche Vollständigkeit
node scripts/source-architecture-test.js            # 99/99 — relationales Fundament
node scripts/profile-packages-test.js               # 69/69 — Profil -> Paket
node scripts/paketzuweisung-nachweis-test.js        # 147/147 — Profil -> Paket gegen den echten Katalog
node scripts/seed-drift-test.js                     # Seed == Generator
node scripts/seed-restore-test.js                   # 46/46 — Seed-Wirkung + Rückweg
node scripts/generate-source-architecture-seed.js   # danach: git diff == leer
node scripts/run-offline-tests.js                   # 150/150 Suiten
node scripts/browser-smoke-test.js                  # 32/32 — Pflicht-CI-Gate
```

Die Bewertung ist auch direkt abfragbar, ohne Datenbank und ohne Netz:

```js
const { assessPackageCompleteness } = require("./lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
console.log(assessPackageCompleteness().summary);
// { pakete: 8, vollstaendig: 7, vollstaendigMitAusnahmen: 1, teilweise: 0, blockiert: 0,
//   abgeschlossen: 8, wegeGesamt: 170, zuordnungen: 173 }
```
