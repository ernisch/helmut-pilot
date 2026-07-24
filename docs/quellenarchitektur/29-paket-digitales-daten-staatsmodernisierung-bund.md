# 29 — Paket `digitales-daten-staatsmodernisierung-bund` (technische Validierung + INAKTIVE Vorbereitung)

**Stand:** 2026-07-24 · **Status: `prepared` — vollständig inaktiv, NICHT angewendet, NICHT freigegeben.**
Kein Crawl, keine Aktivierung, kein Flag, kein Cron, kein Deployment, kein Merge, kein PR (sofern nicht ausdrücklich angefordert).

Dieses Paket bündelt die Bundespolitik zu **Digitalisierung, Daten, KI-Regulierung,
Verwaltungsdigitalisierung und Staatsmodernisierung**. Es ist bewusst **kompakt** (7 Kern-Wege,
davon 5 neu + 2 wiederverwendet) und **wiederverwendungs-first** angelegt.

**Artefakte (alle additiv, nichts Bestehendes verändert):**

| Artefakt | Pfad |
|---|---|
| Seed-Daten (rein, deterministisch) | `lib/helmut/quellenarchitektur/seeds/bund-digital-quellen.js` |
| Generator (Codegen, kein Netz/DB) | `scripts/generate-bund-digital-seed.js` |
| SQL-Seed (idempotent) | `supabase/seeds/20260724_paket_digitales_daten_staatsmodernisierung_bund_seed.sql` |
| Rollback (guarded) | `supabase/seeds/20260724_paket_digitales_daten_staatsmodernisierung_bund_seed_rollback.sql` |
| Paket-Test (offline, auto-eingesammelt) | `scripts/bund-digital-seed-test.js` (44/44 grün) |

---

## 1. Zuerst gelesene Architekturdateien (kein Repository-Vollscan)

Reihenfolge der Orientierung — **primär** aus der Quellenarchitektur-Doku, dann gezielt:

1. `docs/quellenarchitektur/00-master-status.md` (Re-Anker R2, Betriebszustand, verbindliche Grenzen).
2. `lib/helmut/quellenarchitektur/model.js` (Enums/CHECK-Werte, Referenzzählung, Aktivierungslogik).
3. `lib/helmut/quellenarchitektur/seeds/{publishers,entities,packages}.js` (Bestandsinventar).
4. `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js` (Muster für PREPARED-Wege).
5. `supabase/migrations/20260713_source_architecture.sql` (Schema, CHECK-Constraints, RLS).
6. `supabase/seeds/20260713_source_architecture_seed.sql` (Bestands-IDs, Reuse-Kandidaten).
7. `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` + `docs/.../15-prepared-eintragung-freigabeanfrage.md`
   (exaktes Präzedenzmuster für „prepared/needs_review/manual").
8. `scripts/generate-landesmodul-seed.js` + `scripts/landesmodul-seed-test.js` + `scripts/run-offline-tests.js`
   (Generator-/Test-Konvention, Offline-Einsammlung).

**Danach nur gezielte Suchen** (kein Vollscan): Bestand nach `bmds/planungsrat/fitko/normenkontrollrat/
bfdi/committee-digitales/dip/bundesrat/bundesrechnungshof`. Ergebnis: kein Vorbestand für BMDS/
IT-Planungsrat/NKR/BfDI; direkt wiederverwendbar: `parliament-bundestag`, `parliament-bundesrat`,
`committee-bt-digitales`, `authority-bundesrechnungshof`, `publisher-dip.bundestag.de`,
`aggregator-google-news`, `publisher-bundesrechnungshof.de`, `rp-dip`, `rp-committee-digitales`.
**Ein Repository-Vollscan wurde vermieden.**

---

## 2. Verifizierte Ressortstruktur (Stand 2026)

- **BMDS — Bundesministerium für Digitales und Staatsmodernisierung**, errichtet **06.05.2025**,
  Domain **bmds.bund.de**, Sitze Berlin/Bonn. Minister Karsten Wildberger (CDU). Bündelt Kompetenzen
  aus **6 Ressorts** (u. a. Bundeskanzleramt, BMI, BMWE/Wirtschaft, BMJ). Abteilungen u. a.
  **DS „Deutschland-Stack"** (Digitale Verwaltung), **DI Digitale Infrastrukturen**.
  Zuständig für Glasfaser-/Mobilfunkausbau, Verwaltungsmodernisierung, Bürokratieabbau, KI-Nutzung,
  Steuerung zentraler Bundes-IT-Projekte.
- **Markus Richter** ist **seit 06.05.2025 Staatssekretär im BMDS** (Wechsel aus dem BMI). Die frühere
  Einordnung als BMI-Staatssekretär/Bundes-CIO ist **historisch** und wird nicht als aktuelle
  Zuordnung modelliert.
- **Funktion „Beauftragter der Bundesregierung für Informationstechnik" (Bundes-CIO):** mit Gründung
  des BMDS **aufgelöst**. → **Keine eigene Entität / kein eigener Retrieval Path.** Die Funktion ist
  institutionell **vollständig über `ministry-bmds` abgedeckt.** (Auftrag §1 erfüllt.)
- **Abgrenzung:** BMI (Sicherheit/Inneres, `ministry-bmi` bestehend), BMWE (Wirtschaft → `wirtschaft-bund`),
  BMFTR (Forschung → `wissenschaft-forschung-bund`), Bundeskanzleramt (`government-bund`, Alias
  „Bundeskanzleramt"). Diese werden **nicht** in dieses Paket gezogen.

Quelltyp der Verifikation: **WebSearch fachlich bestätigt** (Wikipedia/BMDS/Fachpresse). Byte-genaue
HTTP-/Feed-Prüfung war in der Bau-Umgebung durch gesperrten Egress **nicht** möglich → siehe §7.

---

## 3. Trennung Institution / Programm / Produkt / Gesetz (Auftrag §3)

**Als Entität/Herausgeber modelliert (Institutionen):** BMDS (Ministerium), IT-Planungsrat
(Bund-Länder-Gremium), Nationaler Normenkontrollrat (Beratungsgremium), BfDI (Aufsichtsbehörde).
Wiederverwendet: Bundestag, Bundesrat, Ausschuss Digitales, Bundesrechnungshof.

**NICHT als Institution modelliert** (Programme/Plattformen/Produkte/Gesetze — über die Wege ihrer
Herausgeber abgedeckt, als `path_expected_topics` verschlagwortet): Deutschland-Stack,
Deutschland-Architektur, BundID, DeutschlandID, EUDI-Wallet, NOOTS, Deutsche Verwaltungscloud, OZG/
OZG 2.0, Digitalcheck, Registermodernisierung, GovData, Bundesportal, KI-Marktüberwachungsgesetz.

---

## 4. Kompetenz- & Zuständigkeitskarte (7 Kern-Wege)

| # | Institution | Weg | Herkunft | Tier | Deckt ab |
|---|---|---|---|---|---|
| 1 | BMDS | `rp-bmds-presse` (googlenews `site:bmds.bund.de`) | **neu** | 1 | politische Entscheidungen, Strategien, Deutschland-Stack, digitale Identitäten, KI, OZG, Registermodernisierung, digitale Souveränität, Open Source |
| 2 | IT-Planungsrat | `rp-it-planungsrat-beschluesse` (googlenews `site:it-planungsrat.de`) | **neu** | 1 | Bund-Länder-Beschlüsse, föderale Digitalstrategie, Deutschland-Architektur, NOOTS, Verwaltungscloud, Registermodernisierung, OZG |
| 3 | Bundestag/DIP | `rp-dip` (DIP-API) | **wiederverwendet** | 1 | Gesetzentwürfe, Anträge, Drucksachen, Kleine Anfragen (inkl. Bundesrats-Materialien in Vorgängen) |
| 4 | Bundestag | `rp-committee-digitales` (googlenews) | **wiederverwendet** | 1 | Ausschuss für Digitales und Staatsmodernisierung |
| 5 | Bundesrechnungshof | `rp-bundesrechnungshof-digital` (googlenews `site:bundesrechnungshof.de` digital) | **neu** (Herausgeber wiederverwendet) | 2 | IT-Großprojekte, E-ID, Bundescloud, Registermodernisierung, IT-Konsolidierung, Wirtschaftlichkeit |
| 6 | Normenkontrollrat | `rp-nkr-veroeffentlichungen` (googlenews `site:normenkontrollrat.bund.de`) | **neu** | 2 | Jahresberichte, Digitalcheck (seit 2023), Bürokratiekosten, Gesetzesqualität, Staatsmodernisierung |
| 7 | BfDI | `rp-bfdi-veroeffentlichungen` (googlenews `site:bfdi.bund.de`) | **neu** | 2 | Datenschutz, Informationsfreiheit, Data-Act-/KI-Aufsicht, Tätigkeitsberichte, Stellungnahmen |

**Neue Entitäten (4):** `ministry-bmds`, `institution-it-planungsrat`, `institution-nkr`, `authority-bfdi`.
**Neue Herausgeber (4):** `publisher-bmds.bund.de`, `publisher-it-planungsrat.de`,
`publisher-normenkontrollrat.bund.de`, `publisher-bfdi.bund.de`.
**Keine Personenabhängigkeit** in IDs/Keys (weder Wildberger/Richter/Specht-Riemenschneider).

---

## 5. Abgrenzung BMDS ↔ IT-Planungsrat ↔ FITKO (Auftrag §5)

- **BMDS** = Bundesressort: politische Entscheidungen, Strategien, Gesetzgebung des Bundes → `rp-bmds-presse`.
- **IT-Planungsrat** = staatsvertragliches **Bund-Länder-Steuerungsgremium**: Beschlüsse,
  föderale Digitalstrategie, Portfolio-Governance, Deutschland-Architektur → `rp-it-planungsrat-beschluesse`.
- **FITKO** = operative Umsetzungsorganisation des IT-Planungsrats. **NICHT als eigener Dauerweg**
  angelegt: IT-Planungsrat und FITKO veröffentlichen einen **gemeinsamen Jahresbericht** →
  Doppelerfassung vermieden. FITKO ist **Future Target**, falls ein eigenständiger operativer
  Fortschrittswert (z. B. föderale Produkt-Releases) belegt wird.

---

## 6. Einordnung der operativen Akteure (Auftrag §6) & Ausschlüsse

| Akteur | Einordnung | Begründung |
|---|---|---|
| **DigitalService des Bundes** | **Future Target** | Produkt-/Blogkommunikation, operativ; politischer Signalwert ggü. BMDS/NKR nicht belegt (Digitalcheck über NKR abgedeckt). |
| **FITKO** | **Future Target** | gemeinsamer Jahresbericht mit IT-PLR → über `rp-it-planungsrat-beschluesse` abgedeckt. |
| **ITZBund** | **ausgeschlossen (Tier 3/Future)** | Betriebs-/Arbeitgeberkommunikation, geringer politischer Signalwert; Bundescloud/IT-Konsolidierung über BRH + BMDS abgedeckt. |
| **ZenDiS (openDesk)** | **Future Target** | eigener Signalwert (Open Source/Souveränität) ggü. BMDS noch nicht belegt. |
| **Sovereign Tech Agency** | **Future Target** | institutionelle Stellung/Publikationsrhythmus geprüft → Tier 3, keine Dauerquelle. |
| **GovData** | **Future Target** | primär Metadaten-**portal**, kaum politische Veränderungssignale. |
| **Bundesportal / BundID** | **Future Target** | Service-/**Produkt**portal, kein zuverlässiger Politik-Publikationsweg. |
| **Bundesanzeiger** | **ausgeschlossen** | Verkündung → bestehende Gesetzgebungsquellen (DIP) genügen. |
| **EU-Kommission / AI Act / Data Act / DSA / DMA (Primärrecht)** | **anderem Paket** | EU-Primärrecht + Plattform-/Wirtschaftsregulierung → `wirtschaft-bund` bzw. späteres EU-Paket. Nationale Umsetzung ist über BMDS/DIP/BfDI abgedeckt. |
| **Bundes-CIO / IT-Beauftragter** | **entfällt** | Funktion mit BMDS aufgelöst → über `ministry-bmds` abgedeckt. |

---

## 7. Technische Verifikation (ehrliche Trennung)

- **byte-genau bestätigt:** nichts (Egress in der Bau-Umgebung gesperrt; keine HTTP-/Feed-/Redirect-Prüfung möglich).
- **nur per WebSearch fachlich bestätigt:** Existenz/Domain/Publikationsrhythmus von BMDS (bmds.bund.de),
  IT-Planungsrat (it-planungsrat.de, Beschlüsse/Jahresbericht), NKR (normenkontrollrat.bund.de,
  Jahresberichte/Digitalcheck), BfDI (bfdi.bund.de, Tätigkeitsberichte), Committee-Name
  „Ausschuss für Digitales und Staatsmodernisierung" (bundestag.de/digitales).
- **ungeprüft / vor Aktivierung ZWINGEND zu verifizieren** (`verify_before_activation=true` auf allen
  neuen Wegen): HTTP-Status, Redirect-Ziel, finale Domain, Content-Type, native Feed-Verfügbarkeit
  (RSS/HTML statt Google-News-Ersatzweg), Bot-Schutz, JS-Abhängigkeit, Volltext, Publikationsfrequenz.
- **Keine URLs/Feeds/Endpunkte erfunden:** alle neuen `url`-Werte sind konstruierte
  `news.google.com/rss/search`-Suchwege über die `site:`-Domain des jeweiligen amtlichen Herausgebers
  (identisches Muster wie Bestands-Wege), **kein** behaupteter nativer Publisher-Feed.

---

## 8. Abdeckungsmatrix (Auftrag §13)

| Thema | abgedeckt durch | Status |
|---|---|---|
| Digitalpolitik | BMDS, Ausschuss Digitales, DIP | ✅ |
| Staatsmodernisierung | BMDS, NKR | ✅ |
| Verwaltungsdigitalisierung | BMDS, IT-PLR, BRH | ✅ |
| OZG / OZG 2.0 | BMDS, IT-PLR, DIP | ✅ |
| Registermodernisierung | IT-PLR, BMDS, BRH | ✅ |
| Digitale Identitäten (BundID/DeutschlandID/EUDI) | BMDS, IT-PLR (topics) | ✅ (Produkte nicht als Institution) |
| Deutschland-Stack / IT-Architektur Bund | BMDS (Abt. DS), IT-PLR (Deutschland-Architektur) | ✅ |
| IT-Konsolidierung | BRH, BMDS | ✅ |
| Verwaltungscloud (DVC) | IT-PLR, BMDS | ✅ |
| Open Data / Datenstrategie | BMDS (topics); GovData | ✅ (GovData = Future Target) |
| KI-Regulierung / KI in der Verwaltung | BMDS, BfDI, Ausschuss Digitales | ✅ |
| Digitale Souveränität / Open Source | BMDS | ✅ (ZenDiS/Sovereign Tech = Future Target) |
| Digitalcheck / Bürokratieabbau | NKR | ✅ |
| Datenschutz / Informationsfreiheit | BfDI | ✅ |
| Bund-Länder-Koordination | IT-PLR | ✅ |
| Haushalts-/Wirtschaftlichkeitskontrolle | BRH | ✅ |
| Nationale Umsetzung EU-Digitalgesetze | BMDS, BfDI, DIP | ✅ |
| **EU-Primärrecht (AI Act etc.), Plattform-/Wirtschaftsregulierung** | — | ⤳ **bewusst anderem Paket** (`wirtschaft-bund`/EU-Paket) |

---

## 9. Vermiedene Dubletten (semantischer Check, Auftrag §16)

| Paar | Ergebnis |
|---|---|
| BMDS ↔ BMI | getrennt: `ministry-bmds` neu, `ministry-bmi` bestehend/unverändert |
| BMDS ↔ Bundes-CIO | keine CIO-Entität; Funktion aufgelöst, über BMDS abgedeckt |
| BMDS ↔ IT-Planungsrat | getrennte Entitäten/Herausgeber/Wege (Ressort vs. Gremium) |
| IT-Planungsrat ↔ FITKO | FITKO nicht angelegt (gemeinsamer Jahresbericht) |
| FITKO ↔ GovData | beide nicht als Institution angelegt |
| DigitalService ↔ ITZBund ↔ ZenDiS ↔ Sovereign Tech | keiner als Weg angelegt (Future/ausgeschlossen) |
| BundID ↔ DeutschlandID ↔ EUDI-Wallet | keine Produkt-Institution; nur Topics |
| Deutschland-Stack ↔ Deutschland-Architektur | keine Institution; Topics bei BMDS bzw. IT-PLR |
| OZG ↔ Bundesportal | OZG als Topic; Bundesportal Future Target |
| BVA ↔ Registermodernisierung ↔ NOOTS | keine Produkt-Institution; NOOTS Topic bei IT-PLR |
| Bundestagsausschuss ↔ DIP | Ausschussweg wiederverwendet, kein paralleler Weg |
| Bundesratsausschuss ↔ bestehende Bundesratswege | kein neuer Bundesrat-Weg; Drucksachen via `rp-dip` |
| Bundesrechnungshof ↔ NKR | getrennte Herausgeber/Wege (Prüfung vs. Beratung) |
| BfDI ↔ Data-Act-Aufsicht | eine BfDI-Entität; Data-Act als Topic |
| BMDS-EU-Umsetzung ↔ EU-Kommission | keine EU-Kommission-Quelle (anderes Paket) |

**ID-Kollisionen:** 0 · **Domain-Dubletten:** 0 (Test §5/§6). Kein Bestandsdatensatz wird verändert
(alle Inserts `ON CONFLICT DO NOTHING`; Reuse nur additive `package_paths`).

---

## 10. Inaktivitäts- & Test-Nachweis

- Paket `status='prepared'`, `is_base=false` → keine Referenzzählung → aktiviert nichts.
- Alle 5 neuen Wege `status='needs_review'` + `activation_mode='manual'` + `verify_before_activation=true`.
- Wiederverwendete Wege (`rp-dip`, `rp-committee-digitales`) werden **nicht verändert**, nur additiv verknüpft.
- Offline-Suite: **141/141 grün** (inkl. neuer `bund-digital-seed-test.js`, 44/44). Basis-Seed, `packages.js`,
  `index.js`, Generatoren, Test-Runner **unverändert** (`git status`: nur 5 neue Dateien).
- Deterministische Generierung + idempotenter Seed + guarded Rollback (Test §11).

---

## 11. Verbleibende Risiken vor Aktivierung

1. **Native Feeds unbestätigt:** ob BMDS/IT-PLR/NKR/BfDI native RSS/HTML-Feeds bieten (höhere Qualität
   als Google-News-Ersatz), ist ungeprüft. Vor Aktivierung je Weg prüfen.
2. **Google-News-Klumpenrisiko:** 5 neue Wege laufen über news.google.com (Betriebsbefund B1,
   Rate-Limiting). Bei Aktivierung Lastverteilung beachten.
3. **Bundesrat-Digitalabdeckung** derzeit nur über DIP-Vorgänge — ein dedizierter Bundesrat-Digitalweg
   ist Future Target, falls DIP zu grob ist.
4. **Committee-Namensdrift:** Bestandsentität `committee-bt-digitales` heißt „Ausschuss für Digitales";
   aktueller Name „…und Staatsmodernisierung". Bewusst **nicht** geändert (bestehende aktive Daten
   unangetastet); vor Aktivierung ggf. separat/ freigabepflichtig nachziehen.

---

## 12. KOMPAKTES MANIFEST (für Folge-Threads — kein erneuter Repository-Vollscan nötig)

```
paket: digitales-daten-staatsmodernisierung-bund   status: prepared (INAKTIV, nicht angewendet)
package_id: pkg-digitales-daten-staatsmodernisierung-bund
seed:     supabase/seeds/20260724_paket_digitales_daten_staatsmodernisierung_bund_seed.sql
rollback: supabase/seeds/20260724_paket_..._seed_rollback.sql   (guarded)
daten:    lib/helmut/quellenarchitektur/seeds/bund-digital-quellen.js  (rein, deterministisch)
generator:scripts/generate-bund-digital-seed.js       test: scripts/bund-digital-seed-test.js (44/44)

NEUE ENTITAETEN (4):  ministry-bmds · institution-it-planungsrat · institution-nkr · authority-bfdi
NEUE HERAUSGEBER (4): publisher-bmds.bund.de · publisher-it-planungsrat.de ·
                      publisher-normenkontrollrat.bund.de · publisher-bfdi.bund.de
NEUE WEGE (5, needs_review/manual/verify_before_activation):
   rp-bmds-presse (T1) · rp-it-planungsrat-beschluesse (T1) ·
   rp-bundesrechnungshof-digital (T2, Herausgeber reused) ·
   rp-nkr-veroeffentlichungen (T2) · rp-bfdi-veroeffentlichungen (T2)
WIEDERVERWENDETE WEGE (2, nur package_paths-Link): rp-dip (T1) · rp-committee-digitales (T1)
REUSED ENTITAETEN/HERAUSGEBER: parliament-bundestag · parliament-bundesrat · committee-bt-digitales ·
   authority-bundesrechnungshof · publisher-dip.bundestag.de · publisher-bundesrechnungshof.de ·
   aggregator-google-news

TIER: T1=4 (bmds,it-plr,dip,ausschuss)  T2=3 (brh-digital,nkr,bfdi)  T3/Future: fitko,digitalservice,
   itzbund,zendis,sovereign-tech,govdata,bundesportal   ANDERES PAKET: EU-Primärrecht/Plattformregulierung
NICHT-INSTITUTIONEN (nur Topics): deutschland-stack, deutschland-architektur, bundid, deutschlandid,
   eudi-wallet, noots, dvc/verwaltungscloud, ozg, digitalcheck, registermodernisierung, govdata, bundesportal
AKTIVIERUNG: freigabepflichtig; Dry-Run (begin;<seed>;checks;rollback;) vor echter Eintragung; danach
   je Weg verify_before_activation abarbeiten + status/activation_mode einzeln umstellen.
```
