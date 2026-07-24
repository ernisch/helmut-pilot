# 29 — Bundes-Fachpaket „landwirtschaft-ernaehrung-und-laendliche-raeume-bund" (PREPARED)

**Stand:** 2026-07-24 · **Status: PREPARED, vollständig INAKTIV, NICHT auf DB angewendet** ·
**Branch:** `claude/bund-landwirtschaft-validierung-dzrj54`

Fachliche Validierung + vollständig inaktive technische Vorbereitung des Bundesquellenpakets für
Agrar-, Ernährungs- und Ländliche-Räume-Politik (BMLEH-Ressort). Kein Deployment, kein Merge, kein
PR, keine SQL-Anwendung, keine Migration, kein Profil-Mapping, kein aktiver Crawl-Plan.

Artefakte:
- `lib/helmut/quellenarchitektur/seeds/agrar-bund-quellen.js` (Datenmodell)
- `scripts/generate-agrar-bund-seed.js` (deterministischer Generator)
- `supabase/seeds/20260724_agrar_bund_seed.sql` (+ `_rollback.sql`, `_manifest.json`)
- `scripts/agrar-bund-seed-test.js` (58 Prüfungen, grün; in der Offline-Suite 141/141)

---

## 1. Bestätigter kanonischer Paketname

`landwirtschaft-ernaehrung-und-laendliche-raeume-bund` — **eindeutig bestätigt**. Kein anderer
verbindlicher Name existiert im Repository (kein Treffer in Seeds/Code/Docs). Die verbindliche
Paketlandkarte ist `lib/helmut/quellenarchitektur/seeds/packages.js` (`PACKAGE_DEFINITIONS`); dort
gibt es keinen kollidierenden oder abweichenden Schlüssel. Kein zweites Paket, keine Umbenennung,
keine parallele Struktur.

Paket-ID: `pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund` ·
`status=prepared` · `is_base=false` · `political_level=bund` · `geography_id=geo-bund` ·
`required_classes={}` (kein Landesmodul).

**Architektur-Entscheidung (Selbstständigkeit statt Basis-Seed-Änderung):** Das Paket wird
**NICHT** in `packages.js`/den Basis-Seed eingetragen, sondern vollständig im dedizierten
PREPARED-Seed definiert. Grund: der committete Basis-Seed `20260713_source_architecture_seed.sql`
ist **nicht byte-stabil reproduzierbar** (enthält einen handergänzten Mandantenneutralisierungs-
Kommentar + Reihenfolge-Drift gegenüber dem Generator). Eine Neugenerierung hätte aktive Basis-Daten
verändert (verboten, Auftrag §4). Der dedizierte, additive Seed ist der sichere Weg (0 Änderung am
Basis-Seed, `source-architecture-test.js` bleibt bei 6 Paketen grün). Promotion in die Code-
Paketlandkarte ist ein dokumentierter Aktivierungsschritt (§Risiken).

---

## 2. Zuerst gelesene Architekturdateien (verbindlicher Start)

`00-master-status.md` · `02-zielarchitektur.md` · `03-datenmodell-und-migration.md` ·
`15-prepared-eintragung-freigabeanfrage.md` (Prepared-Muster) · `supabase/migrations/20260713_source_architecture.sql`
(Schema/CHECKs) · `supabase/seeds/20260717_landesmodul_be_bb_seed(.rollback).sql` (Prepared-Vorlage) ·
`scripts/generate-landesmodul-seed.js` + `scripts/landesmodul-seed-test.js` (Generator-/Testvorlage) ·
`lib/helmut/quellenarchitektur/seeds/{packages,publishers,entities}.js` · `scripts/run-offline-tests.js`.
**Kein Repository-Vollscan** — nur gezielte Suchen nach Institutionen/IDs/Domains/Paketzuordnungen.

---

## 3. Aktuelle Ressort- und Ausschussstruktur (amtlich verifiziert)

| Merkmal | Aktueller Stand (Primärquelle) |
|---|---|
| Ministerium | **Bundesministerium für Landwirtschaft, Ernährung und Heimat (BMLEH)** — bmleh.de |
| Minister | **Alois Rainer (CSU)**, seit Mai 2025 (bundesregierung.de, bmleh.de) |
| Ressortzuschnitt | Landwirtschaft, Ernährung, Forst, Fischerei, **ländliche Räume**, **Heimat** |
| Bundestagsausschuss | **Ausschuss für Landwirtschaft, Ernährung und Heimat** (21. WP), 30 Mitglieder, Vors. Hermann Färber (CDU/CSU) — bundestag.de/landwirtschaft |
| Bundesratsausschuss | **Ausschuss für Agrarpolitik und Verbraucherschutz** — bundesrat.de/DE/bundesrat/ausschuesse/av/av.html |

Verifiziert ausschließlich über amtliche Primärquellen (bmleh.de, bundesregierung.de, bundestag.de,
bundesrat.de, dip.bundestag.de, dserver.bundestag.de). Keine Wikipedia-/Medienangabe als
institutionelle Wahrheit.

---

## 4. Historische Namen, Aliase, Domains

| Zeitraum | Name | Kürzel | Domain |
|---|---|---|---|
| 2013–2025 | Bundesministerium für Ernährung und Landwirtschaft | BMEL | bmel.de |
| **seit Mai 2025** | **Bundesministerium für Landwirtschaft, Ernährung und Heimat** | **BMLEH** | **bmleh.de** |

Modellierung (Auftrag §7): **EINE** Ministeriums-Entität `ministry-bmleh` mit aktuellem Namen; die
historische Bezeichnung **BMEL** und die alte Domain sind **nur Aliase** (`aliases = {BMLEH, BMEL,
Bundesministerium für Ernährung und Landwirtschaft}`). **Keine** zweite Ministeriums-Entität,
**keine** Domain-Dublette. `bmel.de → bmleh.de`-Weiterleitung ist fachlich plausibel (alle amtlichen
Referenzen nutzen den neuen Namen + die neue Domain), **technisch nicht byte-verifiziert** (Bot-Schutz
403, §11). Hinweis: `client.js` (`LAGE_INSTITUTION_ABBR`) trägt noch die alte Abkürzung
„BMEL" — **bestehende aktive Anzeige-Logik, bewusst nicht geändert** (fachfremd; Aktivierungs-Nachtrag).

---

## 5. Korrigierte Deep-Research-Aussagen

| # | Research-Aussage | Amtliche Korrektur | Quelle |
|---|---|---|---|
| 8.1 | Tierschutzbericht „Status unklar", „alle 2 Jahre", „2023 → 2025 veröffentlicht" | **14. Tierschutzbericht, BT-Drs. 20/9860 vom 14.12.2023**, Zeitraum 2019–2022, **4-Jahres-Zyklus** (§16e TierSchG). Nächster ~2027. Stabile Übersichtsseite existiert. | dserver.bundestag.de, bundestag.de/hib, bmleh.de |
| 8.2 | GAP-Jahresleistungsbericht „in Erstellung"/„angekündigt" | **Regelmäßiger jährlicher Bericht**; FY2024 am **28.02.2025** bei der EU-Kommission eingereicht + öffentlich (~5 Mrd €). FY2025 planmäßig ~Feb 2026. **Über den GAP-BMLEH-Weg + GAP-Strategieplan-Seite abgedeckt.** | bmleh.de (GAP-Strategieplan/Bürgerinformation) |
| 8.3 | ländliche Räume/GAK zu schwach | **GAK-Rahmenplan 2026–2029 beschlossen (PLANAK, 10.12.2025)**; **1,067 Mrd € Bundesmittel 2026** (davon 160 Mio KTF). Eigener Signalwert ggü. GAP → **eigener Weg**. | bmleh.de (PM 121/2025, GAK-Seite), publikationen-bundesregierung.de |
| 8.4 | Tierhaltungskennzeichnung „Verschiebung auf März 2026" | Gesetz seit 2023 in Kraft; **Verwendungspflicht am 15.01.2026 auf 1. Januar 2027 verschoben** (Bundestag). Der März-2026-Stichtag ist überholt. | bundestag.de/textarchiv (kw03-2026) |
| 9 | „4 neue Publisher (BMLEH, BLE, BVL, Destatis)" | **Destatis existiert bereits** (`publisher-destatis.de`/`statoffice-destatis`) → wiederverwenden. **3 neue Publisher** (BMLEH, BLE, BVL). | Repo-Bestand |
| 2.4 | BZL/BZfE/DVS ggf. eigenständig | **Organisationseinheiten der BLE** (ble.de/DE/BZL, /BZfE) → **kein** eigener Herausgeber/Weg. | ble.de |

---

## 6. Kompetenz- und Zuständigkeitskarte (Institutionen sauber getrennt)

| Institution | Typ | Modellierung im Paket |
|---|---|---|
| BMLEH | Ministerium | **neue Entität** `ministry-bmleh` + **neuer Herausgeber** `publisher-bmleh.de` |
| BLE | Bundesoberbehörde | **neue Entität** `authority-ble` + **neuer Herausgeber** `publisher-ble.de` |
| BVL | Bundesoberbehörde | **neue Entität** `authority-bvl` + **neuer Herausgeber** `publisher-bvl.bund.de` |
| Statistisches Bundesamt (Destatis) | Statistikamt | **wiederverwendet** (`statoffice-destatis` / `publisher-destatis.de`) + 1 neuer Agrar-Weg |
| Deutscher Bundestag / Ausschuss | Parlament | **wiederverwendet** (`rp-dip`, `rp-committee-landwirtschaft`) |
| Bundesrat | Parlament | **wiederverwendet** über DIP (gemeinsames BT+BR-Dokumentationssystem) — kein neuer Weg |
| BZL / BZfE / DVS | Organisationseinheiten der BLE | **kein** eigener Publisher/Weg (über BLE abgedeckt) |
| Thünen-Institut | Bundesforschungsinstitut | **Future Target** (nicht geseedet); Waldzustandserhebung via BMLEH-Veröffentlichungsweg |
| BfR | Bundesinstitut | **Future Target** (§14) |
| JKI / FLI / MRI | Bundesforschungsinstitute | **ausgeschlossen** (überwiegend wissenschaftlich-operativ, §15) |
| Personen (z. B. Minister) | — | **nie** in stabilen IDs modelliert (Auftrag §6) |

---

## 7. Tatsächliche Publisher-/Entitäten-/Wege-Rechnung

- **Neue Publisher: 3** — `publisher-bmleh.de`, `publisher-ble.de`, `publisher-bvl.bund.de`.
- **Wiederverwendete Publisher: ≥3** — `publisher-destatis.de`, `publisher-dip.bundestag.de`,
  `aggregator-google-news` (über `rp-committee-landwirtschaft`).
- **Neue Entitäten: 3** — `ministry-bmleh`, `authority-ble`, `authority-bvl`.
- **Wiederverwendete Entitäten** — `statoffice-destatis`, `parliament-bundestag`,
  `committee-bt-landwirtschaft`, `parliament-bundesrat` (via DIP).
- **Neue Abrufwege: 7** (alle `needs_review` + `manual`) · **Wiederverwendete Abrufwege: 2**
  (`rp-dip`, `rp-committee-landwirtschaft`, nur additiv verknüpft) · **Wege gesamt im Paket: 9**.

---

## 8. Abdeckungsmatrix (9 Wege)

| # | Weg | Herausgeber | Tier | Zweck |
|---|---|---|---|---|
| 1 | `rp-dip` *(reuse)* | Bundestag (DIP-API) | 1 | Parlamentarische Vorgänge BT **+ BR**: Gesetzentwürfe, Anträge, Anfragen/Antworten, Unterrichtungen, Berichte, Ausschussvorgänge |
| 2 | `rp-committee-landwirtschaft` *(reuse)* | Google News | 1 | Agrar-/Ausschuss-Politiksignal (Bestand bund-basis) |
| 3 | `rp-agrar-bmleh-gesetzgebung` | BMLEH | 1 | Referenten-/Gesetzentwürfe, Verordnungen, Kabinettsvorhaben |
| 4 | `rp-agrar-bmleh-veroeffentlichungen` | BMLEH | 1 | Pressemitteilungen, Strategien, Berichte, Tierschutz, Tierhaltung, Ernährung, **Waldzustand** |
| 5 | `rp-agrar-bmleh-gap` | BMLEH | 1 | **GAP** / Agrarförderung / Direktzahlungen / Öko-Regelungen / GAP-Leistungsbericht |
| 6 | `rp-agrar-bmleh-gak-laendliche-raeume` | BMLEH | 1 | **GAK / ländliche Räume** / Agrarstruktur / Küstenschutz / Dorfentwicklung |
| 7 | `rp-agrar-destatis-agrarstatistik` | Destatis *(reuse pub.)* | 1 | Agrarstruktur, Betriebe, Tierbestände, Flächennutzung, Ökolandbau, Forst, Fischerei |
| 8 | `rp-agrar-ble-publikationen` | BLE | 2 | Stat. Jahrbuch, Versorgungs-/Marktberichte, Ernte, Ökolandbau, Förderung |
| 9 | `rp-agrar-bvl-monitoring` | BVL | 2 | Lebensmittel-, Zoonosen-, Antibiotika-Monitoring, Rückstände |

**Tier-Verteilung: Tier 1 = 7 · Tier 2 = 2 · Tier 3 = 0** (im Paket). Ländliche Räume sind über
Weg 6 (dediziert), Weg 7 (Statistik) und Weg 8 (BLE) **sichtbar und substanziell** vertreten.

### GAP vs. GAK — bewusst getrennt (keine Scheindublette)
- **GAP** (Weg 5): EU-Agrarpolitik, Direktzahlungen, GAP-Strategieplan/-Leistungsbericht (~5 Mrd €/Jahr, EU-gerahmt).
- **GAK** (Weg 6): nationale Bund-Länder-Förderung, Rahmenplan 2026–2029, 1,067 Mrd € Bundesmittel 2026, ländliche Räume.
Unterschiedliche Rechtsgrundlage, Finanzierung und politischer Signalwert → zwei distinkte Wege.

### Bewichtsstände (klassifiziert, Auftrag §16)
| Bericht | Klasse | Abgedeckt über |
|---|---|---|
| Agrarpolitischer Bericht | regelmäßig (4-jährl.), historisch letzter 2023 | BMLEH-Veröffentlichungen + DIP |
| Ernährungsreport | veröffentlicht, jährlich | BMLEH-Veröffentlichungen |
| Waldzustandserhebung 2025 | veröffentlicht (2026), jährlich | BMLEH-Veröffentlichungen (Thünen-Produkt) |
| Erntebericht | veröffentlicht, jährlich | BMLEH-Veröffentlichungen + Destatis |
| Statistisches Jahrbuch (BLE) | veröffentlicht, jährlich | BLE-Publikationen |
| Öko-Barometer | veröffentlicht, unregelmäßig | BMLEH-Veröffentlichungen |
| Tierschutzbericht | veröffentlicht (14., 2023), **4-jährl.** | BMLEH-Veröffentlichungen (Tierschutz-Übersicht) + DIP |
| GAP-Jahresleistungsbericht | eingereicht (FY2024 am 28.02.2025), jährlich | BMLEH-GAP-Weg |
| GAK-Rahmenplan 2026–2029 | veröffentlicht/beschlossen 10.12.2025 | BMLEH-GAK-Weg |
| Zoonosen-Trendbericht / Antibiotika-Monitoring | veröffentlicht/aktiv, jährl./halbj. | BVL-Monitoring |
| Nitratbericht | unregelmäßig, **primär Umwelt-Paket** | Grenzfall (§10) |
| Bericht Lebensmittelverschwendung / Evaluationsbericht Ernährungsstrategie | angekündigt/veröffentlicht | BMLEH-Veröffentlichungen (Future) |

Keine einzelne Jahres-PDF ist Hauptweg; alle Wege zielen auf stabile Übersichts-/Suchsemantik.

---

## 9. Wiederverwendung (keine Neuanlage bei fachlich-technischer Identität)

- **Destatis**: Herausgeber `publisher-destatis.de` + Entität `statoffice-destatis` **wiederverwendet**;
  nur **ein** neuer, gebündelter Agrar-Statistik-Weg auf dem Bestands-Herausgeber. Keine Destatis-Dublette.
- **DIP**: `rp-dip` (API, `healthy`, `always_on`) **wiederverwendet** — deckt Bundestag **und** Bundesrat
  ab. Kein neuer Agrar-Bundesratsweg (Auftrag §10).
- **Bundestagsausschuss**: `rp-committee-landwirtschaft` (Bestand bund-basis) **wiederverwendet** für
  ergänzendes Agrar-/Ausschusssignal.
- Reine additive `package_paths`-Verknüpfung; **kein** Insert/Update auf den Bestandswegen. Da das Paket
  `prepared` ist, erhöht es **keine** Referenzzählung (`computePathRefcounts` filtert `status='active'`,
  model.js:215) → **keine** Aktivierung, **keine** Änderung des aktiven Crawl-Plans.

---

## 10. Fachliche Paketgrenzen (Grenzfälle dokumentiert)

| Thema | Zuordnung |
|---|---|
| Agrarpolitik, Landwirtschaft, Ernährungspolitik, ländliche Räume, GAP/GAK | **hier** |
| Allgemeine Klima-/Biodiversitäts-/Gewässer-/Naturschutzpolitik | **Umwelt** (`energie-klima-und-umwelt-bund`); landwirtschaftliche Umsetzung ergänzend hier |
| Nitrat-/Düngerecht | landw. Umsetzung hier; Gewässerschutz-Grundsatz Umwelt |
| Agrarhaushalt, Agrardiesel/Steuerrecht | **Haushalt/Finanzen** |
| Medizinische Ernährung, allg. Gesundheit | **Gesundheit** |
| Allgemeines Verbraucherrecht | **Recht/Verbraucherschutz**; **operative** Lebensmittelsicherheit (BVL-Monitoring) hier beobachtet |
| Tierhaltung/-schutz mit landw. Schwerpunkt | **hier**; allgemeiner Tierschutz nicht dupliziert |
| Grundlagenforschung | **Wissenschaft**; angewandte Ressortforschung (Thünen) Future Target hier |
| Ländliches Bauen/Raumordnung | **Wohnen/Bauen** — nicht dupliziert |
| EU-Agrarpolitik (GAP) | **hier**; allg. Außen-/Handelspolitik nicht |

**Bewusst ausgeschlossen (operative Quellenmasse):** einzelne Lebensmittelwarnungen/Rückrufe,
einzelne Tierseuchenausbrüche, tagesaktuelle Marktpreise, Fischerei-Monatsberichte, lokale
Förderprojekte, allgemeine Verbands-/Medien-/Forschungsnews.

---

## 11. Technische Quellenprüfung (§19) — ehrliche Trennung

**Egress in dieser Umgebung:** Roh-`curl` ist durch die Organisations-Egress-Policy gesperrt
(Proxy „CONNECT 403"); `WebFetch` erreicht die Zielserver, erhält von den deutschen Behördenseiten
(BMLEH, BLE, BVL, Destatis, Thünen, bundestag/bundesrat) aber durchgehend **HTTP 403 (Bot-Schutz)**.
DIP wird vom App-Crawler server-seitig (API-Key) bereits erfolgreich abgerufen (`rp-dip` = `healthy`).

| Klasse | Quellen |
|---|---|
| **byte-genau technisch bestätigt** | **keine** (Egress/Bot-Schutz) — außer `rp-dip`, das produktiv bereits `healthy` crawlt |
| **amtlich/fachlich bestätigt** (offizielle Suchtreffer + Primärquellen-Metadaten) | alle 9 Zielsemantiken: bmleh.de (GAP/GAK/Gesetze/Presse/Tierschutz/Wald), ble.de, bvl.bund.de, destatis.de (Agrar), bundestag.de/landwirtschaft, bundesrat.de/…/av, DIP |
| **vor Aktivierung zwingend byte-genau zu prüfen** | **alle** — besonders BMLEH (Bot-Schutz 403 bestätigt), alle `.bund.de`/destatis/thuenen; RSS/API-Verfügbarkeit, Redirect `bmel.de→bmleh.de`, JavaScript-Abhängigkeit |

**Methodenwahl** = `googlenews_search` mit `site:`-Filter — das etablierte, bot-sichere Hausmuster
(134 von 144 Bestandswegen nutzen es, u. a. `site:destatis.de`, `site:bundestag.de`). Das ist der
produktionserprobte Ersatzweg für bot-gesperrte Behördenseiten. Keine URL, kein RSS, keine API erfunden.

---

## 12. Dublettenmatrix (semantischer Check, Auftrag §22)

| Paar | Ergebnis |
|---|---|
| BMLEH ↔ Bundesregierung | getrennt: Ressort vs. Gesamtkabinett; DIP/committee ≠ BMLEH-Wege |
| BMLEH ↔ BLE | getrennt: Ministerium (Politik) vs. Bundesoberbehörde (Vollzug/Publikationen) |
| BMLEH ↔ Thünen | keine Dublette: Thünen nicht geseedet (Future) |
| BMLEH ↔ GAP ↔ GAK | drei distinkte Wege, unterschiedlicher Signalwert |
| BLE ↔ BZL/BZfE/DVS | keine Scheinpublisher: Organisationseinheiten über BLE abgedeckt |
| BLE ↔ Destatis | getrennt: BLE-Fachpublikationen vs. amtliche Agrarstatistik |
| BVL ↔ BfR | keine Überfragmentierung: nur BVL (Tier 2), BfR = Future Target |
| BVL ↔ Einzelwarnungen | ausgeschlossen (operativ) |
| DIP ↔ Bundestagsausschuss | DIP = Hauptweg, Ausschuss = ergänzendes Signal |
| DIP ↔ Bundesrat | Bundesrat über DIP abgedeckt, kein Parallelweg |
| Agrar ↔ Umwelt/Gesundheit/Wirtschaft/Haushalt/Verbraucherschutz | Grenzen §10 |
| ID-/Slug-/Domain-/URL-Kollision | **0** (Test §12, gegen Basis- + BE/BB-Seed geprüft) |

---

## 13. Integrationsprotokoll (was eingefügt wird — additiv, `ON CONFLICT DO NOTHING`)

| Tabelle | Δ | Details |
|---|---:|---|
| `political_entities` | +3 | ministry-bmleh, authority-ble, authority-bvl (BMEL nur Alias) |
| `source_packages` | +1 | pkg-landwirtschaft-…-bund, `prepared`, `is_base=false` |
| `publishers` | +3 | bmleh.de, ble.de, bvl.bund.de (Destatis NICHT neu) |
| `retrieval_paths` | +7 | alle `needs_review` + `manual` (INAKTIV) |
| `package_paths` | +9 | 7 neu + 2 wiederverwendet (rp-dip, rp-committee-landwirtschaft) |
| `path_expected_levels` | +7 | alle `bund` |
| `path_expected_geographies` | +7 | alle `geo-bund` |
| `path_expected_topics` | +30 | Fachthemen-Kennzeichnung |

**Voraussetzung:** `20260713_source_architecture.sql` + Basis-Seed angewendet (FK-Ziele
`geo-bund`, `publisher-destatis.de`, `rp-dip`, `rp-committee-landwirtschaft` vorhanden).
**Rollback:** `20260724_agrar_bund_seed_rollback.sql` — guarded (Herausgeber/Entitäten/Paket nur
löschen, wenn nichts mehr referenziert; Bestandswege/Destatis/bund-basis unangetastet).

---

## 14. Verbleibende Risiken vor Aktivierung

1. **Bot-Schutz/URL-Verifikation**: keine Ziel-URL byte-genau bestätigt (Egress-Policy + 403). Vor
   Aktivierung server-seitig (App-Crawler, realer UA) prüfen: HTTP-Status, Redirect `bmel.de→bmleh.de`,
   Content-Type, RSS/API, JS-Abhängigkeit, Volltext.
2. **Promotion in die Code-Paketlandkarte**: `packages.js`/Resolver kennen das Paket noch nicht (bewusst,
   §1). Aktivierung erfordert Eintrag in `PACKAGE_DEFINITIONS` **und** Neugenerierung des Basis-Seeds —
   dabei den handergänzten Mandantenneutralisierungs-Kommentar erhalten.
3. **Ausschuss-Entität veraltet**: `committee-bt-landwirtschaft` trägt im Basis-Seed noch den
   historischen Namen „Ausschuss für Ernährung und Landwirtschaft"; aktuell „…Landwirtschaft, Ernährung
   und Heimat". Namens-/Alias-Aktualisierung = separater, freigabepflichtiger Schritt (Bestandsdaten).
4. **`client.js` BMEL-Abkürzung**: Anzeige-Helfer nennt noch „BMEL" — bewusst nicht geändert.
5. **Trust-Einstufung**: BMLEH/BLE/BVL mit `trust='hoch'` (konsistent mit Bestands-Bundesbehörden);
   ggf. bis zur Byte-Verifikation auf `unbekannt` zurückstufen (triviale Änderung).
6. **Google-News-Ratelimiting** (bekanntes Bestandsrisiko B1) betrifft alle googlenews_search-Wege.

---

## 15. Freigabefrage

**Gibst du „Go" für die spätere, freigabepflichtige Eintragung von 3 Entitäten, 3 Herausgebern,
1 Paket (`prepared`), 7 Abrufwegen (`needs_review`/`manual`, INAKTIV) und 9 Paketzuordnungen
(inkl. additiver Wiederverwendung von DIP/Ausschuss/Destatis) gemäß `20260724_agrar_bund_seed.sql` —
ohne Aktivierung, ohne Profil-Mapping, ohne Basis-Seed-Änderung, mit guarded Rollback?**
Bis dahin bleibt alles rein im Repository (kein DB-Write, kein PR, kein Deployment).
