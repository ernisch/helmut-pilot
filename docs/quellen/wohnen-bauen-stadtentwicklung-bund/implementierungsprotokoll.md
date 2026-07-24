# Implementierungsprotokoll — Quellenpaket `wohnen-bauen-stadtentwicklung-bund`

**Stand:** 2026-07-24 · **Branch:** `claude/pilot-wohnen-bauen-stadtentwicklung-f64fix`
**Paketstatus:** `prepared` (technisch INAKTIV) · **Freigabe:** ausstehend (separater Auditlauf)

---

## 1. Veränderte / neue Dateien

**Neu:**
- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung.js` — Pflichtkern-Definition
  (11 Quellen) + Builder; je Weg mit echtem CI-Verifikationsurteil annotiert.
- `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten.js` — Kandidaten-
  Superset (28 reale URLs) für die technische Verifikation.
- `scripts/wohnen-bauen-stadtentwicklung-verify.js` — echte HTTP-Verifikation (Wiederverwendung
  von `httpProbe`/Egress-Gate aus `sprint9b-verify-abrufwege.js`; Parser `crawler.parseRssItems`).
- `scripts/wohnen-bauen-stadtentwicklung-verify-test.js` — Offline-Selbsttest der Urteilslogik (14 Fälle).
- `.github/workflows/wohnen-bauen-stadtentwicklung-verify.yml` — CI-Workflow (offener Egress,
  nur lesend, keine Secrets).
- `docs/quellen/wohnen-bauen-stadtentwicklung-bund/{rechercheprotokoll.md, quellenpruefung.csv, implementierungsprotokoll.md}`.

**Geändert (additiv):**
- `lib/helmut/quellenarchitektur/catalog.js` — additive DIP-artige Injektion des WBSB-Seeds
  (dedup-bewusst: bestehende Herausgeber werden nicht überschrieben).
- `lib/helmut/quellenarchitektur/seeds/entities.js` — 3 neue Entitäten.
- `lib/helmut/quellenarchitektur/seeds/packages.js` — 1 neue Paketdefinition.
- `scripts/source-architecture-test.js` — Legacy-Zahlen gegen Alt-Katalog gescoped (unverändert
  144/145) + 11 neue WBSB-Invarianten.
- `scripts/admin-source-report-test.js`, `scripts/sprint6-pilot-migration-test.js` — Gesamtzahlen
  auf 155 Abrufwege / 56 Herausgeber aktualisiert (WBSB-aware Labels).
- `supabase/seeds/20260713_source_architecture_seed.sql` — via Generator neu erzeugt (siehe §5).

## 2. Neu angelegte Herausgeber (Publisher)

5 neu (destatis.de + bundestag.de **wiederverwendet**, nicht dupliziert):

| id | Domain | Typ | evidence_role | entity_id |
|---|---|---|---|---|
| `publisher-bmwsb.bund.de` | bmwsb.bund.de | ministry | official_primary | `ministry-bmwsb` |
| `publisher-bbr.bund.de` | bbr.bund.de | authority | official_primary | `authority-bbr` |
| `publisher-recht.bund.de` | recht.bund.de | authority | official_primary | `authority-bfj` |
| `publisher-staedtebaufoerderung.info` | staedtebaufoerderung.info | government | official_primary | — |
| `publisher-foerderdatenbank.de` | foerderdatenbank.de | authority | data_source | — |

**Neu angelegte Entitäten:** `ministry-bmwsb` (Bundesministerium für Wohnen, Stadtentwicklung
und Bauwesen), `authority-bbr` (Bundesamt für Bauwesen und Raumordnung), `authority-bfj`
(Bundesamt für Justiz / Verkündungsplattform). — alle `level=bund`, `geography_id=geo-bund`.

## 3. Neu angelegte Retrieval Paths (11)

Alle: `method=html`, `parser=html-scrape`, `status=needs_review`, `activation_mode=manual`,
`is_critical=false`, `max_items=16`, `legacy_source_id=wbsb-<key>`, `id=rp-wbsb-<key>`.

| id | Herausgeber | Priorität | finale URL (verifiziert 200) |
|---|---|---|---|
| `rp-wbsb-bmwsb-presse` | BMWSB | 74 | …/tools-services/presse/pressemitteilungen/pressemitteilungen_node.html |
| `rp-wbsb-bmwsb-foerderung-wohnen` | BMWSB | 66 | …/wohnen/foerderprogramme-bmwsb/foerderprogramme-bmwsb_node.html |
| `rp-wbsb-bbr-presse` | BBR | 64 | …/SiteGlobals/Forms/Suche/PressemitteilungenSuche_Formular.html?nn=1368394 |
| `rp-wbsb-destatis-bautaetigkeit` | Destatis | 62 | …/Bauen/Tabellen/_tabellen-innen-bautaetigkeit.html |
| `rp-wbsb-destatis-baupreisindex` | Destatis | 62 | …/Konjunkturindikatoren/Preise/bpr110.html |
| `rp-wbsb-destatis-wohnen-mieten` | Destatis | 62 | …/Gesellschaft-Umwelt/Wohnen/Tabellen/_tabellen.html |
| `rp-wbsb-destatis-wohngeld` | Destatis | 60 | …/Soziales/Wohngeld/Tabellen/_tabellen.html |
| `rp-wbsb-bgbl-teil1-liste` | Bundesamt für Justiz | 72 | recht.bund.de/de/bundesgesetzblatt/bgbl-1/bgbl-1_node.html |
| `rp-wbsb-bundestag-bauausschuss` | Deutscher Bundestag | 70 | bundestag.de/ausschuesse/a24_wohnen |
| `rp-wbsb-staedtebaufoerderung-start` | Städtebauförderung | 64 | staedtebaufoerderung.info/DE/Startseite/startseite_node.html |
| `rp-wbsb-foerderdatenbank-bmwsb` | Förderdatenbank des Bundes | 60 | …/Foerdergeber/B/bmwsb-bundesministerium_wohnen_stadtentw_bau.html |

## 4. Package-Zuordnungen

- **Neues Paket:** `pkg-wohnen-bauen-stadtentwicklung-bund` (key `wohnen-bauen-stadtentwicklung-bund`),
  `status=prepared`, `is_base=false`, `political_level=bund`, `geography_id=geo-bund`,
  `required_classes=[]`.
- **package_paths:** genau 11 (jeder WBSB-Weg → WBSB-Paket). Keine Verknüpfung zu bestehenden
  Paketen (bund-basis/arbeit-und-soziales/… unverändert).

## 5. Wiederverwendete Komponenten (Parser / Fetcher / Bestand)

- **Parser `html-scrape`** — bestehender Fetcher-Typ des Modells (keine neue Parser-/Fetcher-
  Implementierung nötig).
- **Herausgeber wiederverwendet:** `publisher-destatis.de` (Entität `statoffice-destatis`),
  `publisher-bundestag.de` (Entität `parliament-bundestag`).
- **Parlamentarische Vorgänge:** bestehende **DIP-API** (`rp-dip`) — kein neuer DIP-Weg
  (Vermeidung einer Dublette; `api`-Methode wird vom Crawl ohnehin ausgeschlossen).
- **Verifikations-Infrastruktur:** `httpProbe`/`controlOkFromProbes`/`applyEgressGate` aus
  `scripts/sprint9b-verify-abrufwege.js`; Produktionsparser `crawler.parseRssItems`.
- **Bestehender Google-News-Ersatzweg** `committee-bau-wohnen` (bund-basis) bleibt **unverändert**
  und wird separat behandelt (Auftrag §5).

## 6. Generierte SQL-Änderungen

- Erzeugt **ausschließlich** mit `npm run seed:source-architecture`
  (`scripts/generate-source-architecture-seed.js`) — **nicht** mit `generate-landesmodul-seed.js`.
  Der Generator schreibt beim Import; er wurde **nur** als separater Prozess über das npm-Skript
  gestartet, **nie** aus Test-/Hilfscode importiert.
- Datei: `supabase/seeds/20260713_source_architecture_seed.sql`. Zweiter Generatorlauf
  **byte-identisch** (reproduzierbar).
- **Diff (rein additiv):** 0 Bestandszeilen entfernt oder fachlich verändert (strikte
  Teilmengenprüfung: alle 464 Alt-Zeilen unverändert vorhanden). **+32 Zeilen:**
  3 Entitäten + 5 Herausgeber + 1 Paket + 11 Abrufwege + 11 package_paths + **1 vorbestehende
  Drift-Korrektur** (`('pkg-die-linke-bund','rp-fraction-linke')`).
  - *Hinweis zur Drift-Korrektur:* Der committete Seed war gegenüber dem aktuellen Code
    **veraltet** (ihm fehlte die von `packageKeysForSource` erzeugte Zuordnung
    fraction-linke ↔ die-linke-bund, die der bestehende Architekturtest bereits fordert). Die
    Neuerzeugung bringt den Seed mit dem Code in Deckung. Diese eine Zeile ist **nicht** Teil
    des WBSB-Scopes, entsteht unabhängig aus dem aktuellen Code und entfernt/ändert nichts.
- **DB:** kein Insert, keine Migration, keine Ausführung gegen eine Datenbank.

## 7. Ausgeführte Tests & Ergebnisse

| Test | Ergebnis |
|---|---|
| Syntax-Check aller 8 veränderten/neuen JS-Dateien (`node --check`) | OK |
| `scripts/source-architecture-test.js` | **102 PASS, 0 FAIL** (inkl. 11 neue WBSB-Invarianten) |
| Offline-Selbsttest `…-verify-test.js` | 14 PASS, 0 FAIL |
| Globale Eindeutigkeit (IDs/Domains/legacy_ids/Paket-Keys/package_paths/URLs) | 0 Duplikate |
| WBSB-URLs vs. Bestands-URLs | 0 Kollisionen |
| Ungültige Package-Path-Verknüpfungen | 0 |
| `source-coverage` / `source-dedupe` / `source-mode` / `profile-packages` / `landesmodul-seed` | alle grün |
| `admin-source-report` / `sprint6-pilot-migration` (nach Zahl-Update) | 54 / 46 PASS, 0 FAIL |
| **Volle Offline-Suite** `run-offline-tests.js` | **141/141 Suiten grün** |
| Seed-Neuerzeugung + Reproduzierbarkeit | byte-identisch |
| Git-Diff Seed (0 Bestandszeilen entfernt/verändert) | bestätigt |
| **Reale CI-URL-Verifikation** (Run 30079020728, offener Egress) | 24/28 verifiziert |

**Inaktivitäts-Nachweis (mehrfach abgesichert):**
- Paket `status=prepared` → `computeGlobalActivation` markiert es nie `active`.
- Kein Profil bildet auf das Paket ab → refCount 0.
- Alle Wege `status=needs_review` + `activation_mode=manual` → `isPathActive(p, [])===false`.
- `buildRelationalCrawlPlan` schließt sie als „kein-aktives-paket" aus (per `source-mode`-Test bestätigt).

## 8. Bekannte Risiken

1. **BBSR fehlt** (alle Kandidaten-URLs 404) — Raumordnung nur über BBR abgedeckt.
2. **Kein Feed** — 11 HTML-Scrape-Wege; DOM-Selektoren fragil; konkrete `.xml`-Feeds/GENESIS-REST/
   DIP-Themenfilter vor Aktivierung serverseitig ermitteln.
3. **Aktualität** der HTML-Listen nicht maschinell gemessen (`aktuell=unbekannt`).
4. **`gesetze-im-internet.de`** timeout (nicht aufgenommen); Baugesetzgebung via BGBl abgedeckt.
5. **Bot-Sperren** möglich beim echten Crawl (403/429) — `verifyBeforeActivation` pro Weg.

## 9. Noch notwendige Audit-Schritte (vor Freigabe)

1. BBSR-URLs neu recherchieren und real verifizieren; ggf. als Wege ergänzen.
2. Pro Weg konkrete `.xml`-Feeds bzw. GENESIS-REST-Basis / DIP-Themenfilter ermitteln und
   `html-scrape` ggf. durch stabilere Fetcher ersetzen.
3. Live-Re-Verifikation (Bot-Sperren/Aktualität) unmittelbar vor Aktivierung.
4. Fachliche Freigabe des Pflichtkerns (Vollständigkeit/Passung) durch den unabhängigen Auditor.
5. Erst danach: Paket `prepared → active`, Wege `needs_review/manual → healthy/auto`
   (separater, freigabepflichtiger Schritt) + Seed-Anwendung gegen die DB.

> **Stop-Gate:** Nach diesem Sprint keine Aktivierung, kein Merge, kein Deployment, keine
> DB-Ausführung, keine Arbeit an Berlin/Brandenburg. Das Paket ist **nicht freigegeben**.
