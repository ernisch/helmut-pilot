# Paket `familie-gleichstellung-demografie-bund` — Vorbereitung (prepared, INAKTIV)

> **Status: `prepared` · vollständig INAKTIV · freigabepflichtig.** Dieses Dokument ist das
> **Paketmanifest** — es soll Folge-Threads erlauben, **ohne erneuten Repository-Vollscan**
> weiterzuarbeiten. Sprint: technische Validierung + inaktive Vorbereitung des Bundes-
> Fachthemenpakets. Kein Deployment, kein Merge, kein PR, keine SQL-Anwendung, keine DB-Änderung.

Bearbeitungsstand: 2026-07-24 · Branch `claude/validate-familie-gleichstellung-bund-obn0js` ·
Basis-Commit `035898b` (Merge #114).

---

## 1. Kanonischer Paketname — bestätigt

**Bestätigter kanonischer Schlüssel: `familie-gleichstellung-demografie-bund`**
(id `pkg-familie-gleichstellung-demografie-bund`).

Vorab-Check (Auftrag §1) ergab **keinen Konflikt**:

- Gesucht in `00-master-status.md`, den Seeds (`seeds/packages.js` `PACKAGE_DEFINITIONS`,
  `20260713_source_architecture_seed.sql`), im Datenmodell und in den Prozessdokumenten.
- **Kein** Bestandspaket `familie-gleichstellung-demografie-bund` und **kein** überlappendes
  kanonisches Paket wie `familie-jugend-integration-und-teilhabe-bund` existiert (weder in Code
  noch in Doku). Es gibt keine „verbindliche Paketlandkarte"-Datei; der maßgebliche Registrierungs-
  ort ist `PACKAGE_DEFINITIONS` + der Basis-Seed — beide enthalten dieses Thema **nicht**.
- Namenskonvention: Das `-bund`-Suffix folgt dem Bestandsmuster `die-linke-bund`; bestehende
  Fachthemenpakete tragen bare Keys (`arbeit-und-soziales`). Der Auftrag benennt durchgängig
  `familie-gleichstellung-demografie-bund` als Zielschlüssel → übernommen.
- **Wichtig zur Abgrenzung:** Der bestätigte Name enthält **Gleichstellung + Demografie**, NICHT
  „Integration/Teilhabe". **Allgemeine Integrationspolitik ist damit NICHT Teil dieses Pakets**
  (Auftrag §13).

---

## 2. Zuerst gelesene Architekturdateien (kein Vollscan)

Reihenfolge (Auftrag §2): `00-master-status.md` → `model.js` (Enums/Datenmodell) →
`seeds/packages.js` / `seeds/publishers.js` / `seeds/entities.js` (Bestand) →
`seeds/landesmodule-quellen.js` + `scripts/generate-landesmodul-seed.js` +
`scripts/landesmodul-seed-test.js` (Prepared-/Inaktiv-Muster BE/BB als Vorlage) →
`migrations/20260713_source_architecture.sql` (Tabellen/CHECKs) →
`20260713_source_architecture_seed.sql` (Bestands-IDs) → `profile-packages.js` (Aktivierungs-/
Profil-Logik) → `index.js` (`buildFullModel`) → `run-offline-tests.js` + `source-architecture-test.js`
(Test-Kopplung). **Ein Repository-Vollscan wurde vermieden**; danach nur gezielte Greps nach
BMBFSFJ/BMFSFJ/Destatis/DIP/UBSKM/ADS/BiB und den Bestands-IDs.

Direkt gefundene Bestands-Einträge (dadurch wiederverwendet, nicht neu erfunden):
`ministry-bmfsfj`, `committee-bt-familie`, `committee-bt-bildung`, `statoffice-destatis`,
`parliament-bundestag`, `parliament-bundesrat`, `government-bund`, `authority-bundesrechnungshof`,
`publisher-destatis.de`, `publisher-dip.bundestag.de`, `rp-dip`, `pkg-bund-basis`.

---

## 3. Kompetenz- und Zuständigkeitskarte (amtlich verifiziert)

Verifikation gegen **amtliche Primärquellen via WebSearch** (bundestag.de, bmbfsfj.bund.de,
antidiskriminierungsstelle.de, gesetze-im-internet.de). **Direktabruf (WebFetch) ist im Egress
403-gesperrt → keine byte-genaue Bestätigung** (siehe §10). Personen werden **dokumentiert, nicht
technisch verankert** (Auftrag §6).

| Institution | Typ | aktueller Stand | Domain | Modellierung |
|---|---|---|---|---|
| **BMBFSFJ** — Bundesministerium für **Bildung, Familie, Senioren, Frauen und Jugend** | Ministerium | seit Regierungsbildung 2025; Ministerin **Karin Prien (CDU)** (dok., nicht verankert) | `bmbfsfj.bund.de` | **neuer Publisher** `publisher-bmbfsfj.bund.de`, **Entität wiederverwendet** `ministry-bmfsfj` |
| Alias **BMFSFJ** | (historisch) | bis 2025; `bmfsfj.de` | `bmfsfj.de` | Alias der Bestandsentität (keine 2. Entität) |
| **Bundestagsausschuss** für **Bildung, Familie, Senioren, Frauen und Jugend** (a13) | Ausschuss | 21. WP, 38 Mitglieder, Vorsitz **Saskia Esken (SPD)** (dok., nicht verankert) | `bundestag.de` | **wiederverwendet** über DIP + Bund-Basis (kein neuer Weg) |
| **Bundesrat** — Ausschuss für **Familie und Senioren (FS)** | Ausschuss | (Deep-Research nannte „FSFJ" → **korrigiert**: amtlich „FS") | `bundesrat.de` | **wiederverwendet** über DIP + Bund-Basis (kein neuer Weg) |
| **Statistisches Bundesamt (Destatis)** | statistical_office | amtliche Statistik | `destatis.de` | **Publisher wiederverwendet** `publisher-destatis.de` (2 neue thematische Wege) |
| **Antidiskriminierungsstelle des Bundes (ADS)** | unabhängige Stelle (authority) | Jahresbericht 2025: **13.067 Anfragen (+15 %, Rekord)** | `antidiskriminierungsstelle.de` | **neuer Publisher + neue Entität** `authority-antidiskriminierungsstelle` |
| **UBSKM** — Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen | unabhängiges Amt (authority) | **gesetzlich verstetigt: UBSKMG in Kraft 1.7.2025** | `beauftragte-missbrauch.de` | **neuer Publisher + neue Entität** `authority-ubskm` |
| **BiB** — Bundesinstitut für Bevölkerungsforschung | Ressortforschung (BMI-nachgeordnet) | irreguläre Studien | `bib.bund.de` | **Future Target** (nicht gebaut, s. §5) |
| **DIP** | Parlamentsdokumentation | Bundestag/Bundesrat | `dip.bundestag.de` | **Weg wiederverwendet** `rp-dip` (always_on, Bund Basis) |

**Trennung sauber gehalten:** Ministerium (BMBFSFJ) ≠ Behörde/Stelle (ADS/UBSKM) ≠ Forschung
(BiB) ≠ Statistik (Destatis) ≠ Bericht (Publikation, nur als Thema) ≠ Person (nie modelliert).

---

## 4. Berichtsstände (amtlich bestätigt) + Bündelung

Alle vier Sachverständigenberichte werden über **EINEN gebündelten Weg**
`rp-fgd-bmbfsfj-berichte` (stabile Übersichtsseite
`bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung`) abgedeckt — **nicht** vier
getrennte Jahres-PDF-Wege, **nicht** vier Publisher (Auftrag §8).

| Bericht | Stand (amtlich) | Klassifikation |
|---|---|---|
| **Zehnter Familienbericht** | 2025 | veröffentlicht · regelmäßig (4-Jahres-Rhythmus) |
| **Neunter Altersbericht** | Januar 2025 | veröffentlicht · regelmäßig |
| **Vierter Gleichstellungsbericht** | **2025** (Kommission 07.01.2025, BT-Drs. 12.03.2025) | veröffentlicht · regelmäßig |
| **17. Kinder- und Jugendbericht** | 18.09.2024 | veröffentlicht (aktueller) · regelmäßig |
| **18. Kinder- und Jugendbericht** | ~2027 | **angekündigt / in Erstellung — NICHT veröffentlicht** |

Weitere: ADS-Jahresbericht (jährlich, 2025 veröffentlicht); UBSKM-Berichte/Bundeslagebild
(regelmäßig, seltener als jährlich); Destatis-Bevölkerungsvorausberechnung (regelmäßig).
**Väterreport**: letzte Ausgabe 2023 — vor Aktivierung auf Einstellung prüfen (Auftrag §13/§15).

---

## 5. Tier-Priorisierung + Abdeckungsmatrix

**Zielarchitektur erreicht: 7 Retrieval Paths (6 neu + 1 wiederverwendet), 3 neue Publisher,
2 neue Entitäten, 1 neues Paket.**

| # | Retrieval Path | Publisher | Methode | Tier | neu/reuse |
|---|---|---|---|---|---|
| 1 | `rp-dip` — DIP (Gesetzentwürfe/Anträge/Anfragen/Unterrichtungen/Ausschuss/Bundesrat/Berichte-als-Drucksache) | `publisher-dip.bundestag.de` | api | **1** | **reuse** |
| 2 | `rp-fgd-bmbfsfj-vorhaben` — BMBFSFJ Vorhaben/Gesetzgebung/zentrale Veröffentlichungen | `publisher-bmbfsfj.bund.de` | googlenews_search | **1** | neu |
| 3 | `rp-fgd-destatis-bevoelkerung-demografie` — Bevölkerung/Familien/Demografie | `publisher-destatis.de` | googlenews_search | **1** | neu (reuse Publisher) |
| 4 | `rp-fgd-bmbfsfj-berichte` — Berichte der Bundesregierung (gebündelt) | `publisher-bmbfsfj.bund.de` | html | **2** | neu |
| 5 | `rp-fgd-destatis-gleichstellung` — Gleichstellung/Erwerbsbeteiligung/Gender | `publisher-destatis.de` | googlenews_search | **2** | neu (reuse Publisher) |
| 6 | `rp-fgd-ads-jahresbericht` — ADS Jahresbericht/Publikationen | `publisher-antidiskriminierungsstelle.de` | googlenews_search | **2** | neu |
| 7 | `rp-fgd-ubskm-kinderschutz` — UBSKM Kinderschutz/Aufarbeitung/Monitoring | `publisher-beauftragte-missbrauch.de` | googlenews_search | **2** | neu |

**Tier 1 = 3 · Tier 2 = 4 · Tier 3 = 0.**

**Abdeckungsmatrix (Thema → Weg):**

| Thema | abgedeckt durch |
|---|---|
| Familienpolitik | rp-fgd-bmbfsfj-vorhaben · rp-fgd-bmbfsfj-berichte (Familienbericht) · rp-fgd-destatis-bevoelkerung-demografie · DIP |
| Gleichstellung / Gender | rp-fgd-bmbfsfj-vorhaben · rp-fgd-bmbfsfj-berichte (Gleichstellungsbericht) · rp-fgd-destatis-gleichstellung · rp-fgd-ads-jahresbericht · DIP |
| Demografie / Bevölkerung | rp-fgd-destatis-bevoelkerung-demografie · rp-fgd-bmbfsfj-berichte (Altersbericht) · DIP · *(BiB = Future)* |
| Senioren / Alter | rp-fgd-bmbfsfj-vorhaben · rp-fgd-bmbfsfj-berichte (Altersbericht) · DIP |
| Jugend / Kinder- und Jugendpolitik | rp-fgd-bmbfsfj-vorhaben · rp-fgd-bmbfsfj-berichte (KJ-Bericht) · DIP |
| **Kinderschutz** | **rp-fgd-ubskm-kinderschutz** · rp-fgd-bmbfsfj-vorhaben · DIP |
| Antidiskriminierung / AGG | rp-fgd-ads-jahresbericht · DIP |
| Parlamentarisches Verfahren | **rp-dip (wiederverwendet)** + Bund-Basis (Bundestagsausschuss + Bundesrat) |

**Future Target / Tier 3 (dokumentiert, NICHT gebaut):** BiB (Ressortforschung BMI, irregulär —
kein Destatis-Scheindublette); Bundesstiftung Gleichstellung / `gleichstellungsbericht.de`
(operativ, Bericht über BMBFSFJ-Bündel abgedeckt — keine Bericht-Domain-Dublette); BAFzA
(Förderabwicklung); Kompetenzzentrum Jugend-Check; Deutsches Zentrum für Altersfragen (DZA);
Demografieportal des Bundes und der Länder (Portal, keine Entität — Auftrag §17); Monitoringstelle
UN-KRK (Menschenrechts-Grenzbereich).

---

## 6. Integrationsprotokoll (neu vs. wiederverwendet)

**Neu angelegt (alle additiv, ON CONFLICT DO NOTHING):**
- 1 Paket `pkg-familie-gleichstellung-demografie-bund` (prepared, is_base=false, ohne Profilzuordnung).
- 2 Entitäten: `authority-antidiskriminierungsstelle`, `authority-ubskm` (Institutionen, keine Personen).
- 3 Publisher: `publisher-bmbfsfj.bund.de`, `publisher-antidiskriminierungsstelle.de`, `publisher-beauftragte-missbrauch.de`.
- 6 Retrieval Paths (alle `needs_review` + `manual`).
- 7 package_paths (6 neu + rp-dip), 6 path_expected_levels (bund), 26 path_expected_topics.

**Wiederverwendet (nur referenziert, KEINE Bestandszeile überschrieben):**
- Entität `ministry-bmfsfj` (für BMBFSFJ-Publisher — keine BMBFSFJ/BMFSFJ-Dublette).
- Publisher `publisher-destatis.de` (2 thematische Wege — keine 2. Destatis-Entität/Domain).
- Weg `rp-dip` (parlamentarischer Weg — additive package_paths-Verknüpfung, kein paralleler DIP-Weg).
- Bundestagsausschuss + Bundesrat: über DIP + `pkg-bund-basis` abgedeckt (kein neuer Weg).

**BMBFSFJ kompakt modelliert (Auftrag §11):** genau **2 Wege** — (1) Vorhaben/Gesetzgebung/zentrale
Veröffentlichungen, (2) gebündelte Berichte der Bundesregierung. Keine Ministeriums-Startseite,
keine operative Fördermeldungsmasse.

---

## 7. Dublettenmatrix (§18 — semantisch geprüft, im Test verankert)

| Prüfpaar | Ergebnis |
|---|---|
| BMBFSFJ ↔ BMFSFJ | **keine Dublette** — Bestandsentität `ministry-bmfsfj` wiederverwendet |
| BMBFSFJ ↔ Bundesregierung | **keine Dublette** — Entität ministry-bmfsfj ≠ government-bund |
| BMBFSFJ ↔ einzelne Regierungsberichte | **keine Dublette** — Berichte gebündelt (1 Weg), nie als Publisher |
| BMBFSFJ ↔ UBSKM ↔ ADS | **keine Dublette** — eigenständige Institutionen (eigene Domain/Gesetz) |
| Destatis ↔ BiB | **keine Scheindublette** — BiB nicht gebaut (Future) |
| Destatis Bevölkerung ↔ Destatis Gleichstellung | **keine Dublette** — 2 thematische Wege am SELBEN Publisher |
| DIP ↔ Bundestagsausschuss ↔ Bundesrat | **kein Parallelweg** — DIP wiederverwendet |
| Gleichstellungsbericht ↔ `gleichstellungsbericht.de` | **keine Domain-Dublette** — kein eigener Publisher |
| Person ↔ stabile ID | **keine Person** als Entität/ID (nur Institutionen) |

---

## 8. Abgrenzung zu anderen Paketen (Grenzthemen)

| Thema | Zuordnung |
|---|---|
| Allgemeine Schul-/Hochschul-/Forschungspolitik | → `bildung`/Wissenschaft (nicht dieses Paket, obwohl BMBFSFJ den Bildungsteil führt) |
| Pflegeversicherung, medizinische Versorgung | → `gesundheit-und-pflege` (BMG). **Seniorenpolitik/Altersbilder** bleiben hier |
| Bürgergeld, Rente, Arbeitsmarkt | → `arbeit-und-soziales` (BMAS). **Demografie∩Rente** = dokumentierter Grenzfall |
| Strafrechtliche Gewaltbekämpfung | → `recht`/innere Sicherheit. **UBSKM-Prävention/Aufarbeitung** bleibt hier |
| Allgemeines Antidiskriminierungsrecht | Grenzbereich Recht/Verbraucherschutz; **ADS-Gleichstellungs-/AGG-Bezug** bleibt hier |
| **Migration/Integration** | **NICHT dieses Paket** — kanonischer Name = Gleichstellung+Demografie, nicht Integration/Teilhabe |
| Kindertagesbetreuung, Vereinbarkeit Familie/Beruf | **dieses Paket** (Familien-/Jugendpolitik) |

---

## 9. Deep-Research-Korrekturen

| Deep-Research-Aussage | Befund/Korrektur |
|---|---|
| 4. Gleichstellungsbericht 2026 | **2025** (BT-Drs. 12.03.2025) — bestätigt korrigiert |
| Familien-/Altersbericht „ungeklärt" | **veröffentlicht 2025** — bestätigt |
| Bundesrat „FSFJ-Ausschuss" | amtlich **„Ausschuss für Familie und Senioren (FS)"** — korrigiert |
| Minimalarchitektur = nur 2 neue Wege | **unter-abdeckend**: §11 verlangt BMBFSFJ-Vorhaben-Weg; §5/§9 verlangen Kinderschutz (UBSKM) → auf **6 neue Wege** erweitert |
| Vorsitz Saskia Esken (SPD) | **bestätigt korrekt** (bundestag.de) — aber **nicht** technisch verankert (keine Person) |
| Ministerium/Ausschuss = fusioniert „Bildung, Familie, …" | **bestätigt** (beide Ebenen) |
| BiB nur Tier 3/Future | übernommen (Future Target, nicht gebaut) |

Grundsatz eingehalten: amtliche Primärquellen haben Vorrang; Wikipedia/Medien nur als Korroboration.

---

## 10. Technische Quellenprüfung — Verifikationsstatus

**Egress-Lage:** Direktabruf (WebFetch) liefert **HTTP 403** (Egress im Arbeitsumfeld gesperrt,
konsistent mit `00-master-status.md` „Live-Fetch … netzwerkseitig gesperrt"). Faktische Bestätigung
erfolgte über **WebSearch gegen amtliche Domains**.

| Quelle | amtlich/fachlich bestätigt | byte-genau (HTTP/Redirect/Content-Type) |
|---|---|---|
| `bmbfsfj.bund.de` + Rubrik „Berichte der Bundesregierung" | **ja** (bmbfsfj.bund.de, bundesregierung.de) | **nein — vor Aktivierung zu prüfen** |
| `destatis.de` (Publisher Bestand) | ja (Bestand) | nein — vor Aktivierung zu prüfen |
| `antidiskriminierungsstelle.de` (Jahresbericht) | **ja** (antidiskriminierungsstelle.de) | **nein — vor Aktivierung zu prüfen** |
| `beauftragte-missbrauch.de` (UBSKMG 1.7.2025) | **ja** (gesetze-im-internet.de/ubskmg) | **nein — vor Aktivierung zu prüfen** |
| `dip.bundestag.de` (rp-dip Bestand, healthy) | ja (Bestand) | Bestand — im Betrieb healthy |

**Keine URL/kein Feed/keine API erfunden.** Google-News-Suchwege nutzen ausschließlich
`news.google.com/rss/search?q=site:<domain>…` (Suchdefinition, keine fabrizierte Ziel-URL). Der
Berichtsweg zeigt auf die **stabile Übersichtsseite** (kein Jahres-PDF).

**Vor Aktivierung zwingend byte-genau zu prüfen:** alle 6 neuen Wege (HTTP-Status, Redirect-Ziel,
finale Domain, Content-Type, Bot-Schutz/JS-Abhängigkeit — insb. die `html`-Übersichtsseite, die im
Test-Egress 403 lieferte; ggf. Fallback auf `googlenews_search site:bmbfsfj.bund.de/…/berichte`).

---

## 11. Offene Risiken vor Aktivierung

1. **Byte-genaue Verifikation ausstehend** (Egress gesperrt) — alle 6 Wege.
2. **BMBFSFJ-Berichte-Weg** (`html`): Bot-Schutz/JS-Abhängigkeit möglich (403 im Test) → vor
   Aktivierung Crawlbarkeit prüfen, sonst Google-News-Fallback.
3. **Entität `ministry-bmfsfj`** trägt noch den **historischen Namen** „…für Familie, Senioren,
   Frauen und Jugend"; der neue Publisher trägt den **aktuellen** Namen (BMBFSFJ). Eine spätere
   Namens-/Alias-Angleichung der Entität ist eine **eigene, nicht-inaktive Bestandsänderung** und
   wurde bewusst **verschoben** (kein Overwrite in diesem Sprint).
4. **Väterreport** (letzte Ausgabe 2023): vor etwaiger Aufnahme auf Einstellung prüfen.
5. **18. Kinder- und Jugendbericht** (~2027): erst bei Erscheinen aktiv.
6. **Aktivierungsweg**: Dieses Paket ist bewusst **nicht** in `PACKAGE_DEFINITIONS`/Profil-Mapping
   verdrahtet (garantiert Inaktivität + kein Profil-Mapping). Aktivierung = eigener Schritt:
   Paket → `active`, Wege `needs_review`→`healthy` + `manual`→`auto`, Profil-Mapping ergänzen — je
   ausdrücklich freigabepflichtig.

---

## 12. Betrieb — Anwenden / Rollback (freigabepflichtig, NICHT ausgeführt)

- **Seed:** `supabase/seeds/20260724_familie_gleichstellung_demografie_bund_seed.sql`
  (idempotent, ON CONFLICT DO NOTHING; Voraussetzung: `20260713_source_architecture(_seed).sql`
  angewendet). **In diesem Sprint NICHT angewendet.**
- **Rollback:** `…_seed_rollback.sql` — guarded: löscht nur eigene neue Zeilen; Bestand
  (`rp-dip`, `publisher-destatis.de`, `ministry-bmfsfj`, `statoffice-destatis`) bleibt; Paket wird
  nur gelöscht, solange `prepared`.
- **Regenerierung (deterministisch):** `node scripts/generate-familie-gleichstellung-demografie-bund-seed.js`.
- **Test:** `node scripts/familie-gleichstellung-demografie-bund-seed-test.js` (wird vom
  Offline-Runner automatisch eingesammelt).

---

## 13. Dateien dieses Pakets

| Datei | Zweck |
|---|---|
| `lib/helmut/quellenarchitektur/seeds/familie-gleichstellung-demografie-bund.js` | Builder (reine Logik, prepared/inaktiv) |
| `scripts/generate-familie-gleichstellung-demografie-bund-seed.js` | Generator (Seed + Rollback) |
| `scripts/familie-gleichstellung-demografie-bund-seed-test.js` | Paketbezogener Offline-Test |
| `supabase/seeds/20260724_familie_gleichstellung_demografie_bund_seed.sql` | idempotenter PREPARED-Seed |
| `supabase/seeds/20260724_familie_gleichstellung_demografie_bund_seed_rollback.sql` | guarded Rollback |
| `docs/quellenarchitektur/29-paket-familie-gleichstellung-demografie-bund.md` | dieses Manifest |
