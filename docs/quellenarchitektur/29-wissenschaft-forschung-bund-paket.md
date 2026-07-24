# Fachpaket „Wissenschaft und Forschung (Bund)" — technische Validierung & inaktive Vorbereitung

> **Status: `prepared` / vollständig INAKTIV.** Keine Aktivierung, kein Deployment, kein Merge,
> keine Produktionsänderung. Alle 12 Abrufwege `status=needs_review` + `activation_mode=manual`;
> das Paket `status=prepared`. Doppelt gesperrt (Paketstatus **und** Wegstatus). Die Eintragung
> in Production (Seed-Insert) ist ein eigener, **freigabepflichtiger** Schritt.
>
> Paket-Key: `wissenschaft-forschung-bund` · Paket-Id: `pkg-wissenschaft-forschung-bund`

Dieses Dokument ist das **kompakte Manifest** des Pakets. Es ermöglicht Folge-Threads, ohne
erneuten Repository-Vollscan weiterzuarbeiten (Dateiliste + Wege + Reuse + offene Risiken unten).

---

## 1 · Zuerst gelesene Architekturdateien (kein Vollscan)

In dieser Reihenfolge, als primäre Orientierung:

1. `docs/quellenarchitektur/00-master-status.md` (zentraler Status/Re-Anker)
2. `docs/quellenarchitektur/03-datenmodell-und-migration.md` (11 Tabellen, Rezepte, Rollback)
3. `lib/helmut/quellenarchitektur/model.js` (Enums: `PATH_STATUS`, `ACTIVATION_MODES`,
   `PACKAGE_STATUS`, `EVIDENCE_ROLES`, `POLITICAL_LEVELS`; Referenzzählung/Inaktivität)
4. `lib/helmut/quellenarchitektur/seeds/packages.js` · `publishers.js` · `entities.js` ·
   `geographies.js` (bestehende Pakete/Herausgeber/Entitäten/Geo-Ebenen)
5. **Landesmodul-Vorbild** (identisches „prepared/inaktiv"-Muster):
   `lib/helmut/quellenarchitektur/seeds/landesmodule-quellen.js`,
   `scripts/generate-landesmodul-seed.js`,
   `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` (+ Rollback),
   `scripts/landesmodul-seed-test.js`
6. `supabase/migrations/20260713_source_architecture.sql` (Tabellen-/CHECK-Definitionen)
7. `supabase/seeds/20260713_source_architecture_seed.sql` (Basis-Bestand: Herausgeber/Wege/Pakete)
8. `scripts/run-offline-tests.js` (Auto-Sammel-Mechanik der Offline-Suite + Netz-Guard)

**Vollscan vermieden: ja.** Es wurden nur gezielte Suchen nach den in der Recherche genannten
Institutionen geführt (BMFTR/BMBF/GWK/Wissenschaftsrat/DFG/Destatis/DZHW/OECD/EFI/HRK/…) —
kein pauschaler Repository-Scan. Ein breiterer Scan war nicht nötig; die Architektur-Doku war
für die Paketgrenzen ausreichend und widerspruchsfrei.

**Direkt gefunden & wiederverwendet:** `publisher-destatis.de` (Entität `statoffice-destatis`)
und `publisher-oecd.org` bestehen bereits im Basis-Seed → wiederverwendet (nur je ein
wissenschaftsspezifischer Abrufweg ergänzt). Die parlamentarische Abdeckung
(Bundestag/Forschungsausschuss/DIP) ist über das Basispaket `bund-basis` (u. a.
`rp-committee-bildung`, aktiv) abgedeckt → **keine parallelen Parlaments-/Ausschusswege** angelegt.

**Gezielte Zusatzsuchen:** WebSearch-Verifikation der aktuellen Ressortstruktur (BMFTR seit
Mai 2025), der Domains und des Ausschussnamens der 21. WP (siehe §6).

---

## 2 · Aktuelle Ressortstruktur & Aliasstrategie

| Institution | Domain | Status | Repository-Id |
|---|---|---|---|
| Bundesministerium für Forschung, Technologie und Raumfahrt (**BMFTR**) | `bmftr.bund.de` | aktuell (seit Mai 2025) | Entität `ministry-bmftr`, Herausgeber `publisher-bmftr.bund.de` |
| ~~Bundesministerium für Bildung und Forschung (BMBF)~~ | — | **historisch** | **kein eigener Eintrag** — nur Alias des BMFTR |
| Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend (**BMBFSFJ**) | `bmbfsfj.bund.de` | aktuell | **NICHT in diesem Paket** (→ `bildung-bund`/`familie-bund`) |

**Aliasstrategie (Entität `ministry-bmftr`):** `aliases = ["BMFTR", "BMBF",
"Bundesministerium für Bildung und Forschung"]`. Das frühere **BMBF wird NICHT als zusätzliche
aktuelle Institution** angelegt — es ist ausschließlich historischer Alias des BMFTR. So bleibt
die Ressort-Umbenennung 2025 verlustfrei matchbar (Alt-Dokumente „BMBF" → BMFTR), ohne Dublette.

### Abgrenzung BMFTR ↔ BMBFSFJ (kritisch geprüft)

Die pauschale Recherche-Aussage „BMBFSFJ ist für Hochschulbildung zuständig" ist **so nicht
korrekt**. Bei der Neuordnung 2025 wurden **Forschung, Technologie, Raumfahrt UND Hochschulen**
beim BMFTR gebündelt; **schulische/frühkindliche Bildung** wanderte mit Familie/Jugend zum
BMBFSFJ. Differenzierte Zuordnung:

| Gegenstand | Zuständig | Paketzuordnung |
|---|---|---|
| Hochschulorganisation | Länder | Landesmodule (nicht Bund) |
| Studium & Lehre (Bund-Länder-Programme) | GWK/Bund+Länder | **dieses Paket** (GWK: Zukunftsvertrag) |
| Studienfinanzierung (BAföG) | Bildungsressort | `bildung-bund` |
| Wissenschaftssystem / Forschungsförderung | BMFTR + GWK + DFG | **dieses Paket** |
| Bund-Länder-Forschungsförderung (Pakt, Exzellenzstrategie) | GWK | **dieses Paket** (GWK) |
| Hochschul-/Wissenschaftsfinanzierung (Statistik/Analyse) | Destatis/DZHW | **dieses Paket** (Reuse Destatis) |
| Schule, frühkindliche Bildung | BMBFSFJ/Länder | `bildung-bund` |
| Familie/Jugend | BMBFSFJ | `familie-bund` |

---

## 3 · Kompetenz- & Zuständigkeitskarte (mit Abgrenzung zu GWK/WR/DFG)

- **BMFTR** — Ressortpolitik: Bundesforschungsstrategie, Hightech Agenda, Förderpolitik, BuFI,
  Raumfahrtpolitik, Forschungsdaten/Transfer.
- **GWK** — *entscheidet & koordiniert* die Bund-Länder-Förderung (Exzellenzstrategie, Pakt für
  Forschung und Innovation, Zukunftsvertrag Studium und Lehre, Forschungsinfrastrukturen).
- **Wissenschaftsrat** — *berät, bewertet, empfiehlt* (Empfehlungen, Stellungnahmen,
  Evaluationen, Struktur-/Akkreditierungsentscheidungen). **Keine Dublette zur GWK:** GWK
  entscheidet Förderung, WR berät.
- **DFG** — selbstverwaltete Forschungsförderung; hier bewusst **strategisch** modelliert
  (Förderatlas, Jahresbericht, Stellungnahmen, Exzellenzstrategie) statt hochvolumiger
  Einzel-Förderentscheidungen. **Keine Dublette zum WR:** WR = Strukturberatung, DFG = Förderung.
- **Destatis** (Reuse) — amtliche Statistik (Hochschul-/FuE-Statistik). **DZHW** — Analyse &
  Wissenschaftssystemforschung. Sauber getrennt: Destatis = Rohdaten, DZHW = Interpretation.
- **EFI** — unabhängige Expertenkommission, Jahresgutachten an die Bundesregierung
  (offizielle Originalquelle **e-fi.de**, nicht über eine Bundestagskopie modelliert).
- **EU-Kommission (GD RTD)** / **OECD** (Reuse) — EU-Forschungsförderung (Horizon Europe) bzw.
  internationale Vergleichsindikatoren.
- **HRK** — Interessenvertretung der Hochschulen; **ereignisbezogen** (Tier 3), nicht als
  neutrale Dauer-Primärquelle.

---

## 4 · Endgültiger Kernbestand — 12 Retrieval Paths (Tiering)

Alle Wege: `method=googlenews_search` (etabliertes Repo-Muster für Institutionswege ohne
erfundenen Direkt-Feed), `status=needs_review`, `activation_mode=manual`, `max_items=16`.

| # | Weg-Id | Herausgeber | Tier | Ebene | Beobachtungsmodus |
|---|---|---|---|---|---|
| 1 | `rp-wf-bmftr-politik` | BMFTR (neu) | 1 | bund | dauerhaft |
| 2 | `rp-wf-bmftr-bufi` | BMFTR (neu) | 1 | bund | periodisch (2-jährl. BuFI) |
| 3 | `rp-wf-gwk-beschluesse` | GWK (neu) | 1 | bund | dauerhaft/sitzungsbezogen |
| 4 | `rp-wf-wissenschaftsrat` | Wissenschaftsrat (neu) | 1 | bund | dauerhaft/publikationsbezogen |
| 5 | `rp-wf-dfg-strategie` | DFG (neu) | 1 | bund | dauerhaft (Jahresbericht/Förderatlas) |
| 6 | `rp-wf-efi-gutachten` | EFI (neu, e-fi.de) | 2 | bund | jährlich |
| 7 | `rp-wf-destatis-hochschulforschung` | **Destatis (Reuse)** | 2 | bund | jährlich/quartalsweise |
| 8 | `rp-wf-dzhw` | DZHW (neu) | 2 | bund | ereignisbezogen |
| 9 | `rp-wf-eu-forschung` | EU-Kommission GD RTD (neu) | 2 | eu | periodisch (Arbeitsprogramme) |
| 10 | `rp-wf-oecd-sti` | **OECD (Reuse)** | 2 | international | periodisch |
| 11 | `rp-wf-bmftr-raumfahrt` | BMFTR (neu) | 3 | bund | ereignisbezogen (strateg. Raumfahrtpolitik) |
| 12 | `rp-wf-hrk` | HRK (neu) | 3 | bund | ereignisbezogen (z. B. WissZeitVG) |

**Tier 1: 5 · Tier 2: 5 · Tier 3: 2 — Summe 12** (im Zielkorridor 8–12).

### Fachliche Mindestabdeckung (Themenfeld → Weg)
Bundesforschungsstrategie (BMFTR/BuFI/EFI) · Forschungsförderung (DFG/GWK/BMFTR) ·
Bund-Länder-Steuerung (GWK) · Grundlagen-/angewandte Forschung + Transfer (BMFTR/DFG) ·
Wissenschaftssystem + Nachwuchs (DZHW/Destatis) · Hochschul-/Wissenschaftsfinanzierung
(Destatis/DZHW/GWK) · Exzellenzstrategie (GWK/WR/DFG) · WissZeitVG (HRK + Bundestag via
`bund-basis`) · Wissenschaftsfreiheit (DFG) · Open Access/Forschungsdaten (BMFTR) ·
Forschungsinfrastrukturen (GWK/WR) · Raumfahrtpolitik (BMFTR) · EU-Forschung/Horizon Europe
(EU-Kommission) · internationale Vergleiche (OECD) · FuE-Ausgaben (Destatis) ·
Forschungszulage (BMFTR + Bundestag via `bund-basis`).

---

## 5 · Wiederverwendet · neu · bewusst nicht modelliert

**Wiederverwendet (kein Duplikat):**
- Herausgeber `publisher-destatis.de` (Entität `statoffice-destatis`) → Weg 7
- Herausgeber `publisher-oecd.org` → Weg 10
- Basispaket `bund-basis` deckt Bundestag/Forschungsausschuss/DIP/Bundesrat/Leitmedien ab →
  keine parallelen Parlaments-/Ausschuss-/DIP-Wege.

**Neu angelegt:** 1 Paket · 8 Entitäten (`ministry-bmftr`, `institution-gwk`,
`institution-wissenschaftsrat`, `institution-dfg`, `institution-efi`, `institution-dzhw`,
`institution-eu-kommission-rtd`, `association-hrk`) · 8 Herausgeber · 12 Abrufwege.

**Publikationsreihen/Programme bewusst NICHT als Institution modelliert:**
- **BuFI** → Abrufweg unter BMFTR (`rp-wf-bmftr-bufi`), kein eigener Publisher/Entität.
- **Pakt für Forschung und Innovation / Exzellenzstrategie / Zukunftsvertrag Studium und Lehre**
  → über GWK (`rp-wf-gwk-beschluesse`) bzw. WR/DFG abgedeckt, keine eigenen Institutionen.
- **WissZeitVG / Forschungszulage / Forschungsdatengesetz** → Gesetzgebung über Bundestag
  (`bund-basis`); FDG zusätzlich als **Future Target** (noch nicht verabschiedet).
- **EFI** = Kommission (Entität `institution-efi`) mit offizieller Originalquelle e-fi.de —
  nicht über eine Bundestags-Drucksachenkopie.

**Anderen Paketen zugeordnet / ausgeschlossen:**
- BMBFSFJ, BAföG → `bildung-bund` · Familie/Jugend → `familie-bund`.
- Fachforschung (Energie-/Gesundheitsforschung) → jeweilige Fachpakete (`energie-klima-umwelt-bund`,
  `gesundheit-bund`), nur wissenschaftspolitisch Relevantes hier.
- **Max-Planck/Helmholtz/Fraunhofer/Leibniz**: keine Einzelwege — politisch Relevantes läuft
  über GWK/Pakt für Forschung und Innovation/BMFTR. Kein eindeutiger zusätzlicher Signalwert.
- **DLR / Deutsche Raumfahrtagentur / ESA**: kein Dauerweg — Raumfahrt als BMFTR-Bundespolitik
  (`rp-wf-bmftr-raumfahrt`). ESA/DLR = Future Target bei raumfahrtpolitischem Anlass.
- **ERC** → über EU-Kommission abgedeckt. **Leopoldina/Stifterverband/GEW/CHE** → nicht
  aufgenommen (Signal-Rausch bzw. andere Ressorts).

---

## 6 · Verifikationsstatus (ehrlich getrennt)

**Egress-Hinweis:** Byte-genaue HTTP-/Redirect-/Content-Type-Prüfung war in dieser Umgebung
nicht möglich (Offline-Netz-Guard; keine Live-Fetches). Trennung:

- **Nur per WebSearch fachlich bestätigt** (Domain + Existenz + Zuständigkeit):
  BMFTR `bmftr.bund.de` (seit Mai 2025, vormals BMBF, Min. Dorothee Bär) · Ausschuss 21. WP
  „Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung"
  (bundestag.de/ausschuesse/forschung, Vors. K. Lauterbach) · GWK `gwk-bonn.de` ·
  Wissenschaftsrat `wissenschaftsrat.de` · DFG `dfg.de` · EFI `e-fi.de` (Gutachten 2026 an
  Bundeskanzler übergeben) · DZHW `dzhw.eu` · HRK `hrk.de` · BMBFSFJ `bmbfsfj.bund.de`.
- **Fachlich plausibel, byte-Verifikation offen:** EU GD RTD
  `research-and-innovation.ec.europa.eu` (kanonische DG-RTD-Domain).
- **Bereits im Bestand (aktiv/geprüft):** Destatis `destatis.de`, OECD `oecd.org`.
- **Vor Aktivierung ZWINGEND nachzuholen (byte-genau):** HTTP-Status/Redirect-Ziel/finale
  Domain/Content-Type/Bot-Schutz/JS-Abhängigkeit **jedes** der 12 `site:`-Suchwege gegen
  news.google.com (Google-News-Ratenlimit ist ein bekanntes Bestandsrisiko, vgl. B1 im
  Master-Status). **Keine URLs/Feeds erfunden** — alle Wege sind Google-News-`site:`-Suchen.

---

## 7 · Dubletten-Audit (semantisch)

| Paar | Ergebnis |
|---|---|
| BMFTR ↔ BMBF | BMBF = Alias des BMFTR; **keine** zweite Entität/Publisher |
| BMFTR ↔ BMBFSFJ | BMBFSFJ nicht im Paket (anderes Ressort) |
| BMFTR ↔ GWK | Ressortpolitik ↔ Bund-Länder-Entscheidung — beide, getrennt |
| GWK ↔ Wissenschaftsrat | Entscheider ↔ Berater — beide, getrennt |
| Wissenschaftsrat ↔ DFG | Strukturberatung ↔ Förderung — beide, getrennt |
| DFG ↔ Forschungsorganisationen | MPG/Helmholtz/Fraunhofer/Leibniz nicht angelegt (über GWK/Pakt) |
| Destatis ↔ DZHW | Rohdaten ↔ Analyse — beide, getrennt; Destatis reused |
| EFI ↔ OECD | DE-jährlich ↔ international — beide; OECD reused |
| BMFTR-Bekanntmachungen ↔ Projektträger | Projektträger NICHT angelegt (operativ) |
| HRK ↔ Allianz ↔ Stifterverband | nur HRK (Tier 3); Allianz/Stifterverband nicht aufgenommen |
| DLR ↔ Deutsche Raumfahrtagentur | ein BMFTR-Raumfahrtweg statt DLR-/Agentur-Dublette |
| EU-Kommission ↔ Horizon Europe ↔ ERC | ein GD-RTD-Weg; Horizon/ERC darüber abgedeckt |
| Bundestagsausschuss ↔ DIP | über `bund-basis`; hier **kein** paralleler Weg |
| BuFI ↔ BMFTR | BuFI = BMFTR-Abrufweg, keine eigene Entität |

Technisch geprüft (Offline-Test, 50 Checks grün): keine ID-Kollision, keine Domain-Dublette,
keine BMFTR/BMBF-Dublette, keine `committee-*`-Wege, kein Bundestag/Bundesrat/DIP-Herausgeber
im Seed, keine Kollision mit dem Basis-Seed.

---

## 8 · Integrationsprotokoll (Dateien, Reproduktion, Rollback)

**Neue Dateien (additiv, keine Bestandsänderung):**
- `lib/helmut/quellenarchitektur/seeds/wissenschaft-forschung-bund.js` — deterministischer Builder
- `scripts/generate-wissenschaft-forschung-bund-seed.js` — SQL-/Rollback-Generator (reine Codegen)
- `supabase/seeds/20260724_wissenschaft_forschung_bund_seed.sql` — idempotenter PREPARED-Seed
- `supabase/seeds/20260724_wissenschaft_forschung_bund_seed_rollback.sql` — guarded Rollback
- `scripts/wissenschaft-forschung-bund-seed-test.js` — 50 Checks (vom Offline-Runner auto-eingesammelt)
- `docs/quellenarchitektur/29-wissenschaft-forschung-bund-paket.md` — dieses Manifest

**NICHT geändert:** Generator-/Registry-/Workflow-/Methodik-Code, bestehende Seeds/Migrationen,
`packages.js`/`publishers.js`/`entities.js`, `helmut-flags.json`, `vercel.json`, aktive Quellen.

**Reproduzierbar:** `node scripts/generate-wissenschaft-forschung-bund-seed.js` erzeugt SQL +
Rollback deterministisch neu. **Test:** `node scripts/wissenschaft-forschung-bund-seed-test.js`
(bzw. `npm run test:offline` — 141/141 grün).

**Eintragung (später, freigabepflichtig):** Basis-Migration/-Seed vorausgesetzt, dann
`20260724_wissenschaft_forschung_bund_seed.sql` einspielen. Wirkung: 1 Paket `prepared` +
8 Entitäten + 8 Herausgeber + 12 Wege `needs_review/manual` — **kein** Crawl, **kein** aktives
Profil bezieht das Paket, bis es freigegeben aktiviert wird. **Rollback:**
`…_rollback.sql` (guarded; fasst Destatis/OECD und alle Basisdaten nicht an).

---

## 9 · Verbleibende Risiken vor Aktivierung

1. **Byte-Verifikation offen** (§6): alle 12 `site:`-Suchwege müssen byte-genau geprüft werden
   (HTTP/Redirect/Content-Type/Bot-Schutz), inkl. Google-News-Ratenlimit-Härtung.
2. **EU-GD-RTD-Domain** nur fachlich plausibel, nicht byte-bestätigt.
3. **Ausschuss-Entität veraltet:** Die Basis-Entität `committee-bt-bildung` trägt noch den
   20.-WP-Namen „Ausschuss für Bildung und Forschung". Die Umbenennung der 21. WP
   („…Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung") ist eine **Basis-/
   `bund-basis`-Pflegeaufgabe** (aktive Daten) — bewusst **hier nicht** geändert.
4. **Aktivierungsreihenfolge:** vor `active` müssen Paket→`active` und Wege→`healthy` gesetzt
   und die Referenzzählung geprüft werden (nur dann crawlt der jeweilige Weg).
5. **Wirkungsmessung** (Ertrag/Dedup/Kosten) erst nach Aktivierung eines Testprofils möglich.
