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

> ## 🔧 NACHTRAG (Behebungs-Sprint, 2026-07-24, selbe Sitzung) — P0-1, P0-2 und P1-5 BEHOBEN
>
> Auf Anweisung wurden **ausschließlich** drei Befunde bearbeitet — keine weiteren
> Architekturänderungen, keine neuen Pakete/Quellen, keine Aktivierung:
> - **P0-1** (Seed-Reproduzierbarkeit) — **behoben**.
> - **P0-2** (Neutralität der Landes-Basispakete) — **behoben**.
> - **P1-5** (verifizierte Bundesweg-Reparaturen übernehmen) — **behoben**.
>
> **Numerierungs-Hinweis (Transparenz):** Der Behebungs-Auftrag bezeichnete den dritten Punkt
> als „P1-3" — das entspricht inhaltlich **diesem Dokuments P1-5** (Bundesweg-Reparaturen
> übernehmen), **nicht** dem hier unter P1-3 geführten `path_expected_levels`/`political_level`-
> Befund (der bleibt, wie im Auftrag explizit ausgeschlossen, **unverändert offen**). Grund der
> Verwechslung: die Ampel-/Fazit-Zeilen in §1/§15 nannten „P0-1, P0-2 und P1-3" als griffige
> Kurzformel für „die drei wichtigsten Blocker" — dabei referenzierte „P1-3" dort tatsächlich den
> echten P1-3-Befund, nicht P1-5. Bearbeitet wurde entsprechend der **inhaltlichen** Beschreibung
> im Auftrag (Bundesweg-Reparaturen) = **P1-5**. Volle Ursache/Lösung/Testnachweis: **§19**.
>
> **Alle übrigen Befunde (P1-3, P1-4, P1-6, P1-7, P2-\*, P3-\*) bleiben unverändert offen** —
> explizit nicht Teil dieses Sprints. Ampel bleibt **🟡 GELB**: die 3 Freigabe-*Blocker* sind
> gelöst, mehrere wichtige Betriebslücken (Status-Rückschreibung, rbb24-Kopplung, Google-News-
> SPOF, Qualitäts-Grundwahrheit) bestehen fort. Siehe §19 für den vollständigen Bericht.

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

1. **Integritäts-/Neutralitätsdefekte am „Source of Truth".** ✅ **BEHOBEN** (siehe §19). Der
   committete Seed **reproduzierte nicht aus dem Code** (empirisch verifiziert): das Partei-Paket
   des realen Piloten (`die-linke-bund`) wurde mit **null funktionierenden Abrufwegen**
   ausgeliefert; nur ein manueller Production-Hotfix rettete ihn. Und das **neutrale,
   verpflichtende** Landes-Basispaket (`berlin-basis`/`brandenburg-basis`, `is_base=true`)
   enthielt **pilot-spezifische Partei-, Fraktions- und Personenquellen** (Die Linke + der
   namentliche Einzelpolitiker Tobias Schulze) — ein direkter Bruch mit der auf Bundesebene
   sauber durchgezogenen Mandantenneutralität.

2. **Betriebs-/Qualitätslücken.** 93 % aller Abrufwege laufen über **einen** Google-News-
   `batchexecute`-Auflöser (Single Point of Failure, weiterhin offen); 134 von 144 Wegen standen
   **dauerhaft** auf `needs_review`, weil die Telemetrie den Pfad-Status nie zurückschreibt (die
   6-stufige Status-Maschine ist weiterhin in Production toter Code, offen); die verifizierten
   Reparaturen der 6 defekten amtlichen Primärquellen sind jetzt ✅ **eingespielt** (siehe §19);
   die Qualitäts-Grundwahrheit (`path_expected_levels`, `political_level`) ist für die aktive
   Architektur weiterhin **unbefüllt (0/231)** (offen, explizit außerhalb dieses Behebungs-Sprints).

**Kein Befund gefährdet den laufenden Bund-Bestand** (bund-basis/arbeit-und-soziales versorgen
den Piloten nachweislich mit 100 % Ertragsabdeckung). Aber **mehrere Befunde sind harte Blocker
für die nächste Aktivierungsstufe** (Berlin/Brandenburg, weitere Pakete, Zweitmandanten anderer
Parteien).

### Gesamtbewertung / Reifegrad / Ampel

| Dimension | Bewertung |
|---|---|
| **Architektur-Reifegrad** | **Strukturell: produktionsreif. Operativ/Datenpflege: Beta.** |
| **Ampel** | 🟡 **GELB** (unverändert — P0-1/P0-2/P1-5 behoben, aber P1-3/P1-4/P1-6/P1-7 bleiben offen) |
| **Freigabe** | **Bedingt, wie zuvor.** Bund-Bestand bleibt aktiv. Die 3 bearbeiteten Blocker (**P0-1, P0-2, P1-5** — siehe NACHTRAG oben + §19) sind **behoben**. **Weiterhin keine Freigabe** für BE/BB-Aktivierung, bis zusätzlich **P1-3, P1-4 und P1-6 behoben** sind (unverändert offen, außerhalb dieses Sprints). |

---

## 2. ARCHITEKTUR-SCORE (0–10)

**Stand nach dem Behebungs-Sprint** (2026-07-24, gleicher Tag). Δ = Änderung ggü. dem
Erstbefund; Begründungen dort, wo nicht in Klammern anders vermerkt, unverändert gültig.

| Dimension | Score | Δ | Begründung (Kurz) |
|---|:---:|:---:|---|
| **Datenmodell** | **8** | — | Unverändert (path_expected_*/political_level nicht Teil dieses Sprints). Sauber normalisiert; klare Trennung Herausgeber/Weg/Paket/Entity/Geo; gute FKs & Indizes; Unique-Domain-Constraint. Abzug: `path_expected_*` leer, `represents_type`-Redundanz, weiche (FK-lose) Findings-Verweise. |
| **Wiederverwendung** | **8** | — | Unverändert; das Landes-Partei-Muster (P0-2-Fix) repliziert `die-linke-bund` konsistent statt es zu duplizieren. Abzug bleibt: DIP doppelt definiert, zwei divergierende Paket-Ableitungslogiken. |
| **Skalierung** | **6** | — | Unverändert. Google-News-SPOF + Klumpenrisiko, nicht aktivierbare Landesmodule (P1-3/P1-4/P1-6 offen), überladenes A&S-Paket bleiben. |
| **Wartbarkeit** | **7** | +3 | **P0-1 behoben:** Seed reproduziert jetzt byte-genau aus dem Code, CI-Gate (`seed-drift-test.js`) verhindert Rückfall. Restabzug: hartkodierte Wahlperioden-URLs (P3-21), toter Status-Automat (P1-4), DIP doppelt definiert (P3-15). |
| **Paketstruktur** | **8** | +2 | **P0-2 behoben:** Land-Basis ist jetzt neutral (12 Klassen), Partei-/Personenquellen in eigenen `die-linke-berlin`/`die-linke-brandenburg`-Paketen — Muster jetzt bund- UND landeskonsistent. Restabzug: A&S überladen (~85 Wege, P2-8), Landtagsprofile weiterhin nie voll aktivierbar (P1-3/P1-4/P1-6/P2-11). |
| **Retrieval-Qualität** | **6** | +1 | **P1-5 behoben:** alle 6 vormals defekten Bundeswege tragen jetzt verifizierte, funktionierende URLs (0 `broken` mehr). Restabzug (dominant): 93 % Google News, keine amtlichen Ausschuss-/Ministeriums-Direktwege (P2-9), Status-Rückschreibung weiterhin tot (P1-4). |
| **Politische Relevanz** | **8** | +1 | Bundestag/Bundesregierung/DGB/Ausschuss-A&S wieder real erreichbar (waren `broken`). Abzug bleibt: fehlende Primärquellen (P2-9), Themen-Enge außerhalb Sozialpolitik. |
| **Zukunftssicherheit** | **7** | +1 | Seed-Drift kann dank CI-Gate nicht mehr unbemerkt wiederkehren (P0-1). Restabzug: Wahlperioden-Bindung der PARDOK-URLs (P3-21), SPOF (P1-7), unbefüllte Qualitätsschicht (P1-3). |
| **GESAMT (Ø)** | **7,25** | **+0,95** | Die 3 bearbeiteten Blocker heben Wartbarkeit/Paketstruktur/Retrieval-Qualität/Zukunftssicherheit spürbar; die verbleibenden P1/P2/P3-Befunde (Betrieb, nicht Integrität) drücken den Schnitt weiterhin unter „produktionsreif operativ". |

---

## 3. KRITISCHE PROBLEME (P0) — Freigabe-Blocker

### P0-1 — Der committete Seed reproduziert NICHT aus dem Code; `die-linke-bund` wird mit 0 funktionierenden Wegen ausgeliefert
> ✅ **BEHOBEN** (Behebungs-Sprint 2026-07-24, siehe §19.1). Text unten unverändert als
> historischer Befund erhalten.

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
> ✅ **BEHOBEN** (Behebungs-Sprint 2026-07-24, siehe §19.2). Text unten unverändert als
> historischer Befund erhalten.

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
> ✅ **BEHOBEN** (Behebungs-Sprint 2026-07-24, siehe §19.3 — im Auftrag als „P1-3" bezeichnet,
> siehe Numerierungs-Hinweis im NACHTRAG oben). Text unten unverändert als historischer Befund
> erhalten.

`seeds/bundeswege-reparaturen.js` hält für alle 6 defekten Wege **real verifizierte** Reparaturen
(Sprint 9B, HTTP 200), aber `angewendet: 0` — der aktive Katalog/Seed trägt weiter die defekten
URLs. Zwei davon sind **nicht gleichwertig** ersetzbar (Diag 28): `rp-bundestag`
(`…/static/appdata/includes/rss/pressemitteilungen.rss`, official_primary) und `rp-linksfraktion`
(`dielinkebt.de/presse/pressemitteilungen/feed.rss`, eigene Primärstimme des Piloten) haben echte
Direktfeeds, während die anderen 4 nur zu Google-News-Suchen repariert werden.
**Zusatzfund:** Für **DGB** existiert ein echter RSS-Feed (`dgb.de/service/rss` bzw.
`dgb.de/einblick/rss`, WebSearch-korroboriert) — besser als der vorgeschlagene Google-News-Ersatz.
**Behebungs-Sprint-Hinweis:** bewusst **nicht** angewendet — der Auftrag verlangte explizit „keine
neue Recherche, nur bereits dokumentierte Korrekturen übernehmen"; dieser Fund stammt aus
Audit-WebSearch, nicht aus dem repo-eigenen Sprint-9B-Verifikationsprozess. `dgb` läuft daher
weiterhin über den (jetzt angewendeten) Google-News-Ersatz `site:dgb.de`; der echte Direkt-Feed
bleibt ein dokumentierter Kandidat für eine künftige, eigens verifizierte Reparaturrunde.

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

> **Stand nach Behebungs-Sprint** (P0-1/P0-2/P1-5 behoben — Änderungen markiert).

| Paket | Status | is_base | Ebene/Geo | Abrufwege | Publisher (ca.) | Entities (Kern) | Future Targets | Aktivierung | Rollback | Freigabe |
|---|---|:---:|---|:---:|:---:|---|---|---|---|---|
| **bund-basis** | active | ✅ | bund | **54** | 22 | Bundestag, Bundesregierung, Bundesrat, 22 Ausschüsse, 8 Fraktionen, Leitmedien, DIP | — | ✅ bereit | ⚠️ eingeschränkt (Kernbasis; Entzug entzieht Grundversorgung) | ✅ (Bestand) |
| **arbeit-und-soziales** | active | ❌ | bund | **84** | ~40 | BMAS, BA, Destatis, DRV, Gewerkschaften, Verbände, A&S-Ausschuss | — | ✅ bereit | ✅ sicher (additiv) | ✅ (Bestand) · **P2-8 konsolidieren** (offen) |
| **die-linke-bund** | active | ❌ | bund | **3** ~~(2 committet)~~ ✅ P0-1 behoben | 2 | Die Linke, Linksfraktion | — | ✅ **bereit** (P0-1 behoben: `rp-fraction-linke` jetzt im Seed) | ✅ sicher | ✅ **frei** |
| **regional-niedersachsen** | active | ❌ | land/NDS | **4** | 1 (Aggregator) | Salzgitter/Braunschweig/Wolfenbüttel (Geo) | — | ✅ bereit | ✅ sicher | ✅ (Bestand) |
| **profil-<id>** (dynamisch) | (Laufzeit) | ❌ | — | 1 je Mandat | — (Google News) | — | — | ✅ pro Mandat | ✅ sicher (mandantenlokal) | ✅ |
| **berlin-basis** | prepared | ✅ | land/BE | **7** ~~(10)~~ (inaktiv) | 7 | AGH, Senat ~~, Die Linke Berlin, T. Schulze~~ (P0-2: entfernt) | 5 Pflichtklassen offen (unverändert — Zählbasis jetzt 12 neutrale) | ❌ nicht bereit (prepared + Hard-Gate) | ⚠️ **P1-6** (rbb24-Kopplung, offen) | ❌ **erst P1-3/P1-4/P1-6** (P0-2 behoben) |
| **brandenburg-basis** | prepared | ✅ | land/BB | **8** ~~(9)~~ (inaktiv) | 7 | Landtag, Landesregierung ~~, Die Linke BB~~ (P0-2: entfernt) | 6 Pflichtklassen offen; Orphan `stk` (offen) | ❌ nicht bereit | ⚠️ **P1-6** (rbb24-Kopplung, offen) | ❌ **erst P1-3/P1-4/P1-6** (P0-2 behoben) |
| **die-linke-berlin** *(neu, P0-2)* | prepared | ❌ | land/BE | **3** | 3 | Die Linke Berlin, Linksfraktion Berlin, T. Schulze | 3 Pilotklassen (partei/fraktion/person) | ❌ nicht bereit (prepared; Basis-Blocker gelten sinngemäß) | ✅ sicher (additiv) | ⚠️ folgt BE-Freigabe |
| **die-linke-brandenburg** *(neu, P0-2)* | prepared | ❌ | land/BB | **1** | 1 | Die Linke Brandenburg | 3 Pilotklassen (fraktion/person strukturell `unbesetzt`, 8. WP) | ❌ nicht bereit | ✅ sicher (additiv) | ⚠️ folgt BB-Freigabe |

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
| ~~Defekte~~ **Reparierte Direkt-/Ersatz-Wege** (bundestag, bundesregierung, die-linke, linksfraktion, dgb, ausschuss-a-s) | 6 | je eigen | ✅ **needs_review** (P1-5 behoben, war `broken`) | hoch | niedrig | **behalten**; nächster Live-Crawl bestätigt Status |
| Ausschuss-Google-News (22 Ausschüsse) | 22 | Aggregator | ⚠️ needs_review | mittel | mittel-hoch | **behalten**, aber amtl. Primärquelle ergänzen (P2-9) |
| Fraktions-Google-News (8 Fraktionen) | 8 | Aggregator | ⚠️ needs_review | mittel | mittel | **behalten** |
| Bundestag/-regierung/Koalition-General | 5 | gemischt | ⚠️ needs_review | mittel-hoch | mittel | **behalten** |
| Leitmedien-`site:`-Suchen | 14 | je eigen | ⚠️ needs_review | mittel | mittel | **behalten**, ggf. Zahl reduzieren |
| A&S: news/radar/signal/process/institution | ~40 | gemischt | ⚠️ needs_review | mittel-hoch | mittel | **teilweise zusammenlegen** (P2-8) |
| A&S: `bundle-ausschuss-*` | 26 | Aggregator | ⚠️ needs_review | mittel | **hoch** (starke Überlappung) | **zusammenlegen/reduzieren** (P2-8) |
| Regional NDS | 4 | Aggregator | ⚠️ needs_review | niedrig-mittel | mittel | **behalten** (Pilot-Region) |
| BE/BB Google-News (prepared) | 12 | je eigen | needs_review/manual | mittel | mittel | **vorbereiten** (nach P0-2) |
| BE/BB Direkt-RSS + PARDOK (prepared) | 6 | je eigen | needs_review/manual | hoch (PARDOK sehr hoch) | niedrig | **vorbereiten**; 3 Parteifeeds brauchen serverseitigen Abruf (429) |

**Status-Verteilung aktiv (nach P1-5-Fix):** 4 `healthy` · 0 `broken` ~~(vorher 6)~~ · **140
`needs_review`** (P1-4 weiterhin offen: keine automatische Statuspflege).
**Methoden aktiv:** 138 `googlenews_search` (davon 4 neu aus P1-5-Reparatur) · 5 `rss` (2 davon
neu aus P1-5-Reparatur: bundestag, linksfraktion; die vormals 2 `html`-Wege sind jetzt `rss`) ·
0 `html` · 1 `api` (P1-7 SPOF weiterhin offen).

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
| Verbände/Gewerkschaften (DGB, ver.di, IGM, VdK, SoVD, Paritätischer, Caritas, Diakonie, BDA, BDI, ZDH, WSI, Böckler, Dt. Verein) | 14 | 1 je | ✅ breit; DGB jetzt googlenews-Ersatz statt defektem Scrape (P1-5 behoben) |
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
| ~~**Bundesweg-Reparaturen** (6)~~ ✅ eingespielt | bund | verifiziert, **jetzt live in `sources.js`** (die Dokumentationsdatei `bundeswege-reparaturen.js` selbst bleibt unverändert — ihr `angewendet`-Feld ist statisch 0 per Design, reine Recherche-Ebene) | 6/6 HTTP 200 (Runner) | — | **Erledigt** (P1-5 behoben) — kein Future Target mehr |
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

> **Stand nach Behebungs-Sprint (P1-5):** alle 6 vormals defekten Wege tragen jetzt ihre
> verifizierte Ersatz-URL (`lib/helmut/sources.js`, byte-exakt aus `bundeswege-reparaturen.js`
> übernommen). Status in der DB-Seed-Spalte jeweils `needs_review` (nicht `healthy` — der
> Sprint-9B-Test lief außerhalb der App; die nächste echte Live-Crawl-Runde bestätigt final).

| Retrieval Path | Paket | Publisher | Primäre URL | Status | RSS? | Quelle | Empfehlung |
|---|---|---|---|:---:|:---:|:---:|---|
| rp-bmas | A&S | BMAS | `bmas.de/…/RSSNewsfeed.xml` | ✅ | ja | S+W | behalten |
| rp-tagesschau-politik | bund-basis | Tagesschau | `tagesschau.de/…/alle-meldungen-100~rss2.xml` | ✅ | ja | S | behalten |
| rp-deutschlandfunk-politik | bund-basis | DLF | `deutschlandfunk.de/nachrichten-100.rss` | ✅ | ja | S+W | behalten |
| rp-dip | bund-basis | Bundestag/DIP | `search.dip.bundestag.de/api/v1` | ✅ | API | S | behalten (Anker; API-Key) |
| rp-bundestag | bund-basis | Bundestag | ~~`bundestag.de/rss`~~ → `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` | ✅ **ersetzt** | ja | R+W | behalten (P1-5 behoben) |
| rp-bundesregierung | bund-basis | Bundesregierung | ~~`bundesregierung.de/breg-de/service/rss`~~ → Google-News `site:bundesregierung.de` | ✅ **ersetzt** | ja | R | behalten (P1-5 behoben, Direktfeed war real 404) |
| rp-die-linke | die-linke-bund | Die Linke | ~~`die-linke.de/start/presse/rss.xml`~~ → Google-News `site:die-linke.de` | ✅ **ersetzt** | ja | R | behalten (P1-5 behoben, Direktfeed 429 bot) |
| rp-linksfraktion | die-linke-bund | Linksfraktion | ~~`dielinkebt.de/…/rss.xml`~~ → `dielinkebt.de/presse/pressemitteilungen/feed.rss` | ✅ **ersetzt** | ja | R | behalten (P1-5 behoben, verifiziert 200) |
| rp-ausschuss-arbeit-soziales | A&S | Bundestag | ~~`bundestag.de/ausschuesse/a11_arbeit_soziales` (HTML)~~ → Google-News `site:bundestag.de "Ausschuss für Arbeit und Soziales"` | ✅ **ersetzt** | ja | R+S | behalten (P1-5 behoben) |
| rp-dgb | A&S | DGB | ~~`dgb.de` (HTML-Scrape)~~ → Google-News `site:dgb.de` | ✅ **ersetzt** | ja | R+W | behalten (P1-5 behoben; echter `dgb.de/service/rss` bleibt unangewendeter Zusatzfund, siehe §4 P1-5) |
| (138 Google-News-Wege, +4 aus P1-5) | div. | Aggregator | `news.google.com/rss/search?q=…` | ✅ (Endpunkt) | – | S | Endpunkt gültig; SPOF beachten (P1-7, offen) |

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
✅ **Behoben (Behebungs-Sprint 2026-07-24).** Vormals 6 aktive Direkt-Wege defekt: **bundestag,
bundesregierung, die-linke, linksfraktion, ausschuss-arbeit-soziales, dgb**. Ursache durchgängig:
Bot-Sperre (403/429) oder umgezogener/gelöschter Feed-Pfad (404). Alle 6 hatten **verifizierte**
Reparaturen (`bundeswege-reparaturen.js`), die zum Zeitpunkt des Erstaudits **noch nicht
eingespielt** waren (P1-5) — sind jetzt in `lib/helmut/sources.js` live. **Aktuell bekannte
defekte Links in der aktiven Architektur: 0.**

### Ersetzte Links (angewendete Korrekturen — Stand: LIVE, nicht mehr nur Empfehlung)
| Alt (defekt) | Neu (verifiziert, jetzt aktiv) | Belegqualität | Datei |
|---|---|---|---|
| `bundestag.de/rss` | `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` | official_primary (Direkt-RSS) | `sources.js:166` |
| `dielinkebt.de/…/rss.xml` (+ veraltete `linksfraktion.de`-Alternative entfernt) | `dielinkebt.de/presse/pressemitteilungen/feed.rss` | official_primary (Pilot-Fraktion) | `sources.js:203` |
| `dgb.de` (Scrape) | Google-News `site:dgb.de` | journalistisch (echter `dgb.de/service/rss` bleibt unangewendeter Zusatzfund, s. §4 P1-5) | `sources.js:237` |
| `bundesregierung.de/…/rss` | Google-News `site:bundesregierung.de` | journalistisch (Direktfeed 404) | `sources.js:155` |
| `die-linke.de/…/rss.xml` | Google-News `site:die-linke.de` | journalistisch (Direktfeed 429) | `sources.js:192` |
| `bundestag.de/ausschuesse/a11…` (HTML) | Google-News `site:bundestag.de "Ausschuss für Arbeit und Soziales"` | journalistisch | `sources.js:181` |

### Entfernte Links (Empfehlung dauerhaft raus)
- **Orphan-Publisher `publisher-stk.brandenburg.de`** — 0 Wege; entweder `rp-bb-staatskanzlei`
  ergänzen oder Publisher entfernen.
- **Keine** aktiven Wege sind ersatzlos zu streichen — die 6 defekten werden **ersetzt**, nicht
  entfernt.

### Finale Whitelist (bereinigte, gültige offizielle URLs)
**Aktiv sofort gültig (10 Direkt + 1 API + 1 Aggregator-Endpunkt) — Stand nach P1-5-Fix:**
1. `https://www.bmas.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml`
2. `https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml`
3. `https://www.deutschlandfunk.de/nachrichten-100.rss`
4. `https://search.dip.bundestag.de/api/v1` (API-Key)
5. `https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` ✅ **neu live** (P1-5)
6. `https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss` ✅ **neu live** (P1-5)
7. Google-News `site:bundesregierung.de&hl=de&gl=DE&ceid=DE:de` ✅ **neu live** (P1-5)
8. Google-News `site:die-linke.de&hl=de&gl=DE&ceid=DE:de` ✅ **neu live** (P1-5)
9. Google-News `site:bundestag.de "Ausschuss für Arbeit und Soziales"` ✅ **neu live** (P1-5)
10. Google-News `site:dgb.de&hl=de&gl=DE&ceid=DE:de` ✅ **neu live** (P1-5)
11. `https://news.google.com/rss/search?q=…` (Aggregator-Endpunkt, 138 Wege)

**Dokumentierter, NICHT angewendeter Kandidat (keine neue Recherche im Behebungs-Sprint):**
- `https://www.dgb.de/service/rss` — echter DGB-Direkt-Feed (WebSearch-korroboriert), besser als
  Zeile 10 oben; für eine künftige, eigens verifizierte Reparaturrunde vorgemerkt (§4 P1-5).

**BE/BB nach Freigabe (P0-2 gelöst; P1-3/P1-4/P1-6 weiterhin offen) gültig (verifiziert):**
12. `https://www.parlament-berlin.de/opendata/pardok-wp19.xml`
13. `https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml`
14. `https://www.tagesspiegel.de/contentexport/feed/berlin`
15. `https://www.rbb24.de/politik/index.xml/feed=rss.xml`
16–18. `dielinke.berlin` / `linksfraktion.berlin` / `dielinke-brandenburg.de` (serverseitiger Abruf, 429)

> **Whitelist-Status:** vollständig für die aktiven Wege. Sie enthält **keine bekannten defekten
> Links mehr** — die 6 vormals defekten Bundeswege (P1-5) sind jetzt eingespielt und live. BE/BB
> bleibt hinter P1-3/P1-4/P1-6 geparkt (unverändert, außerhalb dieses Sprints).

---

## 13. AKTIVIERUNGSGATE (je Paket)

| Paket | Aktivierungsreife | Voraussetzung |
|---|---|---|
| bund-basis | ✅ **bereit** (aktiv) | — |
| arbeit-und-soziales | ✅ **bereit** (aktiv) | P2-8 Konsolidierung empfohlen (offen) |
| die-linke-bund | ✅ **bereit** ~~vorbereitet~~ | — (**P0-1 behoben**: Seed regeneriert, `rp-fraction-linke` live) |
| regional-niedersachsen | ✅ **bereit** (aktiv) | — |
| die-linke-berlin *(neu)* | ⚠️ **vorbereitet** | folgt Berlin-Freigabe (P1-3/P1-4/P1-6) |
| die-linke-brandenburg *(neu)* | ⚠️ **vorbereitet** | folgt Brandenburg-Freigabe (P1-3/P1-4/P1-6) |
| berlin-basis | ❌ **nicht bereit** | ~~P0-2 +~~ P1-3 + P1-4 + P1-6 (**P0-2 behoben**: Basis jetzt neutral) |
| brandenburg-basis | ❌ **nicht bereit** | ~~P0-2 +~~ P1-3 + P1-4 + P1-6 + Orphan/Pflichtklassen (**P0-2 behoben**) |

## 14. ROLLBACK-GATE (je Paket)

| Paket | Rollback | Begründung |
|---|---|---|
| bund-basis | ⚠️ **eingeschränkt** | Entzug entzieht die Grundversorgung aller Mandate; nur „archivieren", nicht löschen |
| arbeit-und-soziales | ✅ **sicher** | additiv; `package_paths`-Cascade sauber; geteilte Publisher bleiben |
| die-linke-bund | ✅ **sicher** | additiv |
| regional-niedersachsen | ✅ **sicher** | additiv |
| profil-<id> | ✅ **sicher** | mandantenlokal |
| die-linke-berlin *(neu)* | ✅ **sicher** | additiv; eigenständiges Paket, keine Kopplung |
| die-linke-brandenburg *(neu)* | ✅ **sicher** | additiv; eigenständiges Paket, keine Kopplung |
| berlin-basis | ⚠️ **eingeschränkt** | **P1-6** rbb24 koppelt BB (offen); `document_findings` sind FK-lose Textverweise → nach Aktivierung verwaiste Pointer |
| brandenburg-basis | ⚠️ **eingeschränkt** | **P1-6** rbb24 koppelt BE (offen) |

**Datenmodell-Rollback allgemein:** `package_paths`/`retrieval_paths`/`publishers` haben saubere
`on delete cascade`-Ketten; der Guarded-Rollback im Landesmodul-Generator schützt geteilte
Herausgeber korrekt. **Aber:** `document_findings.retrieval_path_id/publisher_id` sind **kein FK**
(bewusst, damit Dokumente den Wegentzug überleben) — nach einer echten Aktivierung + Rollback
bleiben baumelnde Textverweise (heute folgenlos, da BE/BB nie aktiv).

---

## 15. GESAMTEMPFEHLUNG

**Darf die Quellenarchitektur in dieser Form später aktiviert werden?**

**Der Bund-Bestand (bund-basis, arbeit-und-soziales, regional-niedersachsen, jetzt auch
die-linke-bund): JA** — aktiv, versorgt den Piloten nachweislich und ist strukturell sauber.
**Berlin/Brandenburg-Aktivierung: weiterhin NEIN**, bis die verbleibenden Punkte behoben sind:

**Behoben in diesem Behebungs-Sprint (2026-07-24) — waren Blocker, sind es nicht mehr:**
1. ~~**P0-1**~~ ✅ **behoben** — Seed aus dem Code regeneriert; CI-Gate `seed-drift-test.js`
   verhindert Rückfall; `die-linke-bund` erhält den funktionierenden `rp-fraction-linke`-Weg auch
   im committeten Artefakt. Siehe §19.1.
2. ~~**P0-2**~~ ✅ **behoben** — Partei-/Fraktions-/Personenquellen aus `berlin-basis`/
   `brandenburg-basis` herausgelöst in die neuen Pakete `die-linke-berlin`/`die-linke-brandenburg`;
   ein echtes Linke-Landtagsmandat bleibt automatisch versorgt (`profile-packages.js`). Siehe §19.2.
3. ~~**P1-5**~~ ✅ **behoben** — alle 6 verifizierten Bundesweg-Reparaturen in `sources.js`
   übernommen; 0 `broken` Wege mehr in der aktiven Architektur. Siehe §19.3.

**Weiterhin offen — Muss vor BE/BB-Aktivierung (unverändert, außerhalb dieses Sprints):**
4. **P1-3** — `path_expected_levels`/`political_level` für die aktive Architektur befüllen
   (Ebenen-/Geo-Qualitätsprüfung braucht Grundwahrheit).
5. **P1-4** — Telemetrie schreibt Pfad-Status zurück (Status-Automat scharfschalten).
6. **P1-6** — rbb24-Kopplung auflösen (getrennte Wege je Land) für modularen Rollback.

**Weiterhin offen — Muss vor dem Skalieren auf viele Mandate:**
7. **P1-7 / P2-8** — Google-News-SPOF entschärfen (Zweitpfad/Heartbeat) und A&S-Redundanz konsolidieren.
8. P2-9 (amtliche Primärquellen: Ausschüsse, Ministerien, Bundesgesetzblatt) · P2-10 (Person
   weiterhin als geteilte Entity, unabhängig vom jetzt gelösten P0-2-Paketproblem) · P2-12
   (Orphan/Pflichtklassen) · P2-13/14 (Modell-Redundanz/Geo-Semantik) · P3-Punkte als Aufräumarbeit.

**Fazit:** 🟡 **GELB — bedingte Freigabe, unverändert.** Die 3 Integritäts-/Neutralitäts-Blocker
(P0-1, P0-2, P1-5) sind behoben und durch die aktualisierte Offline-Suite (141/141 grün, inkl.
neuem `seed-drift-test.js`) sowie einen Determinismus-/Referenz-Integritätsnachweis abgesichert
(§19). Das Gate für die BE/BB-Aktivierung bleibt **geschlossen**, bis zusätzlich P1-3, P1-4 und
P1-6 gelöst sind — diese drei sind konkret, lokalisiert und in überschaubarer Zeit behebbar,
waren aber explizit **nicht** Teil dieses Sprints.

---

## 19. NACHTRAG — Behebungs-Sprint (2026-07-24, gleiche Sitzung): P0-1, P0-2, P1-5 behoben

> **Auftrag:** ausschließlich P0-1, P0-2 und (im Auftrag als „P1-3" bezeichnet, hier P1-5)
> bearbeiten. Keine weiteren Architekturänderungen, keine neuen Pakete/Quellen/Future Targets,
> keine Aktivierung. Vollständige Regression danach; Audit-Update mit Ursache/Lösung/Dateien/
> Risiken/Testnachweis je Befund (dieser Abschnitt).

### 19.1 — P0-1: Seed-Reproduzierbarkeit

**Ursache (empirisch verifiziert, nicht nur vermutet).** `node scripts/generate-source-architecture-seed.js`
wurde gegen den committeten Seed ausgeführt und ergab einen realen Diff mit drei Abweichungen.
Git-Historie (`git show`) klärt den Ursprung jeder einzelnen:
1. **Die fehlende `die-linke-bund`-Zuordnung.** Die `fraction-linke`-Sonderregel in
   `seeds/packages.js` **existierte noch nicht** im Gründungscommit `b5251b1` (dort hatte
   `die-linke-bund` korrekt nur die 2 damals einzigen Wege). Der Master-Status dokumentiert
   (§5, 2026-07-14): das Team fand in Production, dass `die-linke-bund` 0 funktionierende Wege
   hatte, und fixte es **zweigleisig** — (a) ein **manueller, direkter SQL-`INSERT`** auf die
   **Production-DB** (am Seed vorbei) und (b) die permanente Coderegel in `packages.js`. Die
   committete **SEED-DATEI** wurde dabei nie regeneriert und blieb auf dem Gründungsstand
   eingefroren.
2. **Der Mandantenneutralisierungs-Kommentarblock.** Commit `40e130f`
   („Mandantenneutralisierung: Pilot-Hardcode aus aktivem Code entfernt", 2026-07-17) editierte
   die Seed-SQL-Datei **von Hand** (Entfernen der `pkg-profil-cem-ince`-Zeile, Text-Anpassungen)
   statt den Generator erneut laufen zu lassen — nachweisbar daran, dass der committete Seed einen
   Kommentarblock trägt, den `build()` selbst nie erzeugt.
3. **Die Publisher-Reihenfolge.** Indiz für denselben Root Cause: `aggregator-google-news` steht
   im committeten Seed an anderer Position als in einer frischen Generierung — die Datei spiegelt
   einen älteren `v1Sources`-Iterationsstand.
   
   **Gemeinsame Ursache aller drei:** Der Seed ist laut eigenem Dateikopf ein *generiertes*
   Artefakt („NICHT von Hand editieren"), aber nichts erzwang, dass er nach Code-Änderungen
   tatsächlich neu generiert und committet wird. Der Generator selbst ist **nicht** die Ursache —
   er ist nachweislich deterministisch (siehe Testnachweis).

**Lösung.**
1. Seed aus dem aktuellen Code regeneriert: `node scripts/generate-source-architecture-seed.js`
   und `node scripts/generate-landesmodul-seed.js`.
2. `scripts/generate-source-architecture-seed.js` refaktoriert: Datei-Schreiben in eine
   `writeFile()`-Funktion gezogen, hinter `if (require.main === module)` gesetzt, `build`/
   `writeFile`/`TARGET` exportiert — analog zum bereits so gebauten Schwester-Generator
   (`generate-landesmodul-seed.js`). Verhalten beim direkten CLI-Aufruf **byte-identisch**
   verifiziert (kein Verhaltensunterschied, nur `require()`-sicher gemacht).
3. **Neues CI-Gate** `scripts/seed-drift-test.js`: ruft `build()` beider Generatoren rein
   in-memory auf (kein Datei-Schreiben) und vergleicht **byte-genau** gegen die committeten
   Dateien (Bund-Seed, Landesmodul-Seed, Landesmodul-Rollback) + verifiziert Determinismus über
   einen zweiten In-Memory-Lauf. Wird von `scripts/run-offline-tests.js` automatisch eingesammelt
   (Namensmuster `*-test.js`) — **kein** `ci.yml`-Änderung nötig, der Offline-Suite-Job ist
   bereits das blockierende PR-Gate.

**Betroffene Dateien.**
- `scripts/generate-source-architecture-seed.js` (Refactor: `require.main`-Guard + Export)
- `scripts/seed-drift-test.js` (neu)
- `supabase/seeds/20260713_source_architecture_seed.sql` (regeneriert)
- `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` (regeneriert)
- `scripts/generate-landesmodul-seed.js` (Kommentarzeile korrigiert: nannte nach dem P0-2-Fix
  fälschlich nur „berlin-basis/brandenburg-basis" als Ziel der package_paths-Zuordnung)

**Risiken.** Keine Verhaltensänderung am Live-System (Quellenmodus bleibt `on`, aktive
Bund-Pakete unverändert außer der einen zusätzlichen `die-linke-bund`-Zuordnung, die bereits
**live in Production** existiert — der Seed gleicht sich damit an einen bereits bestehenden,
manuell gepatchten Zustand an, führt keinen neuen ein). Rest-Risiko: der **manuelle
Production-Hotfix** (Master-Status §5) sollte nach diesem Fix mit dem Seed abgeglichen werden,
falls ein künftiges vollständiges Re-Seeding der Production-DB ansteht (reiner
Betriebs-Housekeeping-Punkt, keine Code-Änderung nötig, da `on conflict do update` idempotent ist).

**Testnachweis.**
- 3 konsekutive Läufe von `generate-source-architecture-seed.js` und `generate-landesmodul-seed.js`
  → SHA-256-identisch (`9eb10db6…`/`52a4ccb3…`).
- `node scripts/seed-drift-test.js` → 5/5 PASS (Bund-Seed, Landesmodul-Seed, Landesmodul-Rollback
  je gegen `generate()`, plus 2× Determinismus-Check).
- Adversarial verifiziert: künstlicher Hand-Edit an der committeten Seed-Datei → Test schlägt
  korrekt mit `FAIL` fehl (Beweis, dass das Gate echten Drift auch tatsächlich erkennt, nicht nur
  im Erfolgsfall grün ist).
- `scripts/source-architecture-test.js` (u. a. „P1-3: die 6 reparierten Bundeswege tragen ihre
  verifizierte Ersatz-URL", Paket-Zähler) → grün.

### 19.2 — P0-2: Neutralität der Landes-Basispakete

**Ursache.** `berlin-basis`/`brandenburg-basis` sind `is_base: true` — jedes Landtagsprofil
erhält sie zwingend (`profile-packages.resolveProfilePackages`). Ihre `required_classes` (Sprint 9)
enthielten aber unverändert die vollen 15 „Pflichtklassen" inkl. `partei_pilot`/`fraktion_pilot`/
`person_pilot`, und `seeds/landesmodule-quellen.js` mappte JEDE besetzte Kandidatenklasse — auch
diese drei — pauschal auf **dasselbe** Land-Basispaket (`LAND_PACKAGE`, ein Objekt, ein Ziel je
Land, keine Fallunterscheidung). Anders als auf Bundesebene (`packageKeysForSource` trennt Partei
sauber in `die-linke-bund`) gab es auf Landesebene **keine** analoge Trennung — ein struktureller
Nacharbeits-Rest aus Sprint 9, der bei der späteren Mandantenneutralisierung (`40e130f`) nicht
mit-neutralisiert wurde (der Commit entfernte nur den Personen-Hardcode aus dem *aktiven* Code,
nicht die Partei-/Personenbindung im *vorbereiteten* Landesmodul-Seed).

**Lösung.** Das Bund-Muster (Partei-Paket getrennt vom neutralen Basispaket) auf Landesebene
repliziert, nicht neu erfunden:
1. `seeds/packages.js`: `LANDESMODUL_PFLICHTKLASSEN` (15) aufgeteilt in
   `LANDESMODUL_BASIS_PFLICHTKLASSEN` (12, neutral) und `LANDESMODUL_PARTEI_PFLICHTKLASSEN` (3,
   `partei_pilot`/`fraktion_pilot`/`person_pilot`); `LANDESMODUL_PFLICHTKLASSEN` bleibt als Summe
   beider (identischer Inhalt/Reihenfolge) für die bestehende Kandidaten-Berichterstattung
   erhalten. `berlin-basis`/`brandenburg-basis` tragen jetzt nur noch die 12 neutralen Klassen.
2. Zwei neue Pakete `pkg-die-linke-berlin`/`pkg-die-linke-brandenburg` (`is_base: false`,
   `status: "prepared"`, tragen die 3 Pilotklassen) — analog `pkg-die-linke-bund`.
3. `seeds/landesmodule-quellen.js`: `packageIdFor(land, klasse)` routet Pilotklassen
   (`partei_pilot`/`fraktion_pilot`/`person_pilot`) ins neue Partei-Paket, alle anderen Klassen
   unverändert ins Basispaket. Berlins `person_pilot` (Tobias Schulze) landet damit **im
   Partei-Paket**, nicht mehr im Pflicht-Basispaket — bewusst zusammen mit `partei_pilot`/
   `fraktion_pilot` in **einem** Paket statt einem dritten eigenen „Personenpaket", weil die
   Kandidaten-Doku selbst dokumentiert, dass Schulze als Fraktionsvorsitzender stark mit der
   Fraktionsquelle überlappt (`DEDUP_HINWEISE`).
4. **Referenz-Lücke geschlossen** (adversarial selbst gefunden, nicht angefordert, aber
   notwendig, um keine stille Regression zu erzeugen): `profile-packages.js` hatte **keine**
   Landes-Partei-Auflösung — ein echtes Linke-Landtagsmandat in Berlin/Brandenburg hätte nach der
   Neutralisierung sein Parteipaket **gar nicht mehr** referenziert bekommen (nicht nur die
   unerwünschten Fremdmandate wie beabsichtigt, sondern auch das berechtigte eigene). Neue
   `LANDESPARTEIPAKET_BY_BUNDESLAND`-Zuordnung + Erweiterung von `resolveProfilePackages`:
   ein Landtagsprofil mit `party` „Die Linke" in Berlin/Brandenburg erhält weiterhin automatisch
   sein Parteipaket — nur eben über das neue optionale Paket statt über das Pflicht-Basispaket.
5. `admin-report.js`: die „Pflichtklassen"-Anzeige (`View 1: Länder und Pakete`) las bisher nur
   `required_classes` des **einen** Basispakets — nach der Aufteilung wäre sie sonst von 15 auf 12
   „geschrumpft" (Datenverlust in der Anzeige, nicht in der Architektur). Fix: Summe der
   `required_classes` über **alle** Pakete derselben Geografie (Basis + Partei) — Ergebnis bleibt
   korrekt bei 15/15 für Berlin, 15/15 (13 besetzt + 2 bewusst unbesetzt) für Brandenburg.

**Bewusst NICHT verändert (außerhalb des Auftrags):** die politische Entität
`person-tobias-schulze` und ihr Publisher bleiben bestehen (P2-10 aus §5 bleibt ein offener,
niedriger priorisierter Restbefund — „Person als geteilte Entity" ist ein anderes Problem als
„Person im Pflichtpaket", und nur Letzteres war P0-2).

**Betroffene Dateien.**
- `lib/helmut/quellenarchitektur/seeds/packages.js` (Pflichtklassen-Split, 2 neue Paketdefinitionen)
- `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js` (`packageIdFor`-Routing)
- `lib/helmut/quellenarchitektur/profile-packages.js` (`LANDESPARTEIPAKET_BY_BUNDESLAND` + Resolver-Erweiterung)
- `lib/helmut/quellenarchitektur/admin-report.js` (Pflichtklassen-Aggregation über alle Pakete einer Geografie)
- `supabase/seeds/20260713_source_architecture_seed.sql` + `20260717_landesmodul_be_bb_seed.sql` (regeneriert)

**Risiken.** BE/BB sind weiterhin `prepared`/`needs_review`/`manual` — **keine** Aktivierung,
keine Verhaltensänderung am Live-System (Quellenmodus `on`, BE/BB technisch inaktiv wie zuvor).
Einziges Live-Risiko wäre ein **echtes** zukünftiges Berlin/Brandenburg-Linke-Mandat, das ohne
Punkt 4 oben sein Parteipaket verloren hätte — das ist durch die Referenz-Erweiterung
ausgeschlossen (Testnachweis unten). Rollback bleibt unverändert sicher: der Guarded-Rollback im
Landesmodul-Generator löscht `package_paths` über `retrieval_path_id`, unabhängig von der
`package_id` — die Paket-Umroutung berührt die Rollback-Logik nicht.

**Testnachweis.**
- Explizite Duplikat-/Referenz-Integritätsprüfung (Node-Skript, ad hoc): 0 Publisher-ID-, 0
  Publisher-Domain-, 0 RetrievalPath-ID-, 0 Package-ID/Key-, 0 Entity-ID-, 0 `package_paths`-
  Dubletten; 0 verwaiste `package_paths`; 0 ungültige `publisher.entity_id`-FKs — über beide Seeds.
- `scripts/source-architecture-test.js`: neue Checks „P0-2: Landes-Basispakete tragen nur die 12
  NEUTRALEN Pflichtklassen", „P0-2: Landes-Partei-Pakete existieren, NICHT is_base, tragen die 3
  Pilotklassen", „P0-2: die 15 Pflichtklassen bleiben in Summe vollständig", „P0-2: KEIN Abrufweg
  der Linke-Berlin-Quellen in berlin-basis" → alle grün.
- `scripts/landesmodule-kandidaten-test.js`: „Partei-/Fraktions-/Person-Pilot-Wege gehen NICHT
  ins Basispaket, sondern ins Partei-Paket" (4/4 Pilot-Zuordnungen korrekt im Partei-Paket, 0 im
  Basispaket) + „berlin-basis/brandenburg-basis erhalten weiterhin alle NICHT-Pilot-Wege" (15/15)
  → grün.
- `scripts/profile-packages-test.js`: neuer Block „Landes-Partei-Paket" — künstliches
  Berlin-Linke- bzw. Brandenburg-Linke-Testprofil erhält `die-linke-berlin`/`die-linke-brandenburg`
  in `optional`; ein SPD/CDU-Profil im selben Land NICHT; ein Bundestagsprofil mit Linke-Partei
  löst NIEMALS ein Landes-Partei-Paket aus; `berlin-basis` (Pflichtpaket) bleibt ohne
  Partei-Bindung → alle grün.
- `scripts/admin-source-report-test.js`: `berlinLand.pflichtklassen.total === 15` (Bestandstest,
  unverändert grün — bestätigt, dass die Aggregations-Fix in `admin-report.js` keine
  Anzeige-Regression erzeugt).

### 19.3 — P1-5 (im Auftrag „P1-3" genannt): Verifizierte Bundesweg-Reparaturen übernommen

**Ursache.** `seeds/bundeswege-reparaturen.js` hielt für alle 6 defekten Wege bereits real
verifizierte Reparatur-URLs (Sprint 9B, GitHub-Actions-Runner mit offenem Egress, HTTP 200,
byte-genaue Belege) — die Datei selbst dokumentiert das explizit als „WENDET NICHTS AN". Die
Übernahme in den tatsächlich aktiven Katalog (`lib/helmut/sources.js`) war schlicht **nie
ausgeführt** worden — ein reiner Nachvollzugs-Rest, keine technische Blockade.

**Lösung.** Ausschließlich die **bereits dokumentierten** Werte aus
`bundeswege-reparaturen.js` (Felder `reparaturUrl`/`reparaturMethod`) übernommen — keine neue
Recherche, keine neuen Quellen:
- `bundestag`: `rssUrl` → `bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss`
  (echter Direkt-Feed, `crawlMethod` unverändert `rss`).
- `linksfraktion`: `rssUrl` → `dielinkebt.de/presse/pressemitteilungen/feed.rss` (echter
  Direkt-Feed); die laut Reparatur-Diagnose **veraltete** `linksfraktion.de`-Alternative aus
  `rssUrls` entfernt (war explizit als „NICHT verwenden" markiert).
- `bundesregierung`, `die-linke`, `ausschuss-arbeit-soziales`, `dgb`: `rssUrl` → jeweilige
  Google-News-`site:`-Ersatz-URL (Direktfeeds waren real 404/HTML/bot-gesperrt);
  `crawlMethod: "html"` → `"rss"` bei den beiden vormaligen HTML-Scrape-Quellen (Ausschuss, DGB) —
  eine Google-News-RSS-Quelle wird im Legacy-Katalog als `crawlMethod: "rss"` geführt
  (Konvention, bestätigt durch `source-mode-test.js:94`), die Unterscheidung „echter Direkt-Feed
  vs. Google-News-Proxy" trifft die relationale Schicht selbst anhand der URL.
- `catalog.js`: `KNOWN_PATH_HEALTH` — die 6 alten `"broken"`-Einträge entfernt (sie bezogen sich
  auf die **alten**, jetzt ersetzten URLs; als `"broken"` stehen zu lassen wäre nach dem
  URL-Wechsel schlicht falsch gewesen). **Bewusst nicht** auf `"healthy"` gesetzt — der
  Sprint-9B-Test lief außerhalb dieser App, nicht über deren eigene Live-Telemetrie; ohne Eintrag
  greift der bereits vorhandene ehrliche Default `"needs_review"`, identisch zur Behandlung jeder
  anderen bisher nie live bestätigten Quelle. Das ist **keine** Änderung an der (explizit
  ausgeschlossenen) Statusmaschine/Telemetrie-Rückschreibung selbst, sondern eine Korrektur der
  einmaligen statischen Health-Snapshot-Annotation, notwendig, damit die Reparatur überhaupt
  sichtbar wird.
- **Bewusst NICHT übernommen:** der im Audit selbst per WebSearch gefundene echte
  `dgb.de/service/rss`-Feed — das wäre neue Recherche gewesen, ausdrücklich nicht Teil des
  Auftrags. Bleibt dokumentierter Kandidat für eine künftige, eigens verifizierte Runde.

**Betroffene Dateien.**
- `lib/helmut/sources.js` (6 Quellen-URLs aktualisiert, 2× `crawlMethod` html→rss)
- `lib/helmut/quellenarchitektur/catalog.js` (`KNOWN_PATH_HEALTH` bereinigt)
- `supabase/seeds/20260713_source_architecture_seed.sql` (regeneriert)

**Risiken.** Die 4 Google-News-Ersatzwege behalten ihre Herausgeber-Identität (der `site:`-Filter
hält die Original-Domain als Publisher, kein neuer/fragmentierter Herausgeber entstanden —
explizit verifiziert). `bundestag`/`bundesregierung` bleiben `is_critical`+`always_on`
(unverändert, keine Statusmaschinen-Logik berührt). Da `HELMUT_SOURCE_MODE=on` aktiv ist, wird
der nächste reale Crawl-Cron diese 6 Wege erstmals mit den neuen URLs ansteuern — reguläres,
erwartetes Verhalten, kein zusätzliches operatives Risiko ggü. dem Status quo (die Wege waren
zuvor mangels funktionierender URL ohnehin ertraglos).

**Testnachweis.**
- `scripts/source-architecture-test.js`: „P1-3: keine defekten Direkt-Feeds mehr" (0 `broken`),
  „reparierte Pflichtquellen … `needs_review`, weiter kritisch", „die 6 reparierten Bundeswege
  tragen ihre verifizierte Ersatz-URL" (byte-exakter URL-Vergleich gegen alle 6), „Herausgeber-
  Identität bei googlenews-Ersatz erhalten" (Publisher-IDs unverändert `publisher-bundesregierung.de`
  / `publisher-die-linke.de` / `publisher-dgb.de` / `publisher-bundestag.de`) → alle grün.
- `scripts/quality-watchdog-test.js`: „reparierte Pflichtquellen … nicht mehr defekt, sondern
  'pruefen'", „keine Pflichtquelle mehr technicalHealth='defekt'" → grün.
- `scripts/admin-source-report-test.js`: „keine defekten Abrufwege mehr", „reparierte
  Pflichtquelle (bundestag) → status needs_review, nicht mehr broken", „keine 'hoch'-Abrufweg-
  Probleme mehr" → grün.
- `scripts/landesmodule-kandidaten-test.js` (Bestandstests zu `bundeswege-reparaturen.js` selbst,
  unverändert): „6 defekte Bundeswege dokumentiert", „alle 6 repariert, 0 reparatur_url_falsch,
  0 bot_gesperrt, 0 dauerhaft_defekt", „ALLE 4 kritischen Wege gelöst" → weiterhin grün (bestätigt,
  dass die Dokumentationsdatei selbst unangetastet blieb, wie beabsichtigt).

### 19.4 — Regressionsnachweis (gesamt)

- **Determinismus:** beide Generatoren je 3× ausgeführt → SHA-256-identisch.
- **Seed-Drift-Gate:** `seed-drift-test.js` neu, 5/5 PASS, adversarial gegen echten Drift geprüft
  (Fehlererkennung bestätigt).
- **Referentielle Integrität:** 0 Dubletten (Publisher-ID/-Domain, RetrievalPath-ID, Package-ID/
  Key, Entity-ID, `package_paths`), 0 verwaiste Referenzen, 0 ungültige FKs — über Bund- und
  Landesmodul-Seed gemeinsam geprüft.
- **Rollback:** Landesmodul-Rollback-SQL unverändert byte-identisch zu vorher (löscht über
  `retrieval_path_id`, unabhängig von `package_id` — die P0-2-Umroutung berührt ihn nicht);
  Bund-seitiger Schema-Rollback (`20260713_source_architecture_rollback.sql`) bleibt tabellenweit
  und deckt die 2 neuen Paketzeilen automatisch mit ab (dieselbe `source_packages`-Tabelle).
- **Offline-Suite:** **141/141 grün** (`node scripts/run-offline-tests.js`, inkl. Syntax-Check
  aller JS-Dateien), 4 Suiten mit erwarteten, direkten Konsequenzen der Fixes aktualisiert
  (nicht großzügig entschärft, sondern präzise auf den neuen korrekten Zustand umgestellt):
  `admin-source-report-test.js`, `landesmodule-kandidaten-test.js`, `quality-watchdog-test.js`,
  `source-architecture-test.js`; 1 neuer Testblock in `profile-packages-test.js` für die
  Referenz-Lücke aus 19.2 Punkt 4.
- **Scope-Treue:** `git diff --stat` zeigt ausschließlich die 15 erwarteten Dateien (6
  Produktionsmodule, 5 Testdateien, 2 regenerierte Seeds, 2 Generator-Dateien) + 1 neue Testdatei
  — keine Änderungen an `path_expected_*`, `political_level`, der Statusmaschine, dem
  Telemetrie-Rückschreiben, der rbb24-Aufteilung, der Google-News-Architektur oder neuen
  Fach-/Themenpaketen.

---

*Erstellt im Rahmen des finalen Architektur-Gates. Live-HTTP-Verifikation war im Audit-Sandkasten
policy-geblockt; der Link-Audit stützt sich auf den verifizierten Sprint-9B-Runner-Test,
WebSearch-Korroboration (2026-07) und die Repo-Health-Snapshots. Alle Datei:Zeile-Belege gegen den
Stand des Prüf-Branches. §19 (Behebungs-Sprint) ergänzt am selben Tag, gleiche Sitzung.*
