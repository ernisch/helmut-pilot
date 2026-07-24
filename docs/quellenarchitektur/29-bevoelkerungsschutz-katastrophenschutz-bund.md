# 29 — Quellenpaket `bevoelkerungsschutz-katastrophenschutz-bund` (Bund, ziviler Bevölkerungs- & Katastrophenschutz)

**Stand:** 2026-07-24 · **Status: `prepared` / vollständig INAKTIV / freigabepflichtig** ·
**Modus:** rein additiv, kein Deployment, kein Merge, kein PR, keine Produktionsänderung, keine
DB-Anwendung, keine Aktivierung.

> Dieses Dokument ist zugleich **fachlich-technische Paketdoku, Kompetenzkarte,
> Integrationsprotokoll, Dubletten-/Abdeckungsmatrix und kompaktes Paketmanifest**. Es soll
> künftigen Threads erlauben, **ohne erneuten Repository-Vollscan** weiterzuarbeiten (§21 des
> Auftrags). Der Bau folgt exakt dem etablierten PREPARED-Muster der Landesmodule Berlin/
> Brandenburg (Doc 15, `20260717_landesmodul_be_bb_seed.sql`).

---

## 0. Kurzfazit (für den eiligen Thread)

- **Neues Paket:** `pkg-bevoelkerungsschutz-katastrophenschutz-bund` (key
  `bevoelkerungsschutz-katastrophenschutz-bund`), `status=prepared`, `is_base=false`,
  `political_level=bund`, `geo-bund`, **kein Profil-Mapping**, **kein aktiver Crawl-Plan**.
- **9 Retrieval Paths gesamt** = **7 neu** (alle `needs_review` + `manual` = inaktiv) + **2
  wiederverwendet** (`rp-dip`, `rp-committee-inneres`, nur additiv zugeordnet, **nicht** geändert).
- **4 neue Herausgeber** (BMI, BBK, THW, IMK), **1 wiederverwendet** (Bundesrechnungshof).
- **3 neue Entitäten** (BBK, THW, IMK); **BMI + Bundesrechnungshof wiederverwendet** (nicht dupliziert).
- **Tiering:** Tier 1 = 5 · Tier 2 = 3 · Tier 3 = 1.
- **Artefakte:** `lib/helmut/quellenarchitektur/seeds/bevoelkerungsschutz-quellen.js` (Modell),
  `scripts/generate-bevoelkerungsschutz-seed.js` (Generator),
  `scripts/bevoelkerungsschutz-seed-test.js` (48 Prüfungen, grün),
  `supabase/seeds/20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed(.rollback).sql`.
- **Offline-Suite:** 141/141 grün (inkl. neuem Test). Haupt-Seed + Basismodelle **byte-identisch**.
- **PR:** **nein** (nicht angefordert). **Egress:** blockiert (Proxy 403) → keine Byte-Verifikation.

---

## 1. Kompetenz- und Zuständigkeitskarte (amtlich, WebSearch-verifiziert Juli 2026)

| Institution | Institutionstyp (Modell) | Rolle im Bevölkerungsschutz | Rechts-/Organisationsgrundlage | Modelliert als |
|---|---|---|---|---|
| **BMI** — Bundesministerium des Innern | Ministerium (`ministry`) | Politische Steuerung, Ressortverantwortung, Resilienzstrategie, federführend Risikoanalyse des Bundes | Geschäftsordnung Bundesregierung | Entität `ministry-bmi` (bestehend) + **neuer** Herausgeber `publisher-bmi.bund.de` |
| **BBK** — Bundesamt für Bevölkerungsschutz und Katastrophenhilfe | Behörde (`authority`) | Zivilschutz nach ZSKG, Planung/Koordination, Warnsysteme, Risikoanalysen, LÜKEX | ZSKG; BBK-Errichtungsgesetz | **neue** Entität `authority-bbk` + Herausgeber `publisher-bbk.bund.de` |
| **THW** — Bundesanstalt Technisches Hilfswerk | Behörde/Bundesanstalt (`authority`) | Technisch-logistische Katastrophenhilfe, Zivilschutz, Ehrenamt, Ausstattung/Bau | THW-Gesetz | **neue** Entität `authority-thw` + Herausgeber `publisher-thw.de` |
| **IMK** — Ständige Konferenz der Innenminister und -senatoren der Länder | Bund-Länder-Gremium (`other_institution`) | Bund-Länder-Koordination, Beschlüsse (AK V: Feuerwehr/Rettung/Katastrophenschutz/zivile Verteidigung) | Konsensbasierte Zusammenarbeit; IMK-GO | **neue** Entität `institution-imk` + Herausgeber `publisher-innenministerkonferenz.de` |
| **Deutscher Bundestag / DIP / Innenausschuss** | Parlament (`parliament`) / Ausschuss (`committee`) | Gesetzgebung, Kontrolle, Risikoanalyse-Berichte, Haushalte BBK/THW | GG, GO-BT | Entität `parliament-bundestag` + Weg `rp-dip` (wiederverwendet); Ausschuss `committee-bt-inneres` + Weg `rp-committee-inneres` (wiederverwendet) |
| **Bundesrechnungshof** | Behörde (`authority`) | Haushalts-/Wirtschaftlichkeitsprüfungen (BBK, THW, GeKoB, §13-ZSKG-Ausstattung) | BHO | Entität `authority-bundesrechnungshof` + Herausgeber `publisher-bundesrechnungshof.de` (beide bestehend) + **neuer** Weg |

**Nicht als Institution modelliert (bewusst):**
- **Arbeitskreis V der IMK** — arbeitet im Hintergrund; Ergebnisse erscheinen **über die
  IMK-Beschlüsse** (WebSearch bestätigt) → **kein eigener Publisher/Weg** (verhindert
  IMK↔AK-V-Dublette).
- **GMLZ** (Gemeinsames Melde- und Lagezentrum) & **GeKoB** (Gemeinsames Kompetenzzentrum
  Bevölkerungsschutz) — **keine eigenständige öffentliche Publikationsplattform**; GeKoB ist
  auf `bbk.bund.de` dokumentiert. → **Future Target**, Abdeckung über BBK/BMI/DIP/BRH.
- **NINA, MoWaS, Cell Broadcast** — operative Warn-Produkte/-Infrastruktur, **keine
  Institutionen** (erscheinen nur als **Suchbegriffe** im BBK-Warnweg).
- **LÜKEX** — strategische **Übungsreihe**, keine Institution (eigener BBK-Unterweg, Tier 2).
- **PiB-16, ZSKG, KRITIS-Dachgesetz, Pakt für Bevölkerungsschutz** — Publikation/Gesetze/
  Vorhaben, **keine Publisher** (abgedeckt über BBK bzw. DIP).
- **Keine Personen** (BBK-/THW-Präsidium, IMK-Vorsitz) in stabilen IDs.

---

## 2. Kompaktes Paketmanifest (exakte IDs — Quelle der Wahrheit)

**Paket** (`source_packages`):
`pkg-bevoelkerungsschutz-katastrophenschutz-bund` · key `bevoelkerungsschutz-katastrophenschutz-bund`
· `status=prepared` · `is_base=false` · `political_level=bund` · `geography_id=geo-bund` ·
`required_classes={}`.

**Neue Entitäten** (`political_entities`, 3):

| id | entity_type | name | level | aliases |
|---|---|---|---|---|
| `authority-bbk` | authority | Bundesamt für Bevölkerungsschutz und Katastrophenhilfe | bund | BBK |
| `authority-thw` | authority | Bundesanstalt Technisches Hilfswerk | bund | THW |
| `institution-imk` | other_institution | Ständige Konferenz der Innenminister und -senatoren der Länder | — | IMK, Innenministerkonferenz |

**Herausgeber** (`publishers`, 4 neu + 1 bestehend via `DO NOTHING`):

| id | domain | typ | evidence_role | entity_id | neu? |
|---|---|---|---|---|---|
| `publisher-bmi.bund.de` | bmi.bund.de | ministry | official_primary | `ministry-bmi` (best.) | **neu** |
| `publisher-bbk.bund.de` | bbk.bund.de | authority | official_primary | `authority-bbk` | **neu** |
| `publisher-thw.de` | thw.de | authority | official_primary | `authority-thw` | **neu** |
| `publisher-innenministerkonferenz.de` | innenministerkonferenz.de | authority | official_primary | `institution-imk` | **neu** |
| `publisher-bundesrechnungshof.de` | bundesrechnungshof.de | authority | data_source | `authority-bundesrechnungshof` | bestehend |

**Retrieval Paths** (7 neu, alle `method=googlenews_search`, `parser=googlenews-batchexecute`,
`status=needs_review`, `activation_mode=manual`):

| id | Herausgeber | Tier | is_critical | Suchdefinition (site:-scoped) |
|---|---|---|---|---|
| `rp-bevschutz-bmi-strategie` | BMI | **1** | ja | `site:bmi.bund.de (Bevölkerungsschutz OR Resilienzstrategie OR Resilienz OR Zivilschutz OR Katastrophenschutz OR Verteidigungsfähigkeit)` |
| `rp-bevschutz-bbk-strategie-risiko` | BBK | **1** | ja | `site:bbk.bund.de (Risikoanalyse OR Resilienz OR Bevölkerungsschutz OR Zivilschutz OR Katastrophenschutz OR KRITIS)` |
| `rp-bevschutz-imk-beschluesse` | IMK | **1** | ja | `site:innenministerkonferenz.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR Verteidigungsfähigkeit OR Beschluss)` |
| `rp-bevschutz-bbk-warnung` | BBK | 2 | nein | `site:bbk.bund.de (Warntag OR Warnung OR Warnsystem OR Warnmittel OR MoWaS OR NINA OR Sirenen)` |
| `rp-bevschutz-thw-jahresbericht` | THW | 2 | nein | `site:thw.de (Jahresbericht OR Jahresrückblick OR Zivilschutz OR Bauprogramm OR Ausstattung OR Ehrenamt)` |
| `rp-bevschutz-bbk-luekex` | BBK | 2 | nein | `site:bbk.bund.de (LÜKEX OR Krisenmanagement OR Krisenübung OR Stabsrahmenübung)` |
| `rp-bevschutz-brh-pruefungen` | Bundesrechnungshof | 3 | nein | `site:bundesrechnungshof.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR BBK OR THW OR ZSKG OR GeKoB)` |

**Wiederverwendete Wege** (nur additive `package_paths`, **nicht** verändert):

| id | Tier | Warum wiederverwendet |
|---|---|---|
| `rp-dip` | **1** | DIP-API (`always_on`): parlamentarische Kernquelle — deckt Risikoanalyse-Berichte, ZSKG/KRITIS-Gesetzgebung, Pakt-Drucksachen (z. B. Antwort BReg), BBK/THW-Haushalt, BRH-Unterrichtungen ab. |
| `rp-committee-inneres` | **1** | Innenausschuss-Weg — enthält **bereits** „Bevölkerungsschutz" in der Suchdefinition. |

**package_paths (9):** alle 7 neuen + `rp-dip` + `rp-committee-inneres` → das neue Paket.
**path_expected_levels (7):** je neuer Weg `bund`. **path_expected_geographies (7):** je neuer Weg `geo-bund`.

---

## 3. Tiering (§17)

| Tier | Bedeutung | Wege |
|---|---|---|
| **Tier 1** (dauerhaft unverzichtbar) | 5 | `rp-bevschutz-bmi-strategie`, `rp-bevschutz-bbk-strategie-risiko`, `rp-bevschutz-imk-beschluesse`, `rp-dip` (wv.), `rp-committee-inneres` (wv.) |
| **Tier 2** (periodisch) | 3 | `rp-bevschutz-bbk-warnung` (Warntag jährl.), `rp-bevschutz-thw-jahresbericht` (jährl.), `rp-bevschutz-bbk-luekex` (Übungszyklus) |
| **Tier 3** (ereignisbezogen) | 1 | `rp-bevschutz-brh-pruefungen` (unregelmäßig) |

Ziel „~7–10 Wege, max 4–5 neue Publisher": **9 Wege, 4 neue Publisher** — eingehalten.
BBK bewusst auf **3 gezielte Unterwege** begrenzt (Strategie/Risiko, Warnung, LÜKEX) — **keine
Startseiten-Tier-1-Übernahme**, keine Unterseiten-Fragmentierung, keine operativen
Warn-/Pressemeldungen als Kernbestand.

---

## 4. Dublettenmatrix (semantischer Check, §20)

| Paar | Ergebnis | Begründung |
|---|---|---|
| BMI ↔ BBK | getrennt | Ministerium (Steuerung) vs. Behörde (Umsetzung) — verschiedene Ebenen, verschiedene Domains/IDs. |
| BMI ↔ IMK | getrennt | Bund-Ministerium vs. Länder-Gremium. |
| BBK ↔ THW | getrennt | Behörde (Planung/Warnung) vs. Bundesanstalt (operativ). |
| BBK ↔ GMLZ / GeKoB | keine Dublette | GMLZ/GeKoB nicht modelliert (Future Target, über BBK abgedeckt). |
| BBK ↔ LÜKEX | keine Scheininstitution | LÜKEX ist Übungsreihe = BBK-Unterweg, keine Entität. |
| BBK ↔ Warntag | getrennt als Weg | Warntag-Auswertung = eigener BBK-Weg; Warntag ist kein Publisher. |
| Warntag ↔ NINA ↔ MoWaS ↔ Cell Broadcast | keine Institutionen | nur Suchbegriffe im BBK-Warnweg. |
| IMK ↔ Arbeitskreis V | keine Dublette | AK V nur über IMK-Beschlüsse; kein eigener Publisher. |
| DIP ↔ Innenausschuss | keine Parallelität | beide **bestehend**, additiv zugeordnet; kein neuer paralleler Weg. |
| DIP ↔ Risikoanalyse-Berichte | kein Parallelweg | Bund-Risikoanalyse geht **jährlich als Drucksache** an den BT → über `rp-dip` abgedeckt. |
| DIP ↔ ZSKG / KRITIS-Gesetzgebung | kein Parallelweg | Gesetzesverlauf über DIP; kein eigener Gesetzes-Weg. |
| BRH ↔ BMI/BBK | getrennt | BRH `data_source` (Kontrolle) vs. `official_primary`; **Publisher wiederverwendet**, neuer topischer Weg (bestehender BRH-Weg ist soziales-spezifisch). |
| BMI ↔ BMIH (histor.) | keine Dublette | `ministry-bmi` trägt korrekten aktuellen Namen; „…und für Heimat" nur historischer Alias, **nicht** neu angelegt. |
| Innenausschuss ↔ „Ausschuss für Inneres und Heimat" | keine Dublette | derselbe bestehende `committee-bt-inneres` wiederverwendet; Altname = Alias (Bestandsdrift, §7). |
| zivile KRITIS-Resilienz ↔ allg. Cybersicherheit/BSI | getrennt | nur ziviler Resilienzanteil; **kein** BSI-Publisher/-Weg. |
| Bevölkerungsschutz ↔ Innere Sicherheit | getrennt | BKA/BPol/Verfassungsschutz/Terror **ausgeschlossen** (→ `innere-sicherheit-bund`). |

**ID-/Slug-/Domain-/URL-Kollisionen:** 0 (Test „keine doppelte Domain/ID", `DO NOTHING` schützt Bestand).

---

## 5. Abdeckungsmatrix nach politischen Funktionen (§21)

| Politische Funktion | Abdeckung | Weg(e) |
|---|---|---|
| Strategische Steuerung | ✅ Tier 1 | `rp-bevschutz-bmi-strategie` (Resilienzstrategie) |
| Fachliche Umsetzung / Risikobewertung | ✅ Tier 1 | `rp-bevschutz-bbk-strategie-risiko` |
| Bund-Länder-Steuerung | ✅ Tier 1 | `rp-bevschutz-imk-beschluesse` |
| Parlamentarische Kontrolle / Gesetzgebung / Risikoanalyse-Berichte | ✅ Tier 1 (wv.) | `rp-dip`, `rp-committee-inneres` |
| Warnsystem-Evaluierung | ✅ Tier 2 | `rp-bevschutz-bbk-warnung` |
| Strategische Krisenübungen | ✅ Tier 2 | `rp-bevschutz-bbk-luekex` |
| Operative Zivilschutzentwicklung | ✅ Tier 2 | `rp-bevschutz-thw-jahresbericht` |
| Haushalts-/Wirtschaftlichkeitskontrolle | ✅ Tier 3 | `rp-bevschutz-brh-pruefungen` |
| Lagebilder (GMLZ) | ❌ nicht öffentlich | Future Target |
| Europäische Einbindung (rescEU/UCPM) | ⚠️ ereignisbezogen | Future Target (siehe §7) |

---

## 6. Korrigierte DeepSeek-Aussagen (§5, §21) — belegt via WebSearch

1. **BBK-Startseite als täglicher Tier-1-Weg** → **korrigiert**: statt Startseite **3 gezielte
   BBK-Unterwege** (Strategie/Risiko Tier 1, Warnung Tier 2, LÜKEX Tier 2). Keine operativen
   Pressemeldungen als Kernbestand.
2. **Zuständiger Ausschuss** → DeepSeek „Ausschuss für Inneres und Heimat". **Korrektur:** 21. WP
   amtlich **Innenausschuss** (Bundestag nutzt diese Bezeichnung in den Primärdokumenten der
   21. WP: Sitzungs-Tagesordnung „Innenausschuss 21. Wahlperiode", Konstituierungs-Meldung,
   URL `/inneres`). Altname = historischer Alias.
3. **PiB-16 = regelmäßige politische Kernquelle** → **korrigiert**: PiB-16 ist eine
   **methodische** BBK-Publikation. Die **parlamentarischen Risikoanalyse-Berichte des Bundes**
   (BMI federführend, BBK koordiniert; der Bundestag wird **jährlich** unterrichtet) laufen über
   **Drucksachen** und sind bereits via `rp-dip` abgedeckt → **kein Parallelweg**.
4. **„Fortschrittsbericht 2026 erwartet"** → **nicht als veröffentlicht bestätigt**. Amtlich:
   Strategie 2022, ressortübergreifender Umsetzungsplan **Juli 2024**, erster Fortschrittsbericht
   **für Anfang 2026 angekündigt** (danach 3-Jahres-Rhythmus); die Nationale Plattform bereitet
   eine Bewertung vor. **Keine bestätigte Veröffentlichung** → nur als Erwartung dokumentiert,
   **nicht** als Publikation modelliert.
5. **Pakt für den Bevölkerungsschutz / „10 Mrd."** → **präzisiert**: IMK Hamburg **19.06.2026**;
   Kabinettsbeschluss, **~10,2 Mrd. €** bis 2029; „Fahrplan Zivile Verteidigungsfähigkeit 2029"
   (ressortübergreifend, unter Bundesführung). Politisches **Vorhaben**, keine Institution →
   abgedeckt über BMI + IMK + DIP.
6. **KRITIS-Dachgesetz „vom 11. März 2026"** → **korrigiert**: verkündet **16.03.2026** (BGBl.
   2026 I Nr. 66), **in Kraft seit 17.03.2026**; setzt EU-CER-Richtlinie 2022/2557 um. Nur der
   **zivile Resilienzanteil** gehört hierher; allgemeine Cybersicherheit/BSI **ausgeschlossen**.
   Gesetzesverlauf über DIP.
7. **BBK-Präsident „Ralph Tiesler"** → **überholt**: Tiesler Anfang 2026 verabschiedet; seit
   April 2026 neue BBK-Leitung. **Bestätigt die Regel: keine Personen in stabilen IDs.**
8. **BMI** → aktuell **„Bundesministerium des Innern"** (Rückbenennung 06.05.2025); „…und für
   Heimat" (BMIH) = historischer Alias. `ministry-bmi` trägt bereits den korrekten Namen.

---

## 7. Future Targets & Ausschlüsse

**Future Targets** (fachlich wichtig, aber keine stabile eigene Quelle — dokumentiert, **nicht**
modelliert):
- **GMLZ** — keine öffentliche Publikationsplattform (Lagebilder nicht öffentlich). Beobachtung
  über BBK + DIP.
- **GeKoB** — keine eigene Plattform (auf `bbk.bund.de` dokumentiert, BRH-Prüfung existiert).
  Über BBK/BMI + `rp-bevschutz-brh-pruefungen` (GeKoB im Suchterm) abgedeckt.
- **EU-Katastrophenschutzverfahren / rescEU** — ereignisbezogen, keine deutsche Dauerquelle.
  Kandidat für einen späteren Tier-3-EU-Weg (eigene Freigabe).

**Ausgeschlossen → andere Pakete / kein Kernbestand:**
- **Innere Sicherheit:** BKA, Bundespolizei, Verfassungsschutz, Terrorismus, Extremismus,
  allg. Polizei-/Sicherheitsgesetzgebung → **`innere-sicherheit-bund`** (in diesem Branch **nicht
  vorhanden**; nicht angelegt, nicht bearbeitet).
- **Digitales/Cyber:** allg. BSI-Warnungen, IT-Grundschutz, Produktzertifizierung → Digitalpaket.
- **Gesundheit** (RKI-Regelkommunikation), **Energie/Infrastruktur** (BNetzA operativ),
  **Klima/Umwelt** (DWD-Wetterwarnungen, Hochwasser als Infrastrukturpolitik), **Verteidigung**
  (Bundeswehrplanung, NATO) → jeweils eigene Pakete. Zivile Verteidigung **nur** aus
  Bevölkerungsschutz-Sicht (BMI/BBK/IMK/THW/DIP).
- **Operative Warn-/Einsatzmeldungen** (NINA/MoWaS/Cell Broadcast als Meldung, DWD-Wetter,
  THW-Einsatzmeldungen) — **nicht** gecrawlt.

---

## 8. Technische Verifikation (§18) — ehrliche Trennung

| Stufe | Was | Ergebnis |
|---|---|---|
| **byte-genau technisch bestätigt** | HTTP-Status/Redirect/Content-Type der Ziel-Domains, Google-News-batchexecute-Ertrag | **KEINE** — Egress in dieser Umgebung **blockiert** (Proxy 403 CONNECT für `curl`, 403 Forbidden für WebFetch auf bbk.bund.de/innenministerkonferenz.de). |
| **amtlich / WebSearch fachlich bestätigt** | Existenz/Identität/Zuständigkeit BMI, BBK, THW, IMK (Domain `innenministerkonferenz.de`, AK V), Bundestag/DIP/Innenausschuss, BRH; KRITIS-Dachgesetz; Pakt/Fahrplan (IMK 19.06.2026); PiB-16 vs. parlamentarische Risikoanalyse; BMI-Name; BBK-Leitungswechsel | **bestätigt** (Quellen in §6). |
| **vor Aktivierung ZWINGEND zu verifizieren** | je Weg: echter HTTP-Status/Redirect/finale Domain/Content-Type, **tatsächlicher Google-News-Ertrag** (insb. `site:innenministerkonferenz.de` — Beschluss-PDF-Archiv, evtl. geringer News-Ertrag → ggf. Upgrade auf direkten `html`-Weg der Beschluss-Übersicht), Bot-Schutz, JS-Abhängigkeit, Aktualität/Frequenz, Feed/Strukturdaten | **offen** (Verifikationslauf freigabepflichtig). |

**Keine URLs/Feeds/Endpunkte erfunden:** alle 7 Wege sind `googlenews_search` mit `site:`-Scoping;
die `url` ist eine synthetische `news.google.com/rss/search`-Suche (kein behaupteter Direkt-Feed).

---

## 8a. Bestandsdrift (§11) — dokumentiert, NICHT still geändert

- **`committee-bt-inneres`** (Entität) und **`rp-committee-inneres`** (Weg) tragen im Bestand noch
  **„Ausschuss für Inneres und Heimat"** bzw. „Ausschuss Inneres und Heimat". Aktuell amtlich
  (21. WP): **Innenausschuss**. Der Altname bleibt hier **unverändert** (außerhalb des
  Paket-Scope; Boundary „keine Änderung bestehender aktiver Quellen"). Empfehlung: separater,
  eigens freizugebender Korrekturschritt (Namensfeld + Alias), **nicht** Teil dieses Pakets.
- **BMI/BMIH:** `ministry-bmi` = „Bundesministerium des Innern" (korrekt). Historischer Alias
  „…und für Heimat" (BMIH) **nicht** ergänzt (Entitätsänderung wäre außerhalb des additiven
  Scope) — als optionale additive Alias-Anreicherung dokumentiert (freigabepflichtig).

---

## 9. Integrationsprotokoll

**Zuerst gelesene Architekturdateien** (Orientierung, kein Vollscan):
`00-master-status.md`, `03-datenmodell-und-migration.md`, `00-ist-architektur-und-abweichungen.md`,
`15-prepared-eintragung-freigabeanfrage.md` (BE/BB-Muster), Code-Modelle
`seeds/{entities,publishers,packages,landesmodule-quellen}.js`, `model.js`, Generator
`generate-landesmodul-seed.js` + Test, Schema `20260713_source_architecture.sql`, Haupt-Seed
`20260713_source_architecture_seed.sql`. **Repository-Vollscan vermieden** (nur gezielte Greps
nach BMI/BBK/THW/IMK/DIP/BRH/Bevölkerungsschutz etc.).

**Direkt gefundene Bestandseinträge (wiederverwendet):** `ministry-bmi`, `authority-bundesrechnungshof`,
`parliament-bundestag`/`-bundesrat`, `government-bund`, `committee-bt-inneres`,
`publisher-bundesrechnungshof.de`/`-dip.bundestag.de`/`-bundesrat.de`/`-bundesregierung.de`,
Wege `rp-dip` + `rp-committee-inneres` (letzterer enthält bereits „Bevölkerungsschutz").
**Fehlend → neu:** BMI-Herausgeber (`bmi.bund.de`), BBK/THW/IMK (Entität+Herausgeber).

**Neue Dateien:**
- `lib/helmut/quellenarchitektur/seeds/bevoelkerungsschutz-quellen.js` — deterministisches Modell.
- `scripts/generate-bevoelkerungsschutz-seed.js` — Generator (idempotentes SQL + guarded Rollback).
- `scripts/bevoelkerungsschutz-seed-test.js` — 48 Prüfungen (Inaktivität, Idempotenz,
  Wiederverwendung, Rollback-Sicherheit, Abgrenzung, Tiering).
- `supabase/seeds/20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed.sql` (+`_rollback.sql`).

**Geänderte Datei (einzig, +1 Zeile):** `scripts/run-offline-tests.js` — Generator in die
DENYLIST (kein Test). **Basismodelle + Haupt-Seed + BE/BB-Seed: byte-identisch.**

**Warum eigenständiger Seed (statt Eintrag in `packages.js`/Haupt-Seed):** additiv &
self-contained, mirror des BE/BB-Landesmodul-Musters; der bereits angewandte Haupt-Seed bleibt
unberührt → die bestandszählenden Tests (source-architecture 144/145, admin-source 51 Herausgeber)
bleiben grün. Eine spätere Aufnahme in `packages.js` wäre Teil des Aktivierungsschritts (eigene
Freigabe).

**Tests:** `node scripts/bevoelkerungsschutz-seed-test.js` → 48/48 grün ·
`npm run test:offline` → **141/141 grün** (35 s).

---

## 10. Anwendung & Rollback — FREIGABEPFLICHTIG (hier NICHT ausgeführt)

**Voraussetzung:** `20260713_source_architecture.sql` + Haupt-Seed angewendet (Prod erfüllt das:
`rp-dip`, `rp-committee-inneres`, `geo-bund`, `ministry-bmi`, `authority-bundesrechnungshof`,
`publisher-bundesrechnungshof.de` vorhanden).

**Anwenden (nach „Go"):**
0. (optional) Dry-Run: `begin;` → Seed → Prüfungen A–E → `rollback;`.
1. `20260724_bevoelkerungsschutz_katastrophenschutz_bund_seed.sql` in **einer** Transaktion.
2. Prüfungen (read-only): **(A)** Zeilendeltas: `source_packages +1`, `political_entities +3`,
   `publishers +4` (BRH `DO NOTHING`), `retrieval_paths +7`, `package_paths +9`,
   `path_expected_levels +7`, `path_expected_geographies +7`. **(B)** 0 neue Wege mit
   `status<>'needs_review' OR activation_mode<>'manual'`. **(C)** Paket `status='prepared'`.
   **(D)** aktive Wege gesamt unverändert (Paket zählt nicht — `computePathRefcounts` nur `active`).
   **(E)** `rp-dip`/`rp-committee-inneres` unverändert (nur je 1 neuer `package_paths`-Link).
3. Bei Abweichung → `..._rollback.sql`; sonst fertig.

**Rollback:** entfernt Paket + 7 Wege + Zuordnungen + erwartete Dimensionen; **guarded**
Herausgeber-/Entitätslöschung schützt `publisher-bundesrechnungshof.de`, `ministry-bmi`,
`authority-bundesrechnungshof`; bestehende Wege + ihre `pkg-bund-basis`-Zuordnung unberührt.
**Kostenrisiko 0** (reine Inserts, kein Crawl/LLM).

---

## 11. Verbleibende Risiken vor Aktivierung

1. **Google-News-Ertrag je `site:`-Weg unbekannt** (Egress blockiert) — insb.
   `site:innenministerkonferenz.de` (Beschluss-Archiv statt News) könnte dünn sein → ggf. Upgrade
   auf direkten `html`-Weg der IMK-Beschluss-Übersicht vor Aktivierung.
2. **Bestandsdrift Innenausschuss-Name** (§8a) — vor breiter Nutzung separat korrigieren.
3. **Fortschrittsbericht Resilienzstrategie** — bei tatsächlicher Veröffentlichung prüfen, ob ein
   dedizierter Weg nötig ist (derzeit über `rp-bevschutz-bmi-strategie` + DIP abgedeckt).
4. **rescEU/UCPM** als späterer Tier-3-EU-Weg offen (eigene Freigabe).
5. **Aktivierung** erfordert: Paket → `active`, Profil-Mapping, Wege → `auto`/`healthy` nach
   Byte-Verifikation — alles **freigabepflichtig**, hier bewusst **nicht** getan.
