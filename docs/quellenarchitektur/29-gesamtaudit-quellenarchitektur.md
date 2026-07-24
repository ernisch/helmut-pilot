# 29 — GESAMT-AUDIT DER HELMUT-QUELLENARCHITEKTUR (Finales Architektur-Gate)

> **Auftrag:** Adversarialer Gesamt-Audit der kompletten Quellenarchitektur als finales Gate,
> bevor die ersten (weiteren) Quellenpakete aktiviert werden. Nicht bestätigend, sondern
> angreifend geführt.
> **Datum:** 2026-07-24 · **Branch:** `claude/helmut-architecture-audit-1erxkr`
> **Prüfbasis:** relationaler Seed (`supabase/seeds/20260713_source_architecture_seed.sql`,
> `20260717_landesmodul_be_bb_seed.sql`), Modell/Katalog/Seeds unter
> `lib/helmut/quellenarchitektur/`, Schema-Migration `20260713_source_architecture.sql`,
> Generatoren, sowie die Diagnosen 00/02/03/13/17/28 und `audit/`.
> **Methoden-Ehrlichkeit (wichtig):** Der Audit-Sandkasten hat **keinen** offenen Egress zu
> deutschen Behörden-/Medien-Domains — sowohl `curl` als auch `WebFetch` erhalten für
> `bundestag.de`, `tagesschau.de` usw. ein Policy-`403 (CONNECT tunnel failed)`. Live-HTTP-
> Statusprüfung war daher **nicht** direkt möglich. Der Link-Audit stützt sich deshalb auf drei
> voneinander unabhängige Quellen: (a) den **verifizierten Runner-Test aus Sprint 9B**
> (GitHub-Actions-Runner mit offenem Egress, 2026-07-14, 24/24 real geprüft, byte-genaue
> Belege), (b) **WebSearch-Korroboration** (Stand 2026-07), (c) die im Repo hinterlegten
> Health-Snapshots (`catalog.KNOWN_PATH_HEALTH`, `quellen-audit.csv`). Wo diese sich decken,
> ist die Aussage belastbar; wo nur eine Quelle vorliegt, ist es markiert.

---

## 1. EXECUTIVE SUMMARY

Die Helmut-Quellenarchitektur ist **strukturell stark, operativ aber unfertig**. Das
relationale Fundament — die saubere Trennung **Herausgeber ↔ Abrufweg ↔ Paket** plus zentrale
**Entitäts-** und **Geografie-**Schicht — ist konzeptionell auf Principal-Niveau: 3NF, klare
Fremdschlüssel mit durchdachten Cascade-Regeln, m:n-Paketzuordnung mit globaler
Ein-Mal-Crawl-Referenzzählung, korrekte Behandlung von Google News als **Aggregator** statt als
verkleidetem Herausgeber. Das ist das Rückgrat, auf dem 100/500/1000 Mandate konzeptionell
tragen.

Der Angriff auf diese Architektur fördert jedoch **eine Reihe substanzieller Befunde** zutage,
die zwei Klassen bilden:

1. **Integritäts-/Neutralitätsdefekte am „Source of Truth".** Der committete Seed **reproduziert
   nicht aus dem Code** (empirisch verifiziert): das Partei-Paket des realen Piloten
   (`die-linke-bund`) wird mit **null funktionierenden Abrufwegen** ausgeliefert; nur ein
   manueller Production-Hotfix rettet ihn. Und das **neutrale, verpflichtende** Landes-Basispaket
   (`berlin-basis`/`brandenburg-basis`, `is_base=true`) enthält **pilot-spezifische Partei-,
   Fraktions- und Personenquellen** (Die Linke + der namentliche Einzelpolitiker Tobias Schulze)
   — ein direkter Bruch mit der auf Bundesebene sauber durchgezogenen Mandantenneutralität.

2. **Betriebs-/Qualitätslücken.** 93 % aller Abrufwege laufen über **einen** Google-News-
   `batchexecute`-Auflöser (Single Point of Failure); 134 von 144 Wegen stehen **dauerhaft** auf
   `needs_review`, weil die Telemetrie den Pfad-Status nie zurückschreibt (die 6-stufige
   Status-Maschine ist in Production toter Code); die verifizierten Reparaturen der 6 defekten
   amtlichen Primärquellen sind **nicht eingespielt**; und die Qualitäts-Grundwahrheit
   (`path_expected_levels`, `political_level`) ist für die aktive Architektur **unbefüllt (0/231)**.

**Kein Befund gefährdet den laufenden Bund-Bestand** (bund-basis/arbeit-und-soziales versorgen
den Piloten nachweislich mit 100 % Ertragsabdeckung). Aber **mehrere Befunde sind harte Blocker
für die nächste Aktivierungsstufe** (Berlin/Brandenburg, weitere Pakete, Zweitmandanten anderer
Parteien).

### Gesamtbewertung / Reifegrad / Ampel

| Dimension | Bewertung |
|---|---|
| **Architektur-Reifegrad** | **Strukturell: produktionsreif. Operativ/Datenpflege: Beta.** |
| **Ampel** | 🟡 **GELB** |
| **Freigabe** | **Bedingt.** Bund-Bestand bleibt aktiv. **Keine Freigabe** für BE/BB-Aktivierung, für neue Paket-Aktivierungen oder für Zweitmandanten anderer Parteien, bis **P0-1, P0-2 und P1-3 behoben** sind. |

---

## 2. ARCHITEKTUR-SCORE (0–10)

| Dimension | Score | Begründung (Kurz) |
|---|:---:|---|
| **Datenmodell** | **8** | Sauber normalisiert; klare Trennung Herausgeber/Weg/Paket/Entity/Geo; gute FKs & Indizes; Unique-Domain-Constraint. Abzug: `path_expected_*` leer, `represents_type`-Redundanz, weiche (FK-lose) Findings-Verweise. |
| **Wiederverwendung** | **8** | m:n-`package_paths`, globaler Ein-Mal-Crawl-Refcount, geteilte Publisher/Entities, DIP & Google News korrekt getrennt. Abzug: DIP doppelt definiert, zwei divergierende Paket-Ableitungslogiken. |
| **Skalierung** | **6** | Refcount-Modell trägt 100/500/1000 Mandate konzeptionell. Real begrenzt durch Google-News-SPOF + Klumpenrisiko, nicht aktivierbare Landesmodule, überladenes A&S-Paket. |
| **Wartbarkeit** | **4** | **Committeter Seed driftet vom Code (nicht reproduzierbar)**; Handedits im „nicht editieren"-Artefakt; hartkodierte Wahlperioden-URLs; toter Status-Automat; zwei DIP-Definitionen. |
| **Paketstruktur** | **6** | Bund sauber getrennt (Basis/Fach/Partei/Region). Abzug: Land-Basis vermischt Pilot/Partei/Person, A&S überladen (~85 Wege), Landtagsprofile nie voll aktivierbar. |
| **Retrieval-Qualität** | **5** | 93 % Google News; 6 defekte Primärquellen (Reparatur nicht eingespielt); keine amtlichen Ausschuss-/Ministeriums-Direktwege; Status eingefroren. Anker: DIP + 3 gesunde Direktfeeds. |
| **Politische Relevanz** | **7** | Kernabdeckung für den Piloten (A&S, alle 22 Ausschüsse, 8 Fraktionen, Leitmedien, DIP) stark. Abzug: fehlende Primärquellen, Themen-Enge außerhalb Sozialpolitik. |
| **Zukunftssicherheit** | **6** | Additives Modell, Rollback-Skripte, prepared Landesmodule. Abzug: Wahlperioden-Bindung der PARDOK-URLs, SPOF, unbefüllte Qualitätsschicht, Seed-Drift. |
| **GESAMT (Ø)** | **6,3** | Solides Fundament, mehrere behebbare Integritäts-/Betriebslücken vor der nächsten Aktivierung. |

---

## 3. KRITISCHE PROBLEME (P0) — Freigabe-Blocker

### P0-1 — Der committete Seed reproduziert NICHT aus dem Code; `die-linke-bund` wird mit 0 funktionierenden Wegen ausgeliefert
**Beleg (empirisch):** `node scripts/generate-source-architecture-seed.js` erzeugt gegen
`supabase/seeds/20260713_source_architecture_seed.sql` einen Diff mit drei Abweichungen — am
gravierendsten fehlt die vom Code (`seeds/packages.js:87-91`, `fraction-linke`-Sonderregel)
erzeugte Zuordnung **`('pkg-die-linke-bund', 'rp-fraction-linke')`** im committeten Seed
(144 statt 145 `package_paths`). Der committete `die-linke-bund` (Seed-Z. 362-363) enthält nur
`rp-die-linke` + `rp-linksfraktion` — **beide in `catalog.KNOWN_PATH_HEALTH` als `broken`
markiert**. Der Codefix existiert, wurde aber nie in den Seed regeneriert; nur ein **manueller
Production-Hotfix** (`INSERT INTO package_paths …`, Master-Status §5) hält den Piloten am Leben.
**Wirkung:** Jede aus dem committeten Seed neu aufgebaute Umgebung liefert dem realen Pilot-
Partei-Paket null nutzbare Quellen. Der „Source of Truth" ist nicht der Code, sondern ein
handgepflegter, driftender Artefakt-Stand.
**Fix:** Seed aus dem Code regenerieren, Handedits (Neutralisierungs-Kommentar) in den Generator
ziehen, CI-Gate „Seed == generate()" ergänzen. Danach den manuellen Prod-Hotfix mit dem Seed
abgleichen.

### P0-2 — Pilot-/Partei-/Personenquellen im neutralen, verpflichtenden `is_base`-Landespaket
**Beleg:** `berlin-basis` und `brandenburg-basis` sind `is_base: true` (`seeds/packages.js:58,64`)
— **jedes** Landtagsprofil erhält sie zwingend. Ihre Pflichtklassen enthalten aber
`partei_pilot`, `fraktion_pilot`, `person_pilot` (`packages.js:20-25`), und der Landesmodul-Seed
mappt konkret **Die Linke Berlin** (`dielinke.berlin`), die **Linksfraktion Berlin** und die
namentliche Person **Tobias Schulze** direkt in `berlin-basis` (`landesmodul_be_bb_seed.sql:44-46,
67-69`). Brandenburg packt „Die Linke Brandenburg" ins Basispaket (`bb-partei_pilot`), obwohl die
Partei nicht im Landtag ist.
**Wirkung:** Ein z. B. CDU-Berlin-Mandat zöge bei Aktivierung **zwingend** Die-Linke- und
Tobias-Schulze-Quellen in seinem Pflicht-Basispaket. Das bricht die Neutralität, die auf
Bundesebene sauber ist (Partei → separates `die-linke-bund`, Person → dynamisches
`profil-<id>`, Basis nur `neutral`).
**Fix:** `partei_pilot`/`fraktion_pilot`/`person_pilot` aus dem `is_base`-Landespaket
herauslösen — analog Bund in ein separates Partei-Paket (`die-linke-berlin`) und in das
dynamische Personenpaket. Landes-Basis auf neutrale Landesinstitutionen (Parlament, Regierung,
Ausschüsse, Regionalmedien, ÖR) beschränken.

> **Einordnung:** Beide P0 betreffen die **Integrität/Neutralität des Source-of-Truth** und sind
> Blocker vor jeder weiteren Aktivierung — nicht den laufenden Bund-Betrieb.

---

## 4. WICHTIGE PROBLEME (P1)

### P1-3 — Qualitäts-Grundwahrheit unbefüllt (0/231): `path_expected_levels` / `political_level`
Der **aktive** Bund-Seed befüllt **keine** `path_expected_*`-Tabelle (nur der inaktive BE/BB-Seed
setzt `path_expected_levels`/`geographies`). `political_level` ist in den Wissensobjekten 0/231
gesetzt (Diag 00). Damit hat die Ebenen-/Geo-Erkennung und die Qualitätsprüfung **keine
Grundwahrheit** für aktive Wege. Diag 00 nennt das explizit als einen der „zwei harten
Landesblocker … VOR dem Landesausbau zu lösen".

### P1-4 — Pfad-Status-Maschine ist in Production toter Code
134/144 Wege stehen dauerhaft auf `needs_review`, 4 `healthy`, 6 `broken`. `nextPathStatus`/
`mayAutoPause` (`model.js`) werden **nur in Tests** aufgerufen; `retrieval_paths.status`/
`error_streak`/`last_success_at` werden vom Live-Crawl **nicht zurückgeschrieben**
(`quality-watchdog.js:502`: `pathTelemetry:false`, `last_success_at` in Prod leer). Folge: keine
automatische Degradation/Broken-Erkennung; die 6 `broken`-Wege — darunter `rp-bundestag` und
`rp-bundesregierung`, die zugleich **`is_critical` + `always_on`** sind — bleiben formal „aktiv".
Ein `always_on`+`is_critical`+`broken`-Weg ist ein latenter Selbstwiderspruch.

### P1-5 — Verifizierte Bundesweg-Reparaturen nicht eingespielt; 2 Primärquellen nur durch Proxy ersetzt
`seeds/bundeswege-reparaturen.js` hält für alle 6 defekten Wege **real verifizierte** Reparaturen
(Sprint 9B, HTTP 200), aber `angewendet: 0` — der aktive Katalog/Seed trägt weiter die defekten
URLs. Zwei davon sind **nicht gleichwertig** ersetzbar (Diag 28): `rp-bundestag`
(`…/static/appdata/includes/rss/pressemitteilungen.rss`, official_primary) und `rp-linksfraktion`
(`dielinkebt.de/presse/pressemitteilungen/feed.rss`, eigene Primärstimme des Piloten) haben echte
Direktfeeds, während die anderen 4 nur zu Google-News-Suchen repariert werden.
**Zusatzfund:** Für **DGB** existiert ein echter RSS-Feed (`dgb.de/service/rss` bzw.
`dgb.de/einblick/rss`, WebSearch-korroboriert) — besser als der vorgeschlagene Google-News-Ersatz.

### P1-6 — `rbb24-politik` koppelt Berlin und Brandenburg → kein modularer Rollback
Es gibt **genau einen** Weg `rp-rbb24-politik` mit **zwei** Paketreferenzen (berlin-basis +
brandenburg-basis; Seed-Z. 66, 77). Der Rollback löscht per ID — Berlin lässt sich nicht
zurückrollen, ohne die Klasse `oer_landesberichterstattung` von Brandenburg mitzureißen. Das
harte BE/BB-Gate (`source-mode.js`) greift für diesen Weg zudem **nur** über die
Paketschlüssel-Prüfung, weil weder ID noch Legacy-ID ein `be-`/`bb-`-Präfix tragen.

### P1-7 — Google-News-SPOF (93 % aller Wege)
134 von 144 aktiven Wegen sind `googlenews_search` über **einen** `batchexecute`-Auflöser; nur
7 `rss`, 2 `html`, 1 `api`. Master-Status B1 dokumentiert reales Google-News-Rate-Limiting
(transient, erholt) mit „latentem Klumpenrisiko". Ein Ausfall/Sperrwechsel dieses einen Pfades
legt die Beschaffung fast vollständig lahm.

---

## 5. MITTLERE PROBLEME (P2)

- **P2-8 — Redundanz im `arbeit-und-soziales`-Paket (~85 Wege).** Die Gruppen `radar-*`,
  `signal-*`, `process-*` und `bundle-ausschuss-*` re-abfragen dieselben Themen
  (Bürgergeld/Rente/Pflege/Mindestlohn/Tarif) mehrfach in leicht variierten Google-News-Queries.
  Für „Bürgergeld" existieren u. a. `rp-radar-buergergeld`, `rp-bundle-ausschuss-buergergeld`,
  `rp-signal-medienkritik-buergergeld` parallel → doppelte Crawls, Dedup-Last (~6 % Titel-
  Duplikate gemessen), Rauschen, verstärktes Google-Klumpenrisiko. **Empfehlung:** konsolidieren.
- **P2-9 — Fehlende amtliche Primärquellen.** (a) 5 der 6 Ministerien ohne Direktweg
  (nur `rp-bmas` hat eigenen RSS); (b) keine amtliche **Ausschuss-Primärquelle** (alle 22
  Ausschüsse nur als flache Google-News-Query; der einzige Direktweg ist die defekte HTML-Seite);
  (c) **Bundesgesetzblatt / recht.bund.de** (Gesetzesverkündung) fehlt vollständig; (d) Bundesrat
  nur über Google-News-`site:`-Suche, kein TOP/Plenar-Strukturweg.
- **P2-10 — Person als geteilte Entity + Herausgeber.** `person-tobias-schulze`
  (`entity_type:"person"`) lebt in der zentralen Entitätsschicht **und** als Publisher — trotz des
  Neutralisierungs-Commits. Der Pilot-Mensch ist fest in Seed- + Entity-Layer verdrahtet.
- **P2-11 — Landtagsprofile strukturell nie voll aktivierbar.** `berlin-/brandenburg-basis` sind
  `prepared`; `computeGlobalActivation` liefert höchstens `requested_unsupplied`. Zusätzlich wirft
  `source-mode.js` jeden BE/BB-Weg hart aus dem Plan. Nur **Bundestagsprofile** sind heute voll
  aktivierbar; alle 14 anderen Länder haben gar kein Modul (`requiredMissing`).
- **P2-12 — Orphan-Publisher + unerfüllte Pflichtklassen (Brandenburg).**
  `publisher-stk.brandenburg.de` (Staatskanzlei) ist definiert, aber von **null** Abrufwegen
  referenziert. Brandenburg-Pflichtklassen `staatskanzlei`, `fraktion_pilot`, `person_pilot`,
  `drucksachen`, `schriftliche_anfragen`, `gesetzgebung` sind ohne Weg; Berlin fehlen
  `ausschuesse`, `ministerien`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung`.
  Asymmetrische Granularität zwischen den beiden „Basis"-Modulen.
- **P2-13 — Doppelmodellierung Ziel-Typ.** `retrieval_paths.represents_type` (Freitext) und die
  eigene Tabelle `path_expected_entities` (FK, aber **leer**) modellieren denselben Sachverhalt;
  eine Mechanik ist tot.
- **P2-14 — Geo-Semantik.** Brandenburgs kreisfreie Städte (Potsdam/Cottbus/…) sind als
  `level=kommune` (`geo-kommune-bb-*`) modelliert, obwohl kreisfrei hierarchisch **Kreisebene** ist.

---

## 6. KLEINE VERBESSERUNGEN (P3)

- **P3-15** — DIP doppelt definiert (`catalog.js:47-56` `DIP_PATH` **und** inline `dipPath:233-238`)
  — latente Driftquelle.
- **P3-16** — Naming/Präfix-Inkonsistenz: `geo-bezirk-berlin-*` (Land ausgeschrieben) vs.
  `geo-kreis-bb-*` (abgekürzt); zwei divergierende `slug()`-Funktionen (transliterierend vs. nicht).
- **P3-17** — Trust-Inkonsistenzen: `dielinkebt.de` (`unbekannt`) vs. `die-linke.de` (`mittel`);
  `tagesspiegel.de` `hoch` (Bund-Seed) vs. `unbekannt` (BE/BB-Seed, re-deklariert per `do nothing`).
- **P3-18** — Refcount-Identitätskollision: fehlt `id/user_id/politicianId`, dient
  `JSON.stringify(p).slice(0,40)` als Schlüssel — Randfall-Kollision zweier Profile.
- **P3-19** — Zwei Paket-Ableitungslogiken: `packageKeysForSource` (Quelle→Paket, strikte
  Region/Thema-Trennung per früher `return`) vs. `resolveProfilePackages` (Profil→Paket, ohne diese
  Trennung; `includes()`-Übermatch-Risiko bei Region).
- **P3-20** — SSW als `parliamentary_group` modelliert (real 1 MdB, keine Gruppe);
  `expected_frequency`-Spalte nie befüllt.
- **P3-21** — Wahlperioden-gebundene PARDOK-URLs (`pardok-wp19.xml`, `exportWP8.xml`) brechen bei
  der nächsten Landtagswahl — Wartungspflicht dokumentieren/automatisieren.

---

## 7. PACKAGE-MATRIX

| Paket | Status | is_base | Ebene/Geo | Abrufwege | Publisher (ca.) | Entities (Kern) | Future Targets | Aktivierung | Rollback | Freigabe |
|---|---|:---:|---|:---:|:---:|---|---|---|---|---|
| **bund-basis** | active | ✅ | bund | **54** | 22 | Bundestag, Bundesregierung, Bundesrat, 22 Ausschüsse, 8 Fraktionen, Leitmedien, DIP | — | ✅ bereit | ⚠️ eingeschränkt (Kernbasis; Entzug entzieht Grundversorgung) | ✅ (Bestand) |
| **arbeit-und-soziales** | active | ❌ | bund | **84** | ~40 | BMAS, BA, Destatis, DRV, Gewerkschaften, Verbände, A&S-Ausschuss | — | ✅ bereit | ✅ sicher (additiv) | ✅ (Bestand) · **P2-8 konsolidieren** |
| **die-linke-bund** | active | ❌ | bund | **2 (committet) / 3 (Code)** | 2 | Die Linke, Linksfraktion | — | ⚠️ **P0-1**: committet 0 funktionierende Wege | ✅ sicher | ❌ **erst P0-1 fixen** |
| **regional-niedersachsen** | active | ❌ | land/NDS | **4** | 1 (Aggregator) | Salzgitter/Braunschweig/Wolfenbüttel (Geo) | — | ✅ bereit | ✅ sicher | ✅ (Bestand) |
| **profil-<id>** (dynamisch) | (Laufzeit) | ❌ | — | 1 je Mandat | — (Google News) | — | — | ✅ pro Mandat | ✅ sicher (mandantenlokal) | ✅ |
| **berlin-basis** | prepared | ✅ | land/BE | **10** (inaktiv) | 7 | AGH, Senat, Die Linke Berlin, T. Schulze | 5 Pflichtklassen offen | ❌ nicht bereit (prepared + Hard-Gate) | ⚠️ **P1-6** (rbb24-Kopplung) | ❌ **erst P0-2/P1-3/P1-6** |
| **brandenburg-basis** | prepared | ✅ | land/BB | **9** (inaktiv) | 7 | Landtag, Landesregierung, Die Linke BB | 6 Pflichtklassen offen; Orphan `stk` | ❌ nicht bereit | ⚠️ **P1-6** (rbb24-Kopplung) | ❌ **erst P0-2/P1-3/P1-6** |

**Paketgrenzen-Prüfung (Auftrag §9):** Auf **Bundesebene** sind die Grenzen sauber — Region
(`regional-niedersachsen`) ist strikt vom Fachthema (`arbeit-und-soziales`) getrennt
(`packageKeysForSource` früher `return`), Partei (`die-linke-bund`) und Person (`profil-<id>`)
sind aus der neutralen Basis herausgelöst. **Fachthemen-Überschneidungen** (Verteidigung↔Außen↔
Haushalt↔Wirtschaft; Gesundheit↔Pflege↔Soziales; Klima↔Wirtschaft↔Verkehr; Bildung↔Forschung)
sind heute **unkritisch**, weil außer `arbeit-und-soziales` **kein** weiteres Fachthemenpaket
existiert — alle anderen Politikfelder liegen als einzelne Ausschuss-Google-News-Wege in
`bund-basis`. Die Abgrenzungsfrage wird erst real, sobald ein zweites Fachpaket (z. B.
Gesundheit) gebaut wird; dann muss geklärt werden, ob „Pflege" zu Gesundheit oder A&S gehört
(heute in A&S). **Auf Landesebene ist die Grenze verletzt** (P0-2). **Empfehlung:** Vor dem
zweiten Fachpaket eine explizite Themen→Paket-Zuordnungsmatrix definieren (heute implizit in
`themeTerms`).

---

## 8. RETRIEVAL-PATH-MATRIX

> 162 Wege gesamt (144 aktiv + 18 BE/BB prepared). Die **134 Google-News-Wege** teilen **einen**
> Endpunkt (`news.google.com/rss/search`); sie werden hier nach Kategorie aggregiert bewertet
> (eine Einzelprüfung 134 identischer Endpunkte ist ohne Aussagewert). Die **Direkt-/API-Wege**
> mit echter dereferenzierbarer URL sind einzeln in §12 (Linkliste) geführt.

| Kategorie | Wege | Publisher | Status | Signalwert | Rauschquote | Empfehlung |
|---|:---:|---|---|---|---|---|
| Direkt-RSS Leitmedien/ÖR (bmas, tagesschau, dlf) | 3 | je eigen | ✅ healthy | hoch | niedrig | **behalten** |
| DIP-API | 1 | Bundestag | ✅ healthy | **sehr hoch** (amtl. Vorgänge) | sehr niedrig | **behalten** (Anker) |
| Defekte Direkt-Wege (bundestag, bundesregierung, die-linke, linksfraktion, dgb, ausschuss-a-s) | 6 | je eigen | ❌ broken | hoch (wenn repariert) | niedrig | **verbessern** (P1-5: Reparatur einspielen) |
| Ausschuss-Google-News (22 Ausschüsse) | 22 | Aggregator | ⚠️ needs_review | mittel | mittel-hoch | **behalten**, aber amtl. Primärquelle ergänzen (P2-9) |
| Fraktions-Google-News (8 Fraktionen) | 8 | Aggregator | ⚠️ needs_review | mittel | mittel | **behalten** |
| Bundestag/-regierung/Koalition-General | 5 | gemischt | ⚠️ needs_review | mittel-hoch | mittel | **behalten** |
| Leitmedien-`site:`-Suchen | 14 | je eigen | ⚠️ needs_review | mittel | mittel | **behalten**, ggf. Zahl reduzieren |
| A&S: news/radar/signal/process/institution | ~40 | gemischt | ⚠️ needs_review | mittel-hoch | mittel | **teilweise zusammenlegen** (P2-8) |
| A&S: `bundle-ausschuss-*` | 26 | Aggregator | ⚠️ needs_review | mittel | **hoch** (starke Überlappung) | **zusammenlegen/reduzieren** (P2-8) |
| Regional NDS | 4 | Aggregator | ⚠️ needs_review | niedrig-mittel | mittel | **behalten** (Pilot-Region) |
| BE/BB Google-News (prepared) | 12 | je eigen | needs_review/manual | mittel | mittel | **vorbereiten** (nach P0-2) |
| BE/BB Direkt-RSS + PARDOK (prepared) | 6 | je eigen | needs_review/manual | hoch (PARDOK sehr hoch) | niedrig | **vorbereiten**; 3 Parteifeeds brauchen serverseitigen Abruf (429) |

**Status-Verteilung aktiv:** 4 `healthy` · 6 `broken` · **134 `needs_review`** (P1-4).
**Methoden aktiv:** 134 `googlenews_search` · 7 `rss` · 2 `html` · 1 `api` (P1-7 SPOF).

---

## 9. PUBLISHER-MATRIX (Auszug + Bewertung)

> 51 aktive Publisher + 14 BE/BB (1 Dublette). Vollständige Bewertung nach Klassen:

| Publisher-Klasse | Anzahl | Wiederverwendung | Bewertung |
|---|:---:|---|---|
| Aggregator `aggregator-google-news` | 1 | **134 Wege** | ✅ korrekt zentralisiert; aber SPOF (P1-7) |
| Amtliche Bund (Bundestag, -regierung, Bundesrat, DIP) | 4 | 1–3 je | ✅; Bundestag trägt Web+DIP (2 Wege) — korrekt |
| Ministerien (BMAS, BMG) | 2 (von 6 Entities) | 1–2 je | ⚠️ nur BMAS mit Direktweg (P2-9) |
| Behörden/Statistik (BA, Destatis, DRV, BRH, IAB, Minijob, Zoll, OECD) | 8 | 1 je | ✅ |
| Parteien/Fraktionen (Linke, Linksfraktion, SPD-Fr., CDU/CSU-Fr.) | 4 | 1–2 je | ⚠️ Trust-Inkonsistenz (P3-17); nur Linke mit Direktpaket |
| Verbände/Gewerkschaften (DGB, ver.di, IGM, VdK, SoVD, Paritätischer, Caritas, Diakonie, BDA, BDI, ZDH, WSI, Böckler, Dt. Verein) | 14 | 1 je | ✅ breit; DGB-Direktweg defekt (P1-5) |
| Leitmedien (Tagesschau, DLF, Spiegel, Zeit, SZ, FAZ, HB, Welt, taz, RND, ntv, ZDF, ARD, Politico, Table, Tagesspiegel, WiWo) | 17 | 1 je | ✅ |
| **Orphan** `publisher-stk.brandenburg.de` | 1 | **0 Wege** | ❌ **P2-12 entfernen oder Weg ergänzen** |
| **Dublette** `publisher-tagesspiegel.de` (Bund + BE/BB) | — | — | ⚠️ P3-17 (do-nothing, harmlos, aber Trust divergiert) |

**Doppelte Domains / falsche Publisher:** Keine echten Domain-Dubletten in der aktiven Menge
(Unique-Constraint auf `canonical_domain` verhindert sie). `die-linke.de` (Partei) vs.
`dielinkebt.de` (Fraktion) sind korrekt getrennte Herausgeber. Publisher mit nur **einem** Weg
sind bei Fach-/Verbandsquellen sachlich korrekt (ein Verband = eine `site:`-Suche).

---

## 10. ENTITY-MATRIX

| Typ | Anzahl (aktiv) | Wiederverwendung | Dublettenprüfung |
|---|:---:|---|---|
| party | 9 | via Publisher/Matching | ✅ eindeutig; CSU separat (korrekt), Fraktion `cdu-csu` kombiniert |
| parliamentary_group | 8 | Fraktions-Wege | ⚠️ SSW als Gruppe fragwürdig (P3-20) |
| committee | 23 | Ausschuss-Wege | ✅ eindeutig; `menschenrechte`-Key-Kollision mit `recht` bewusst gelöst |
| ministry | 6 | Ministeriums-Wege | ⚠️ **unvollständig**: ~9 Bundesministerien fehlen (P2-9); A&S-lastig |
| parliament | 4 (2 Bund + BE/BB) | Publisher | ✅ |
| government | 3 (Bund + BE/BB) | Publisher | ✅ |
| union/association | 11 | Verbands-Wege | ✅ |
| authority/statistical_office | 5 | Publisher | ✅ |
| **person** | **1 (BE/BB)** | Publisher + Entity | ❌ **P2-10**: namentlicher Einzelpolitiker als geteilte Entity — widerspricht Neutralisierung |

**Historische Dubletten / Amtsinhaber als Entity:** In der **aktiven** Bund-Schicht **keine**
(sauber). Der einzige Personeneintrag (`person-tobias-schulze`) liegt im inaktiven BE/BB-Seed und
ist der zentrale Neutralitätsbefund (P0-2/P2-10). Keine doppelten Institutionen/Ausschüsse/
Ministerien/Behörden gefunden.

---

## 11. FUTURE-TARGET-MATRIX

| Future Target | Ebene/Geo | Reifegrad (Seed) | Verifikation | Priorität | Aufnahmeempfehlung |
|---|---|---|---|:---:|---|
| **Berlin-Landesmodul** (10 Klassen besetzt) | land/BE | `kandidat` → prepared | 24/24 real geprüft; PARDOK 8108 Dok. | **hoch** | **Aufnehmen nach P0-2** (Pilot-Quellen aus Basis lösen) |
| **Brandenburg-Landesmodul** (13/15) | land/BB | `kandidat` → prepared | verifiziert; PARDOK 6092 Vorg. | **hoch** | **Aufnehmen nach P0-2**; `staatskanzlei`/`fraktion`/`person` fehlen |
| **Bundesweg-Reparaturen** (6) | bund | verifiziert, `angewendet:0` | 6/6 HTTP 200 (Runner) | **hoch** | **Sofort einspielen** (P1-5), Priorität `rp-bundestag`+`rp-linksfraktion` |
| **PARDOK-Dispatch** (structured_download) | bund/land | gebaut, shadow | Parser 0 Fehler | mittel | Mit BE/BB aktivieren |
| **13 weitere Bundesländer** | land | nur Geo-Gerüst | — | niedrig | Erst nach BE/BB-Blaupause |
| **Bezirks-/Kreis-Ebene** (BE 12, BB 18) | bezirk/kreis | Geo ohne Wege/Entities | — | niedrig | Later (profilgetrieben) |
| **Bundesgesetzblatt / recht.bund.de** | bund | **nicht angelegt** | — | mittel | **Sofort aufnehmen** (amtl. Primärquelle, P2-9) |
| **Fehlende Ministerien-Direktwege (BMG/BMF/BMI/AA/…)** | bund | Entity ohne Direktweg | — | mittel | Prüfen (viele bot-gesperrt → ggf. Google-News) |

**Bewertung „korrekt Future Target vs. sofort aufnehmen":** BE/BB und die Bundesweg-Reparaturen
sind **reif genug, um zeitnah aufgenommen zu werden** (verifiziert), sind aber korrekt hinter
eigenen Freigaben geparkt. Bundesgesetzblatt/recht.bund.de sollte **sofort** als Kandidat
angelegt werden. Die 13 Rest-Länder und die Bezirks-/Kreis-Ebene sind **korrekt** Future Targets.

---

## 12. LINK-AUDIT & VOLLSTÄNDIGE LINKLISTE (Direkt-/API-Wege)

> **Legende:** ✅ Verifiziert · ⚠️ Weiterleitung/Einschränkung · ❌ Defekt.
> **Verifikationsquelle:** R = Sprint-9B-Runner (2026-07-14, offener Egress) · W = WebSearch
> (2026-07) · S = Repo-Snapshot (`KNOWN_PATH_HEALTH`). Direkte HTTP-Prüfung aus dem Audit-
> Sandkasten war policy-geblockt (siehe Kopf).

### Aktive Direkt-/API-Wege

| Retrieval Path | Paket | Publisher | Primäre URL | Status | RSS? | Quelle | Empfehlung |
|---|---|---|---|:---:|:---:|:---:|---|
| rp-bmas | A&S | BMAS | `bmas.de/…/RSSNewsfeed.xml` | ✅ | ja | S+W | behalten |
| rp-tagesschau-politik | bund-basis | Tagesschau | `tagesschau.de/…/alle-meldungen-100~rss2.xml` | ✅ | ja | S | behalten |
| rp-deutschlandfunk-politik | bund-basis | DLF | `deutschlandfunk.de/nachrichten-100.rss` | ✅ | ja | S+W | behalten |
| rp-dip | bund-basis | Bundestag/DIP | `search.dip.bundestag.de/api/v1` | ✅ | API | S | behalten (Anker; API-Key) |
| rp-bundestag | bund-basis | Bundestag | `bundestag.de/rss` | ❌ | – | R+W | **ersetzen** → `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` |
| rp-bundesregierung | bund-basis | Bundesregierung | `bundesregierung.de/breg-de/service/rss` | ❌ | – | R | **ersetzen** → Google-News `site:bundesregierung.de` (Direktfeed real 404) |
| rp-die-linke | die-linke-bund | Die Linke | `die-linke.de/start/presse/rss.xml` | ❌ | – | R | **ersetzen** → Google-News `site:die-linke.de` (Direktfeed 429 bot) |
| rp-linksfraktion | die-linke-bund | Linksfraktion | `dielinkebt.de/presse/pressemitteilungen/rss.xml` | ❌ | – | R | **ersetzen** → `dielinkebt.de/presse/pressemitteilungen/feed.rss` (verifiziert 200) |
| rp-ausschuss-arbeit-soziales | A&S | Bundestag | `bundestag.de/ausschuesse/a11_arbeit_soziales` | ❌ | – | R+S | **ersetzen** → Google-News `site:bundestag.de "Ausschuss für Arbeit und Soziales"` |
| rp-dgb | A&S | DGB | `dgb.de` (HTML-Scrape) | ❌ | – | R+W | **ersetzen** → `dgb.de/service/rss` (echter RSS) **oder** Google-News `site:dgb.de` |
| (134 Google-News-Wege) | div. | Aggregator | `news.google.com/rss/search?q=…` | ✅ (Endpunkt) | – | S | Endpunkt gültig; SPOF beachten (P1-7) |

### BE/BB prepared (inaktiv) — verifiziert für spätere Aktivierung

| Retrieval Path | Publisher | Primäre URL | Status | Quelle | Hinweis |
|---|---|---|:---:|:---:|---|
| rp-be-plenum | AGH (PARDOK) | `parlament-berlin.de/opendata/pardok-wp19.xml` | ✅ | R+W | 8108 Dok.; **WP-gebunden** (P3-21); >48 MB streamen |
| rp-bb-plenum | Landtag BB (parldok) | `parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml` | ✅ | R | 6092 Vorg.; **WP-gebunden** |
| rp-be-regionale_leitmedien | Tagesspiegel | `tagesspiegel.de/contentexport/feed/berlin` | ✅ | R | 20 Items |
| rp-rbb24-politik | rbb24 (BE+BB) | `rbb24.de/politik/index.xml/feed=rss.xml` | ✅ | R+W | **Kopplung P1-6** |
| rp-be-partei_pilot | Die Linke Berlin | `dielinke.berlin/presse/feed.rss` | ⚠️ | R | 429 bot → serverseitiger Abruf nötig |
| rp-be-fraktion_pilot | Linksfraktion Berlin | `linksfraktion.berlin/aktuelles/presse/feed.rss` | ⚠️ | R | 429 bot |
| rp-bb-partei_pilot | Die Linke Brandenburg | `dielinke-brandenburg.de/nc/politik/aktuell/feed.rss` | ⚠️ | R | 429 bot |
| (12 BE/BB Google-News) | je eigen | `news.google.com/rss/search?q=…` | ✅ | R | Endpunkt gültig |

### Defekte Links (Zusammenfassung)
6 aktive Direkt-Wege defekt: **bundestag, bundesregierung, die-linke, linksfraktion,
ausschuss-arbeit-soziales, dgb**. Ursache durchgängig: Bot-Sperre (403/429) oder umgezogener/
gelöschter Feed-Pfad (404). Alle 6 haben **verifizierte** Reparaturen (`bundeswege-reparaturen.js`),
die **noch nicht eingespielt** sind (P1-5).

### Ersetzte Links (empfohlene Korrekturen)
| Alt (defekt) | Neu (verifiziert) | Belegqualität |
|---|---|---|
| `bundestag.de/rss` | `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` | official_primary (Direkt-RSS) |
| `dielinkebt.de/…/rss.xml` | `dielinkebt.de/presse/pressemitteilungen/feed.rss` | official_primary (Pilot-Fraktion) |
| `dgb.de` (Scrape) | `dgb.de/service/rss` | Direkt-RSS (besser als Proxy) |
| `bundesregierung.de/…/rss` | Google-News `site:bundesregierung.de` | journalistisch (Direktfeed 404) |
| `die-linke.de/…/rss.xml` | Google-News `site:die-linke.de` | journalistisch (Direktfeed 429) |
| `bundestag.de/ausschuesse/a11…` | Google-News `site:bundestag.de "Ausschuss für Arbeit und Soziales"` | journalistisch |

### Entfernte Links (Empfehlung dauerhaft raus)
- **Orphan-Publisher `publisher-stk.brandenburg.de`** — 0 Wege; entweder `rp-bb-staatskanzlei`
  ergänzen oder Publisher entfernen.
- **Keine** aktiven Wege sind ersatzlos zu streichen — die 6 defekten werden **ersetzt**, nicht
  entfernt.

### Finale Whitelist (bereinigte, gültige offizielle URLs)
**Aktiv sofort gültig (4 Direkt + 1 API + 1 Aggregator-Endpunkt):**
1. `https://www.bmas.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml`
2. `https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml`
3. `https://www.deutschlandfunk.de/nachrichten-100.rss`
4. `https://search.dip.bundestag.de/api/v1` (API-Key)
5. `https://news.google.com/rss/search?q=…` (Aggregator-Endpunkt, 134 Wege)

**Nach Einspielen der verifizierten Reparaturen zusätzlich gültig (6):**
6. `https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss`
7. `https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss`
8. `https://www.dgb.de/service/rss`
9. Google-News `site:bundesregierung.de` · 10. `site:die-linke.de` · 11. `site:bundestag.de "Ausschuss für Arbeit und Soziales"`

**BE/BB nach Freigabe (P0-2 gelöst) gültig (verifiziert):**
12. `https://www.parlament-berlin.de/opendata/pardok-wp19.xml`
13. `https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml`
14. `https://www.tagesspiegel.de/contentexport/feed/berlin`
15. `https://www.rbb24.de/politik/index.xml/feed=rss.xml`
16–18. `dielinke.berlin` / `linksfraktion.berlin` / `dielinke-brandenburg.de` (serverseitiger Abruf, 429)

> **Whitelist-Status:** vollständig für die aktiven Wege. Sie enthält **keine bekannten defekten
> Links mehr**, sobald die 6 verifizierten Reparaturen (P1-5) eingespielt sind. Bis dahin bleiben
> die 6 defekten Wege korrekt als `broken` markiert und durch Google-News-Ersatz kompensiert
> (100 % Ertragsabdeckung, Master-Status §5).

---

## 13. AKTIVIERUNGSGATE (je Paket)

| Paket | Aktivierungsreife | Voraussetzung |
|---|---|---|
| bund-basis | ✅ **bereit** (aktiv) | — |
| arbeit-und-soziales | ✅ **bereit** (aktiv) | P2-8 Konsolidierung empfohlen |
| die-linke-bund | ⚠️ **vorbereitet** | **P0-1** (Seed-Regenerierung) |
| regional-niedersachsen | ✅ **bereit** (aktiv) | — |
| berlin-basis | ❌ **nicht bereit** | P0-2 + P1-3 + P1-6 + Reparaturen |
| brandenburg-basis | ❌ **nicht bereit** | P0-2 + P1-3 + P1-6 + Orphan/Pflichtklassen |

## 14. ROLLBACK-GATE (je Paket)

| Paket | Rollback | Begründung |
|---|---|---|
| bund-basis | ⚠️ **eingeschränkt** | Entzug entzieht die Grundversorgung aller Mandate; nur „archivieren", nicht löschen |
| arbeit-und-soziales | ✅ **sicher** | additiv; `package_paths`-Cascade sauber; geteilte Publisher bleiben |
| die-linke-bund | ✅ **sicher** | additiv |
| regional-niedersachsen | ✅ **sicher** | additiv |
| profil-<id> | ✅ **sicher** | mandantenlokal |
| berlin-basis | ⚠️ **eingeschränkt** | **P1-6** rbb24 koppelt BB; `document_findings` sind FK-lose Textverweise → nach Aktivierung verwaiste Pointer |
| brandenburg-basis | ⚠️ **eingeschränkt** | **P1-6** rbb24 koppelt BE |

**Datenmodell-Rollback allgemein:** `package_paths`/`retrieval_paths`/`publishers` haben saubere
`on delete cascade`-Ketten; der Guarded-Rollback im Landesmodul-Generator schützt geteilte
Herausgeber korrekt. **Aber:** `document_findings.retrieval_path_id/publisher_id` sind **kein FK**
(bewusst, damit Dokumente den Wegentzug überleben) — nach einer echten Aktivierung + Rollback
bleiben baumelnde Textverweise (heute folgenlos, da BE/BB nie aktiv).

---

## 15. GESAMTEMPFEHLUNG

**Darf die Quellenarchitektur in dieser Form später aktiviert werden?**

**Der Bund-Bestand (bund-basis, arbeit-und-soziales, regional-niedersachsen): JA** — er ist aktiv,
versorgt den Piloten nachweislich und ist strukturell sauber. **Jede weitere Aktivierung
(die-linke-bund-Neuaufbau, Berlin/Brandenburg, Zweitmandanten anderer Parteien): NEIN**, bis die
folgenden Punkte **zwingend** behoben sind:

**Muss vor der nächsten Aktivierung (Blocker):**
1. **P0-1** — Seed aus dem Code regenerieren; CI-Gate „committer Seed == `generate()`"; `die-linke-bund`
   erhält den funktionierenden `rp-fraction-linke`-Weg auch im Artefakt.
2. **P0-2** — Pilot-/Partei-/Personenquellen aus dem `is_base`-Landespaket herauslösen (separates
   Partei-Paket + dynamisches Personenpaket, analog Bund).
3. **P1-3** — `path_expected_levels`/`political_level` für die aktive Architektur befüllen
   (Ebenen-/Geo-Qualitätsprüfung braucht Grundwahrheit).

**Muss vor dem Skalieren / Landesausbau:**
4. **P1-5** — verifizierte Bundesweg-Reparaturen einspielen (Priorität `rp-bundestag`, `rp-linksfraktion`, `dgb`-RSS).
5. **P1-4** — Telemetrie schreibt Pfad-Status zurück (Status-Automat scharfschalten).
6. **P1-6** — rbb24-Kopplung auflösen (getrennte Wege je Land) für modularen Rollback.
7. **P1-7 / P2-8** — Google-News-SPOF entschärfen (Zweitpfad/Heartbeat) und A&S-Redundanz konsolidieren.

**Sollte vor der Skalierung auf viele Mandate:**
8. P2-9 (amtliche Primärquellen: Ausschüsse, Ministerien, Bundesgesetzblatt) · P2-12 (Orphan/
   Pflichtklassen) · P2-13/14 (Modell-Redundanz/Geo-Semantik) · P3-Punkte als Aufräumarbeit.

**Fazit:** 🟡 **GELB — bedingte Freigabe.** Das Fundament trägt; die Blocker sind konkret,
lokalisiert und in überschaubarer Zeit behebbar. Nach P0-1, P0-2 und P1-3 kann das Gate für die
BE/BB-Aktivierung erneut vorgelegt werden.

---

*Erstellt im Rahmen des finalen Architektur-Gates. Live-HTTP-Verifikation war im Audit-Sandkasten
policy-geblockt; der Link-Audit stützt sich auf den verifizierten Sprint-9B-Runner-Test,
WebSearch-Korroboration (2026-07) und die Repo-Health-Snapshots. Alle Datei:Zeile-Belege gegen den
Stand des Prüf-Branches.*
