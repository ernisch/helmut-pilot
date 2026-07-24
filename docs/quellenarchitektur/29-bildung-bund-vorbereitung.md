# Quellenpaket `bildung-bund` — technische Validierung & inaktive Vorbereitung

> **Status: `prepared` / vollständig INAKTIV.** Kein Deployment, kein Merge, keine
> Aktivierung. Alle neuen Abrufwege: `status=needs_review`, `activation_mode=manual`.
> Anwenden auf Production ist ein eigener, ausdrücklich freigabepflichtiger Schritt.
> Sprint-Datum: 2026-07-24.

Dieses Dokument ist die fachlich-technische Paketdokumentation, die Kompetenz-/
Zuständigkeitskarte, das Integrationsprotokoll **und** der Abschlussbericht. Das
kompakte Manifest für Folge-Threads liegt separat in
`docs/quellenarchitektur/bildung-bund-manifest.md`.

---

## 0. Zuerst gelesene Architekturdateien (Wiederverwendungsbasis)

Reihenfolge gemäß Auftrag (kein Vollscan):

1. `docs/quellenarchitektur/00-master-status.md` — Gesamtstatus, Cutover ausgeführt
   (relationale DB = aktive Quellenwahrheit), BE/BB als `prepared`-Präzedenz.
2. `lib/helmut/quellenarchitektur/model.js` — Enums (PATH_STATUS, PACKAGE_STATUS,
   ACTIVATION_MODES, RETRIEVAL_METHODS), Referenzzählung, Inaktivitäts-Semantik.
3. `lib/helmut/quellenarchitektur/seeds/{packages,publishers,entities}.js` — bestehende
   Pakete/Herausgeber/Entitäten.
4. `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js` +
   `scripts/generate-landesmodul-seed.js` + `supabase/seeds/20260717_landesmodul_be_bb_seed.sql`
   — **Referenzmuster** für ein `prepared`/inaktives Paket (needs_review + manual, guarded Rollback).
5. `supabase/migrations/20260713_source_architecture.sql` — Schema + CHECK-Constraints.
6. `supabase/seeds/20260713_source_architecture_seed.sql` — **Ist-Bestand** (Publisher/
   Entitäten/Wege), gezielt nach Bildungsinstitutionen durchsucht.

Danach gezielte Suchen (kein Vollscan): `destatis|bmbf|bildung|kmk|bibb|arbeitsagentur|
bundesrat|dipf|iqb|dzhw|oecd|berufsbild` im Basis-Seed → direkte Wiederverwendungstreffer
(siehe §6). WebSearch zur Ressort-Verifikation 2026 (BMBFSFJ/BMFTR/KMK-Reform/Bildungsbericht).

---

## 1. Kompetenz- und Zuständigkeitskarte (föderale Asymmetrie)

Bildung ist überwiegend **Ländersache** (Art. 30, 70 GG). Der Bund wirkt über
Finanzierung, Förderprogramme, Koordinierung, Monitoring. Das Paket bildet diese
Asymmetrie ab und suggeriert **keine** Bundes-Steuerungshoheit über das Schulsystem.

| Kompetenzebene | Bedeutung | Quellen im Paket (Kennzeichnung `path_expected_levels`) |
|---|---|---|
| **Bund** (eigene Gesetzgebung) | berufliche Bildung (Art. 74 I Nr. 11), Hochschulzulassung/-abschlüsse (Nr. 33), BAföG, SGB-III-Weiterbildung | BMBFSFJ, BIBB, Destatis (Bildung), BA (Ausbildungsmarkt) → `level=bund` |
| **Bund-Länder** (Art. 91b GG) | Digitalpakt, Startchancen, Kita-Qualität, Ganztagsförderung (Rechtsanspruch ab 2026) | Bundesrat (zustimmungspflichtig), Nationaler Bildungsbericht → `level=bund`+`land` |
| **Länderkoordination** | Bildungsstandards, gegenseitige Anerkennung, Schulstruktur | KMK/Bildungs-MK, SWK, IQB → `level=land` (bewusst **nicht** `bund`) |
| **wissenschaftliches Monitoring** | indikatorengestützte Beobachtung | Bildungsbericht, DZHW, IQB |
| **international** | Vergleichsmaßstab | OECD → `level=international` |
| **ausschließl. Länder** (nicht Bundespaket) | Lehrpläne, Lehrkräfte, Schulstatistik-Erhebung, Kitas | *bewusste Lücke* — s. §7 |

**KMK ist als `other_institution` (Länderkoordination, `level=land`) modelliert, NICHT
als Bundesbehörde.**

---

## 2. Ressortstruktur 2026 — verifizierte Fakten & Aliasstrategie

WebSearch-verifiziert (2026-07; byte-genaue HTTP-Prüfung s. §8):

| Aktueller Name | Kürzel | Domain | Historie / Alias | Repository-ID | Rolle im Paket |
|---|---|---|---|---|---|
| Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend | **BMBFSFJ** | `bmbfsfj.bund.de` | trägt seit 2025 die **Bildungs**aufgaben; entstanden aus dem früheren **BMFSFJ** (Familie) + Bildungsteil des früheren **BMBF** | **NEU** `ministry-bmbfsfj` (Alias `BMBFSFJ`) | Tier 1, Kernquelle |
| Bundesministerium für Forschung, Technologie und Raumfahrt | **BMFTR** | `bmftr.bund.de` | = **umbenanntes BMBF** ("Aus BMBF wird BMFTR", 05/2025) | *nicht angelegt* | **ausgeschlossen** → `wissenschaft-forschung-bund` |
| Kultusministerkonferenz / **Bildungsministerkonferenz** | KMK / Bildungs-MK | `kmk.org` | KMK-Reform 01/2025: eigenständige Bildungs-MK unter KMK-Dach | **NEU** `institution-kmk` (Aliase: KMK, Bildungsministerkonferenz, Bildungs-MK) | Tier 1, Länderkoordination |

### Abgrenzung BMBFSFJ ↔ BMFTR (verbindlich)
- **BMBFSFJ = Bildung** (schulische/berufliche/frühkindliche Bildung, BAföG, Ganztag,
  Bundesprogramme, Berufsbildungsbericht). → gehört in `bildung-bund`.
- **BMFTR = Forschung/Technologie/Raumfahrt** (Wissenschaftssystem, Forschungsförderung,
  Hochschul**forschung**). → gehört in `wissenschaft-forschung-bund`, **nicht** hierher.
- Graubereich Hochschule: Studien**zugang/-verlauf/-abbruch/soziale Lage** (Studierende)
  ist bildungsrelevant → DZHW-Weg eng auf diese Aspekte gefiltert. Hochschul**organisation**
  und Wissenschaftssystem bleiben dem Wissenschaftspaket vorbehalten.

### Historische Ministeriums-Dublette bewusst vermieden
`ministry-bmfsfj` (historisches Familienministerium, `bmfsfj.de`) bleibt **unverändert**
bestehen. `ministry-bmbfsfj` ist eine **eigene** Entität (neuer Name, neue Domain
`bmbfsfj.bund.de`, neuer Bildungs-Zuständigkeitszuschnitt) — **kein Rename, kein ID-Bruch,
kein Update bestehender Daten**. Beziehung ist hier dokumentiert, nicht in der DB erzwungen.
(Ein additiver, idempotenter `ON CONFLICT DO NOTHING`-Seed kann eine bestehende Zeile
ohnehin nicht umschreiben — das schützt vor ungewollten Updates.)

---

## 3. Endgültiger Kernbestand (12 Wege, Zielkorridor 8–12 eingehalten)

11 neue Wege + 1 wiederverwendeter Weg. Methode durchgängig `googlenews_search`
(`site:`-Filter) — der im Repo kanonische, bot-resistente Weg; **keine erfundenen
Feeds/APIs**.

### Tier 1 — dauerhaft unverzichtbar (6)
| ID | Herausgeber | Funktion | Kompetenz | Frequenz | kritisch |
|---|---|---|---|---|---|
| `rp-bildung-bmbfsfj` | BMBFSFJ *(neu)* | Bundes-Bildungspolitik, Förderbekanntmachungen, BAföG, Ganztag, frühkindl./berufl. Bildung | Bund | ereignisnah | ja |
| `rp-bildung-kmk` | KMK/Bildungs-MK *(neu)* | Beschlüsse, Bildungsstandards, Länderkoordination | Länderkoord. | ereignisnah | ja |
| `rp-bildung-bibb` | BIBB *(neu)* | Berufsbildungsbericht, Datenreport, Ausbildungsmarkt | Bund | regelmäßig | ja |
| `rp-bildung-destatis` | Destatis *(reuse)* | Schul-/Hochschul-/Berufsbildungsstatistik, Bildungsfinanzierung, Kita | Bund | regelmäßig | nein |
| `rp-bildung-bildungsbericht` | Bildungsbericht/DIPF *(neu)* | Nationaler Bildungsbericht „Bildung in Deutschland" (Synthese) | wiss. Monitoring (Bund-Länder) | periodisch | nein |
| `rp-committee-bildung` | Google News/Bundestag *(REUSE, bestehend & aktiv)* | parlamentarischer Weg: Ausschuss Bildung/Forschung, Gesetzentwürfe, Anhörungen | Bund | ereignisnah | (bestehend) |

### Tier 2 — wichtig, periodisch/teils redundant (4)
| ID | Herausgeber | Funktion | Kompetenz | Frequenz |
|---|---|---|---|---|
| `rp-bildung-swk` | SWK *(neu)* | wissenschaftl. Beratung der KMK (Gutachten/Stellungnahmen) | Länderkoord. | periodisch |
| `rp-bildung-iqb` | IQB *(neu)* | Überprüfung Bildungsstandards, IQB-Bildungstrend | Länderkoord. | periodisch |
| `rp-bildung-oecd` | OECD *(reuse)* | PISA, Education at a Glance | international | periodisch |
| `rp-bildung-dzhw` | DZHW *(neu)* | Studienzugang/-verlauf/-abbruch, soziale Lage Studierender | wiss. Monitoring | periodisch |

### Tier 3 — ergänzend/ereignisbezogen (2)
| ID | Herausgeber | Funktion | Kompetenz | Frequenz |
|---|---|---|---|---|
| `rp-bildung-ba-ausbildungsmarkt` | BA *(reuse)* | Ausbildungsmarkt, Übergang Schule–Beruf, Weiterbildungsförderung | Bund | regelmäßig |
| `rp-bildung-bundesrat` | Bundesrat *(reuse)* | zustimmungspflichtige Bildungsgesetze, Bund-Länder-Programme | Bund-Länder | ereignisnah |

**Bundesrat kritisch bewertet:** Die Recherche stuft ihn als wenig relevant ein. Für
**zustimmungspflichtige** Bildungsgesetze (BAföG-Novellen, Ganztagsförderung) und
Bund-Länder-Programme (Startchancen, Digitalpakt) ist der Bundesrat sehr wohl relevant →
**ein** eng gefilterter Weg mit klarem Mehrwert, unter Wiederverwendung des bestehenden
`publisher-bundesrat.de` (kein neuer Herausgeber). Kein paralleler Weg zu den vorhandenen
soziales-Bundesratswegen.

---

## 4. Frequenzklassen (nachvollziehbar)

- **ereignisnah:** BMBFSFJ, KMK, Bundesrat, `rp-committee-bildung` (Bundestag).
- **regelmäßig:** Destatis, BIBB, BA-Ausbildungsmarkt.
- **periodisch/bei Veröffentlichung:** Bildungsbericht (2-jährlich), SWK, IQB-Bildungstrend
  (≈ 3–4 Jahre; zuletzt 2024), OECD/PISA (3-jährlich), DZHW.

Keine seltene Berichtspublikation ist als „dauerhaft ereignisnah" klassifiziert.

---

## 5. Abdeckungsmatrix nach politischen Funktionen

Speist sich aus `path_expected_topics` (37 Zuordnungen). ✅ = im Paket abgedeckt.

| Funktion (Mindestabdeckung) | Primärweg | abgedeckt |
|---|---|---|
| Bundesgesetzgebung | BMBFSFJ, `rp-committee-bildung`, Bundesrat | ✅ |
| Bund-Länder-Koordination | Bundesrat, Bildungsbericht | ✅ |
| berufliche Bildung | BIBB, BMBFSFJ | ✅ |
| Ausbildungsmarkt | BIBB, BA | ✅ |
| BAföG / Bildungsförderung | BMBFSFJ | ✅ |
| frühkindliche Bildung | BMBFSFJ (Kita-Qualität), Destatis (Kita) | ✅ |
| Ganztag | BMBFSFJ, Bundesrat | ✅ |
| Bildungsgerechtigkeit | Bildungsbericht | ✅ |
| Bildungsmonitoring | Bildungsbericht, IQB, Destatis | ✅ |
| Bildungsstandards | KMK (setzt), IQB (überprüft), SWK | ✅ |
| Digitalisierung | BMBFSFJ (Digitalpakt), Bundesrat | ✅ (über Programm-Terme) |
| Schulqualität | IQB, KMK | ✅ |
| Hochschulzugang / Studienverlauf | DZHW, Destatis (Hochschulstatistik) | ✅ |
| internationale Vergleiche | OECD | ✅ |
| Weiterbildung | BIBB, BA, BMBFSFJ | ✅ |
| Anerkennung ausländischer Abschlüsse | KMK | ✅ (Grundabdeckung; Vertiefung → Future Target „Fachstelle Anerkennung") |

**Bewusste Länder-Lücken (Bundespaket kann sie nicht vollständig abdecken):** operative
Schulpolitik (Lehrpläne, Lehrkräfte, Schulstruktur), Schulstatistik-**Erhebung**,
Kita-Betrieb, Hochschul-Organisation. Diese liegen in ausschließlicher Länderkompetenz und
werden — wenn benötigt — über Landesmodule (BE/BB-Muster), **nicht** über das Bundespaket
abgebildet.

---

## 6. Wiederverwendung (Auftrag §1) — direkt übernommene Bestandseinträge

| Kategorie | Wiederverwendet (NICHT neu angelegt/verändert) |
|---|---|
| **Abrufweg** | `rp-committee-bildung` (bestehend, aktiv in Bund Basis) — nur zusätzlich `pkg-bildung-bund` zugeordnet |
| **Herausgeber** | `publisher-destatis.de`, `publisher-arbeitsagentur.de`, `publisher-bundesrat.de`, `publisher-oecd.org`, `aggregator-google-news` |
| **Entitäten** | `committee-bt-bildung`, `statoffice-destatis`, `authority-bundesagentur-arbeit`, `parliament-bundesrat` |
| **Geografie** | `geo-bund` |

Der Test prüft real, dass jeder wiederverwendete Eintrag im Basis-Seed existiert.

### Neu angelegt
- **7 Entitäten:** `ministry-bmbfsfj`, `institution-kmk`, `authority-bibb`,
  `institution-dipf`, `institution-swk`, `institution-iqb`, `institution-dzhw`.
- **7 Herausgeber:** bmbfsfj.bund.de, kmk.org, bibb.de, bildungsbericht.de,
  swk-bildung.org, iqb.hu-berlin.de, dzhw.eu.
- **11 Abrufwege** (`rp-bildung-*`) + **1 Paket** (`pkg-bildung-bund`, `prepared`).

---

## 7. Future Targets & Ausschlüsse

### Future Targets (fachlich relevant, technisch/strukturell noch nicht geeignet)
- **Autorengruppe Bildungsberichterstattung** — maschinenlesbare Indikatoren (derzeit nur
  PDF-Berichtspublikation).
- **NEPS / LIfBi** — Längsschnitt-Bildungsverläufe; forschungsorientiert, für ereignisnahe
  Politik zu grundlagenorientiert (Teil des Bildungsbericht-Autorenkreises).
- **Fachstelle Anerkennung** — Anerkennung ausländischer Qualifikationen; Zugang derzeit
  schwer strukturierbar.
- **IQB-Bildungstrend-Prozessdaten**, **GWK-Beschlüsse strukturiert** — derzeit nicht
  strukturiert verfügbar.
- **Deutscher Bildungsserver** (`bildungsserver.de`, DIPF) — Meta-/Wegweiser-Quelle; als
  Dauerbeobachtung ohne klaren Zusatznutzen gegenüber den Primärquellen → **nicht** als
  eigener Weg aufgenommen, als Future/Recherche-Ressource geführt.
- **Programm-Portale** Startchancen/Digitalpakt 2.0/GaFöG-Monitoring — inhaltlich über
  BMBFSFJ/Bundesrat-Terme abgedeckt; eigene Wege erst bei Bedarf.

### Ausgeschlossen (mit Begründung)
- **BMFTR** → `wissenschaft-forschung-bund` (Forschung/Technologie/Raumfahrt; Bildung ist
  nach dem Ressortschnitt beim BMBFSFJ). Kein eigenständiger Bildungs-Mehrwert.
- **GWK** → `wissenschaft-forschung-bund` (Bund-Länder-**Forschungs**finanzierung; Recherche
  selbst nennt Status-2026-Unsicherheit).
- **Bertelsmann / Vodafone Stiftung / CHE / Stifterverband** — interessengeleitet bzw.
  redundant zu amtlichen Quellen; nicht in Tier 1–3 (Auftrag). Interessenlage: wirtschafts-/
  stiftungsnah.
- **UNESCO** — globale Einordnung, nicht operative Bundespolitik; OECD deckt die
  internationale Ebene ab.
- **Einzelne Länderquellen** — würden falsche Bundeskompetenz suggerieren (→ Landesmodule).

---

## 8. Technische Verifikation & Egress-Transparenz

| geprüft | Ergebnis |
|---|---|
| Institutionen + offizielle Domains (BMBFSFJ, BMFTR, KMK/Bildungs-MK, BIBB, Bildungsbericht, SWK, IQB, DZHW) | **fachlich bestätigt** via WebSearch (offizielle Domains als Suchergebnis-URLs belegt) |
| Ressort-/KMK-Reform-Fakten 2026 | **fachlich bestätigt** (WebSearch) |
| Determinismus des Generators | **bestätigt** (zwei Läufe byte-identisch, SHA1 gleich) |
| Idempotenz / Inaktivität / Referenzintegrität | **bestätigt** (51 Offline-Checks, s. `bildung-bund-seed-test.js`) |
| **byte-genaue Abrufweg-Verifikation** (HTTP-Status, Redirect, Content-Type, Volltext, Bot-Schutz je `site:`-Suche) | **NICHT möglich in dieser Umgebung** — Sandbox-Egress bot-blockiert (Kontrolle: `bmbfsfj.bund.de` → HTTP 403 über Proxy). |

**Zwingend VOR Aktivierung nachzuholen** (offener-Egress-Runner, analog Sprint 9B
`landesmodule-verifikation.js`): realer Abruf jeder der 11 `site:`-Google-News-Suchen →
HTTP 200, Trefferzahl/Recency, Volltext statt Anriss, kein Dauer-Bot-Block. WebSearch
ersetzt diese byte-genaue Prüfung nicht.

---

## 9. Integrationsprotokoll (Dateien dieses Sprints)

| Datei | Art | Zweck |
|---|---|---|
| `lib/helmut/quellenarchitektur/seeds/bildung-bund-quellen.js` | neu | deterministischer Seed-Builder (In-Memory-Abbild) |
| `scripts/generate-bildung-bund-seed.js` | neu | Codegen → idempotentes SQL + guarded Rollback |
| `scripts/bildung-bund-seed-test.js` | neu | 51 Offline-Checks (Inaktivität/Dedup/Abdeckung) |
| `supabase/seeds/20260724_bildung_bund_seed.sql` | neu | PREPARED-Seed (nicht angewandt) |
| `supabase/seeds/20260724_bildung_bund_seed_rollback.sql` | neu | guarded Rollback |
| `scripts/run-offline-tests.js` | +1 Zeile | Generator in DENYLIST (analog Landesmodul-Generator) |
| `package.json` | +1 Zeile | `test:bildung-bund` Script |
| `docs/quellenarchitektur/29-bildung-bund-vorbereitung.md` | neu | dieses Dokument |
| `docs/quellenarchitektur/bildung-bund-manifest.md` | neu | kompaktes Manifest |

**Bewusst NICHT verändert:** `PACKAGE_DEFINITIONS` (packages.js), `packageKeysForSource`,
Generator-/Registry-/Workflow-Logik, bestehende Seeds/Migrationen, aktive Quellen. Das
Paket lebt vollständig eigenständig im DB-Seed (nicht im Code-Katalog) → kein Bruch von
`source-architecture-test.js` (`M.packages.length === 6`).

### Anwenden (freigabepflichtig, NICHT Teil dieses Sprints)
`psql < supabase/seeds/20260724_bildung_bund_seed.sql` (nach Freigabe + byte-Verifikation).
Rollback: `psql < supabase/seeds/20260724_bildung_bund_seed_rollback.sql`.

---

## 10. Dublettencheck (semantisch, Auftrag §11)

| Verdächtiges Paar | Bewertung |
|---|---|
| BMBFSFJ / BMFSFJ / BMBF | `ministry-bmbfsfj` neu (Bildung, bmbfsfj.bund.de) ≠ `ministry-bmfsfj` (historisch, bmfsfj.de, unverändert); BMBF = heutiges BMFTR (nicht angelegt). **Keine Dublette.** |
| BMFTR / BMBF | dieselbe Institution (umbenannt) — bewusst **nicht** angelegt (→ Wissenschaftspaket). |
| KMK / SWK / IQB | drei getrennte Entitäten: KMK setzt Standards, IQB überprüft sie, SWK berät. **Keine Dublette.** |
| DIPF / Bildungsbericht / Bildungsserver | DIPF = **eine** Entität hinter Bildungsbericht; Bildungsserver (auch DIPF) als Future geführt (kein zweiter DIPF). |
| Destatis / Bildungsbericht | komplementär (Rohdaten vs. Synthese) — getrennte Wege, keine Dublette. |
| BIBB / BMBFSFJ / BA | Berufsbildungssystem (BIBB) vs. Politik/Programm (BMBFSFJ) vs. Arbeitsmarkt/Übergang (BA) — unterschiedliche Perspektiven, eng gefiltert, keine funktionale Dublette. |
| DZHW / GWK | DZHW (Studienlage, aufgenommen) ≠ GWK (Forschungsfinanzierung, ausgeschlossen). |
| NEPS / LIfBi | eine Sache (LIfBi betreibt NEPS) → als **ein** Future Target, nicht doppelt. |
| OECD / PISA | PISA ist ein OECD-Produkt → **ein** OECD-Weg, kein separater PISA-Weg. |
| Bundestagsausschüsse / DIP | parlamentarischer Weg über bestehenden `rp-committee-bildung` wiederverwendet — **kein** paralleler Weg. |
| Bundesrat / bestehende parl. Wege | ein eng gefilterter Bildungs-Bundesratsweg über bestehenden Herausgeber; kein Konflikt mit soziales-Wegen. |

Automatisiert geprüft: keine ID-/Domain-Kollision gegen Basis- und Landesmodul-Seed.

---

## 11. Abschlussbericht (16 Fragen)

1. **Institutionen & historische Aliase:** BMBFSFJ (bmbfsfj.bund.de; aus BMFSFJ + Bildungs-
   teil des BMBF); BMFTR (bmftr.bund.de; = umbenanntes BMBF); KMK → Bildungsministerkonferenz
   (Reform 01/2025, Dach/Domain kmk.org); BIBB, DIPF/Bildungsbericht, SWK, IQB, DZHW;
   wiederverwendet: Destatis, BA, Bundesrat, OECD, Ausschuss Bildung/Forschung.
2. **BMBFSFJ ↔ BMFTR:** BMBFSFJ = Bildung (Schule/Beruf/frühkindlich, BAföG, Ganztag,
   Programme) → im Paket; BMFTR = Forschung/Technologie/Raumfahrt → ausgeschlossen
   (Wissenschaftspaket). Graubereich Hochschule nur über DZHW (Studienlage), eng gefiltert.
3. **Technisch bestätigt:** Determinismus (byte-identische Codegen), Idempotenz, Inaktivität,
   Referenzintegrität, Dublettenfreiheit (51 Offline-Checks). **Byte-genaue URL-Prüfung NICHT**
   (Egress bot-blockiert) — offen für Freigabe.
4. **Nur fachlich bestätigt (WebSearch):** Existenz/Namen/Domains/Zuständigkeiten aller
   Institutionen + KMK-Reform + Bildungsbericht 2026. Keine URL byte-genau geprüft.
5. **Future Targets:** Autorengruppe (Maschinendaten), NEPS/LIfBi, Fachstelle Anerkennung,
   IQB-Prozessdaten, GWK-Beschlüsse, Deutscher Bildungsserver, Programm-Portale
   (Startchancen/Digitalpakt/GaFöG).
6. **Wiederverwendet:** Publisher destatis/arbeitsagentur/bundesrat/oecd/google-news;
   Entitäten committee-bt-bildung/statoffice-destatis/authority-bundesagentur-arbeit/
   parliament-bundesrat; Weg `rp-committee-bildung`; Geografie geo-bund.
7. **Neu:** 7 Entitäten, 7 Herausgeber, 11 Abrufwege, 1 Paket (`pkg-bildung-bund`).
8. **Tiers:** Tier 1 = 6 (inkl. reused committee), Tier 2 = 4, Tier 3 = 2. Summe 12 Wege.
9. **Föderale Grenzen:** je Weg als Bund / Bund-Länder / Länderkoordination / wiss. Monitoring
   / international klassifiziert (`path_expected_levels`); KMK/SWK/IQB = `land` (nicht Bund);
   Länder-Lücken (Schule/Kita/Hochschulorganisation) explizit benannt.
10. **Wegen Überschneidung `wissenschaft-forschung-bund` NICHT aufgenommen:** BMFTR, GWK,
    Hochschul**forschung**/-organisation, Wissenschaftssystem (DZHW nur auf Studienlage begrenzt).
11. **Vermiedene Dubletten:** BMBFSFJ↔BMFSFJ↔BMBF, BMFTR↔BMBF, KMK↔SWK↔IQB,
    DIPF↔Bildungsbericht↔Bildungsserver, Destatis↔Bildungsbericht, BIBB↔BMBFSFJ↔BA, DZHW↔GWK,
    NEPS↔LIfBi, OECD↔PISA, Bundestagsausschuss↔DIP, Bundesrat↔parl. Wege (§10).
12. **Frequenzklassen:** ereignisnah (BMBFSFJ/KMK/Bundesrat/Bundestag), regelmäßig
    (Destatis/BIBB/BA), periodisch (Bildungsbericht/SWK/IQB/OECD/DZHW).
13. **Inaktiv?** Ja — Paket `prepared`; alle 11 neuen Wege `needs_review`+`manual`;
    0 aktive/auto/always_on Wege (Test + SQL-Selbstprüfung).
14. **Tests grün?** Ja — **141/141** Offline-Suiten (inkl. neuem Test); `source-architecture-test`
    unverändert grün.
15. **Technisch vorbereitet?** Ja — Builder, Codegen, idempotentes SQL, guarded Rollback,
    Doku, Manifest liegen vor; nicht angewandt.
16. **Restrisiken vor Aktivierung:** (a) byte-genaue URL-Verifikation der 11 `site:`-Suchen
    ausstehend; (b) Bot-Robustheit/Trefferqualität je Suche unbestätigt; (c) WP21-Bundestags-
    ausschuss könnte umbenannt sein (reused `rp-committee-bildung` beobachten); (d) BIBB-
    Ressortaufsicht (BMBFSFJ vs. BMFTR) organisatorisch noch nicht letztverbindlich belegt;
    (e) Aktivierung erfordert Freigabe + Umschaltung `prepared→active` / `needs_review→healthy`
    / `manual→auto` je Weg.

**Ende des Sprints. Kein weiteres Quellenpaket begonnen.**
