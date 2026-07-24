# Paket `familie-jugend-integration-und-teilhabe` — Vorbereitung (prepared, INAKTIV)

> **Status: `prepared` · vollständig INAKTIV · freigabepflichtig.** Dieses Dokument ist das
> **Paketmanifest** — es soll Folge-Threads erlauben, **ohne erneuten Repository-Vollscan**
> weiterzuarbeiten. Kein Deployment, kein Merge, kein PR, keine SQL-Anwendung, keine DB-Änderung.

Bearbeitungsstand: 2026-07-24 · Branch `claude/validate-familie-gleichstellung-bund-obn0js` ·
Basis-Commit `035898b` (Merge #114).

---

## 0. Namenskorrektur (verbindlich) — Kanonischer Paketname

**Kanonischer Schlüssel: `familie-jugend-integration-und-teilhabe`**
(id `pkg-familie-jugend-integration-und-teilhabe`).

**Vorgeschichte:** Ein früherer Lauf hatte das Paket als `familie-gleichstellung-demografie-bund`
angelegt und Integration/Teilhabe fälschlich aus dem Scope ausgeschlossen. Das war falsch.

**Repository-Prüfung (erneut, exhaustiv durchgeführt):**

- Das Repository enthält **KEINE** „Paketlandkarte"-Datei, **KEIN** `README` in
  `docs/quellenarchitektur/`, und **kein** vorbestehendes kanonisches Paket zu diesem Thema.
- Die vollständige Menge der Bestands-Paketschlüssel ist **exakt sechs**: `bund-basis`,
  `arbeit-und-soziales`, `die-linke-bund`, `regional-niedersachsen`, `berlin-basis`,
  `brandenburg-basis` (Quelle: `seeds/packages.js` `PACKAGE_DEFINITIONS` +
  `20260713_source_architecture_seed.sql`). Kein `familie-*` darunter.
- Weder `familie-jugend-integration-und-teilhabe` noch `familie-gleichstellung-demografie-bund`
  ist im Repo als Paket definiert (beide tauchten nur in den zuvor selbst geschriebenen Dateien auf).

**Schlussfolgerung:** Da das Repository selbst **keinen** kanonischen Namen für dieses Thema
enthält, kann es **keinen** der beiden Kandidaten belegen. Der bisherige Name stammte aus dem
ursprünglichen Prompt-Titel (früherer Thread). Der **verbindliche** kanonische Name stammt aus der
**Projekt-Paketlandkarte der Projektleitung**: **`familie-jugend-integration-und-teilhabe`**. Dieser
Name ist übernommen; er liegt **außerhalb** des Git-Repos (Projekt-Spezifikation), was hier
ausdrücklich transparent gemacht wird (keine erfundene Repo-Belegstelle). Das `-bund`-Suffix
entfällt (die Projektleitung nennt den Namen ohne Suffix; konsistent mit `arbeit-und-soziales`).

---

## 1. Zuerst (erneut) gelesene Architekturdateien

`00-master-status.md` · `02-zielarchitektur.md` · `seeds/packages.js` (kanonische Paketschlüssel) ·
`20260713_source_architecture_seed.sql` (Bestands-IDs) · `run-offline-tests.js` /
`source-architecture-test.js` (Kopplung) · `.github/workflows/` (Workflow-Doku = CI-Yamls, keine
Paketliste). **Kein Vollscan**; danach gezielte Greps nach `teilhabe`/`integration`/`landkarte`/
`README`/Paketschlüsseln. Bestätigt: keine Paketlandkarte-Datei, kein Quellenarchitektur-README.

---

## 2. Fachlicher Scope (erweitert)

Zentrale Felder: **Familie · Jugend · Integration · Teilhabe.** **Gleichstellung** bleibt sinnvoll
berücksichtigt (**sekundär**), ersetzt aber **nicht** Integration. Demografie/Bevölkerung bleibt als
Familienstatistik relevant.

- **Familie:** BMBFSFJ-Vorhaben · Familienbericht (Bündel) · Destatis Bevölkerung/Familien · DIP.
- **Jugend (vollständig):** BMBFSFJ ist das Jugendministerium (Vorhaben-Weg) · **17. Kinder- und
  Jugendbericht** (Bündel; 18. angekündigt ~2027) · **UBSKM** (Kinder-/Jugendschutz) · DIP. Der
  Kompetenzzentrum-Jugend-Check bleibt Future Target (selten, über BMBFSFJ/DIP abgedeckt).
- **Integration:** **Integrationsbeauftragte der Bundesregierung** (integrationsbeauftragte.de,
  auch „für Antirassismus") · Destatis Migrationshintergrund · ADS (Antidiskriminierung) · DIP.
- **Teilhabe:** **Beauftragter für die Belange von Menschen mit Behinderungen**
  (behindertenbeauftragter.de, UN-BRK/Barrierefreiheit) · ADS (Teilhabe/AGG) · DIP.
- **Gleichstellung (sekundär):** Destatis Gleichstellung/Gender · Gleichstellungsbericht (Bündel) · ADS.

---

## 3. Kompetenz- und Zuständigkeitskarte (amtlich verifiziert)

Verifikation gegen **amtliche Primärquellen via WebSearch**. **Direktabruf (WebFetch) 403-gesperrt →
keine byte-genaue Bestätigung** (siehe §8). Personen werden **dokumentiert, nicht verankert**.

| Institution | Typ | Stand | Domain | Modellierung |
|---|---|---|---|---|
| **BMBFSFJ** — Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend | Ministerium | Ministerin Karin Prien (CDU, dok.) | `bmbfsfj.bund.de` | **neuer Publisher**, Entität **wiederverwendet** `ministry-bmfsfj` (Alias BMFSFJ) |
| **Bundestagsausschuss** Bildung, Familie, Senioren, Frauen und Jugend (a13) | Ausschuss | Vorsitz Saskia Esken (SPD, dok.) | `bundestag.de` | **wiederverwendet** über DIP + Bund-Basis |
| **Bundesrat** — Ausschuss für Familie und Senioren (FS) | Ausschuss | — | `bundesrat.de` | **wiederverwendet** über DIP + Bund-Basis |
| **Destatis** | statistical_office | amtliche Statistik | `destatis.de` | **Publisher wiederverwendet** (2 Wege) |
| **Integrationsbeauftragte der Bundesregierung** (auch für Antirassismus) | authority | seit 2025 beim BMAS; Staatsministerin Natalie Pawlik (dok.) | `integrationsbeauftragte.de` | **neuer Publisher + Entität** `authority-integrationsbeauftragte` |
| **Beauftragter f. d. Belange von Menschen mit Behinderungen** | authority | UN-BRK-Landeskoordination, Schlichtungsstelle BGG; Jürgen Dusel (dok.) | `behindertenbeauftragter.de` | **neuer Publisher + Entität** `authority-behindertenbeauftragter` |
| **Antidiskriminierungsstelle des Bundes (ADS)** | authority | Jahresbericht 2025: 13.067 Anfragen | `antidiskriminierungsstelle.de` | **neuer Publisher + Entität** `authority-antidiskriminierungsstelle` |
| **UBSKM** | authority | UBSKMG in Kraft 1.7.2025 | `beauftragte-missbrauch.de` | **neuer Publisher + Entität** `authority-ubskm` |
| **BiB** — Bundesinstitut für Bevölkerungsforschung | Ressortforschung (BMI) | irregulär | `bib.bund.de` | **Future Target** (nicht gebaut) |
| **DIP** | Parlamentsdokumentation | Bundestag/Bundesrat | `dip.bundestag.de` | **Weg wiederverwendet** `rp-dip` |

Beide neuen „Beauftragte"-Ämter sind **organisatorisch beim BMAS** angesiedelt — Boundary-Hinweis
in §7. Sie sind aber die fachlich zuständigen **politischen Stimmen** für Integration bzw. Teilhabe
und gehören laut kanonischem Paketnamen in **dieses** Paket.

---

## 4. Berichtsstände (amtlich bestätigt) + Bündelung

Vier Sachverständigenberichte über **EINEN** gebündelten Weg `rp-fjit-bmbfsfj-berichte` (stabile
Übersichtsseite `bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung`).

| Bericht | Stand | Klassifikation |
|---|---|---|
| Zehnter Familienbericht | 2025 | veröffentlicht · regelmäßig |
| Neunter Altersbericht | Januar 2025 | veröffentlicht · regelmäßig |
| Vierter Gleichstellungsbericht | 2025 (BT-Drs. 12.03.2025) | veröffentlicht · regelmäßig |
| **17. Kinder- und Jugendbericht** | 18.09.2024 | veröffentlicht (aktuell) · regelmäßig — **Jugend-Kern** |
| 18. Kinder- und Jugendbericht | ~2027 | angekündigt / in Erstellung — NICHT veröffentlicht |

---

## 5. Tier-Priorisierung + Abdeckungsmatrix

**9 Retrieval Paths (8 neu + 1 wiederverwendet), 5 neue Publisher, 4 neue Entitäten, 1 neues Paket.**

| # | Retrieval Path | Publisher | Methode | Tier | neu/reuse |
|---|---|---|---|---|---|
| 1 | `rp-dip` — DIP (Gesetze/Anträge/Anfragen/Unterrichtungen/Ausschuss/Bundesrat/Berichte-Drs.) | `publisher-dip.bundestag.de` | api | **1** | **reuse** |
| 2 | `rp-fjit-bmbfsfj-vorhaben` — BMBFSFJ Vorhaben/Gesetzgebung (Familie/Jugend/Senioren/Gleichstellung) | `publisher-bmbfsfj.bund.de` | googlenews | **1** | neu |
| 3 | `rp-fjit-destatis-bevoelkerung-familie` — Bevölkerung/Familien/Migrationshintergrund | `publisher-destatis.de` | googlenews | **1** | neu (reuse Publisher) |
| 4 | `rp-fjit-bmbfsfj-berichte` — Berichte der Bundesregierung (gebündelt) | `publisher-bmbfsfj.bund.de` | html | **2** | neu |
| 5 | `rp-fjit-destatis-gleichstellung` — Gleichstellung/Erwerbsbeteiligung | `publisher-destatis.de` | googlenews | **2** | neu (reuse Publisher) |
| 6 | `rp-fjit-ads-antidiskriminierung` — ADS Jahresbericht (Integration/Teilhabe/Gleichstellung) | `publisher-antidiskriminierungsstelle.de` | googlenews | **2** | neu |
| 7 | `rp-fjit-ubskm-kinderschutz` — UBSKM Kinder-/Jugendschutz | `publisher-beauftragte-missbrauch.de` | googlenews | **2** | neu |
| 8 | `rp-fjit-integration` — Integrationsbeauftragte (Integration/Teilhabe/Antirassismus) | `publisher-integrationsbeauftragte.de` | googlenews | **2** | neu |
| 9 | `rp-fjit-teilhabe` — Behindertenbeauftragter (Teilhabe/Inklusion/UN-BRK) | `publisher-behindertenbeauftragter.de` | googlenews | **2** | neu |

**Tier 1 = 3 · Tier 2 = 6 · Tier 3 = 0.**

**Abdeckungsmatrix (Thema → Weg):**

| Thema | abgedeckt durch |
|---|---|
| Familie | bmbfsfj-vorhaben · bmbfsfj-berichte (Familienbericht) · destatis-bevoelkerung-familie · DIP |
| **Jugend** | bmbfsfj-vorhaben · **bmbfsfj-berichte (KJ-Bericht)** · **ubskm-kinderschutz** · DIP |
| **Integration** | **integration (Integrationsbeauftragte)** · destatis (Migrationshintergrund) · ads-antidiskriminierung · DIP |
| **Teilhabe** | **teilhabe (Behindertenbeauftragter)** · ads-antidiskriminierung · DIP |
| Kinderschutz | ubskm-kinderschutz · bmbfsfj-vorhaben · DIP |
| Antidiskriminierung | ads-antidiskriminierung · integration (Antirassismus) · DIP |
| Gleichstellung (sekundär) | destatis-gleichstellung · bmbfsfj-berichte (Gleichstellungsbericht) · ads · DIP |
| Demografie/Bevölkerung | destatis-bevoelkerung-familie · bmbfsfj-berichte (Altersbericht) · *(BiB = Future)* |
| Parlamentarisches Verfahren | **rp-dip (wiederverwendet)** + Bund-Basis (Ausschuss + Bundesrat) |

**Future Target / nicht gebaut:** BiB (Ressortforschung BMI, irregulär); Bundesstiftung Gleichstellung /
`gleichstellungsbericht.de` (Bericht über Bündel abgedeckt); BAFzA; Kompetenzzentrum Jugend-Check;
DZA; Demografieportal; Monitoringstelle UN-KRK; BAMF (operativ).

---

## 6. Integrationsprotokoll (neu vs. wiederverwendet)

**Neu (additiv, ON CONFLICT DO NOTHING):** 1 Paket · 4 Entitäten (ADS, UBSKM,
Integrationsbeauftragte, Behindertenbeauftragter — Institutionen, keine Personen) · 5 Publisher
(BMBFSFJ, ADS, UBSKM, Integrationsbeauftragte, Behindertenbeauftragter) · 8 Retrieval Paths (alle
needs_review + manual) · 9 package_paths · 8 path_expected_levels · 40 path_expected_topics.

**Wiederverwendet (kein Overwrite):** Entität `ministry-bmfsfj` · Publisher `publisher-destatis.de`
(2 Wege) · Weg `rp-dip` (parlamentarisch); Bundestagsausschuss + Bundesrat via DIP + Bund-Basis.

**BMBFSFJ kompakt:** 2 Wege (Vorhaben + Berichte-Bündel). Keine Startseite, keine Fördermasse.

---

## 7. Dubletten- & Abgrenzungsmatrix (§18)

| Prüfpaar | Ergebnis |
|---|---|
| BMBFSFJ ↔ BMFSFJ / Bundesregierung | keine Dublette (Entität ministry-bmfsfj wiederverwendet, ≠ government-bund) |
| Berichte ↔ einzelne Regierungsberichte | keine Dublette — 1 gebündelter Weg, nie als Publisher |
| BMBFSFJ ↔ UBSKM ↔ ADS ↔ Integrationsb. ↔ Behindertenb. | eigenständige Institutionen (eigene Domain/Recht) |
| Destatis ↔ BiB | keine Scheindublette (BiB Future) |
| Destatis Bevölkerung ↔ Destatis Gleichstellung | 2 Wege am SELBEN Publisher |
| DIP ↔ Ausschuss ↔ Bundesrat | kein Parallelweg — DIP wiederverwendet |
| Gleichstellungsbericht ↔ `gleichstellungsbericht.de` | keine Domain-Dublette |
| Person ↔ stabile ID | keine Person als Entität/ID |
| **Integration/Teilhabe ↔ `arbeit-und-soziales`** | **Boundary:** Integrationsb./Behindertenb. sind organisatorisch beim BMAS, aber als politische Stimmen für Integration/Teilhabe fachlich diesem Paket zugeordnet. Keine Publisher-/Domain-Kollision mit arbeit-und-soziales (dort google-news-Ausschuss-Themen, kein eigener Beauftragten-Publisher). Disability-Teilhabe im arbeitsrechtlichen SGB-IX-Sinn bleibt bei arbeit-und-soziales. |

**Abgrenzung zu anderen Paketen:** Schul-/Hochschul-/Forschung → Bildung/Wissenschaft;
Pflegeversicherung/med. Versorgung → Gesundheit-und-Pflege; Bürgergeld/Rente/Arbeitsmarkt +
SGB-IX-Arbeitsförderung → Arbeit-und-Soziales; strafrechtliche Gewaltverfolgung → Recht/Innere
Sicherheit. **Integration & Teilhabe sind laut kanonischem Namen Teil DIESES Pakets.**

---

## 8. Technische Quellenprüfung — Verifikationsstatus

**Egress-Direktabruf (WebFetch) 403** → faktische Bestätigung via **WebSearch gegen amtliche
Domains**. **Byte-genau (HTTP/Redirect/Content-Type) für alle 8 neuen Wege NICHT verifiziert — vor
Aktivierung zwingend zu prüfen.**

| Quelle | amtlich/fachlich bestätigt | byte-genau |
|---|---|---|
| `bmbfsfj.bund.de` + Rubrik „Berichte der Bundesregierung" | ja | **nein — vor Aktivierung** |
| `destatis.de` (Bestand) | ja | nein — vor Aktivierung |
| `integrationsbeauftragte.de` (Integrationsbeauftragte, beim BMAS) | ja | **nein — vor Aktivierung** |
| `behindertenbeauftragter.de` (UN-BRK/Schlichtungsstelle BGG) | ja | **nein — vor Aktivierung** |
| `antidiskriminierungsstelle.de` (Jahresbericht 2025) | ja | nein — vor Aktivierung |
| `beauftragte-missbrauch.de` (UBSKMG 1.7.2025) | ja | nein — vor Aktivierung |
| `dip.bundestag.de` (rp-dip Bestand, healthy) | ja (Bestand) | Bestand |

**Keine URL/kein Feed/keine API erfunden.** Google-News-Suchwege nutzen nur
`news.google.com/rss/search?q=site:<domain>…`. Der Berichtsweg zeigt auf die stabile Übersichtsseite.

---

## 9. Offene Risiken vor Aktivierung

1. Byte-genaue Verifikation aller 8 Wege ausstehend (Egress 403).
2. `html`-Berichtsweg evtl. bot-geblockt → Google-News-Fallback vor Aktivierung prüfen.
3. Entität `ministry-bmfsfj` trägt noch den historischen Namen; Angleichung ist eigene,
   nicht-inaktive Bestandsänderung (bewusst verschoben).
4. Integrationsbeauftragte/Behindertenbeauftragter sind beim BMAS angesiedelt → Boundary zu
   `arbeit-und-soziales` bei Aktivierung erneut prüfen (Dublettengefahr nur bei späterer
   arbeit-und-soziales-Erweiterung um dieselben Domains).
5. 18. Kinder- und Jugendbericht erst ~2027 aktiv.
6. Kanonischer Name stammt aus der Projekt-Paketlandkarte (außerhalb Repo) — bei Repo-Aufnahme
   einer Paketlandkarte-Datei gegenprüfen.
7. Aktivierung = eigener freigabepflichtiger Schritt (Paket → active, Wege review, Profil-Mapping
   ergänzen). Bewusst **nicht** in `PACKAGE_DEFINITIONS`/Profil-Mapping verdrahtet.

---

## 10. Dateien dieses Pakets

| Datei | Zweck |
|---|---|
| `lib/helmut/quellenarchitektur/seeds/familie-jugend-integration-und-teilhabe.js` | Builder (prepared/inaktiv) |
| `scripts/generate-familie-jugend-integration-und-teilhabe-seed.js` | Generator (Seed + Rollback) |
| `scripts/familie-jugend-integration-und-teilhabe-seed-test.js` | Paketbezogener Offline-Test |
| `supabase/seeds/20260724_familie_jugend_integration_und_teilhabe_seed.sql` | idempotenter PREPARED-Seed |
| `supabase/seeds/20260724_familie_jugend_integration_und_teilhabe_seed_rollback.sql` | guarded Rollback |
| `docs/quellenarchitektur/29-paket-familie-jugend-integration-und-teilhabe.md` | dieses Manifest |

*Der frühere Dateisatz `…familie-gleichstellung-demografie-bund…` wurde vollständig entfernt.*
