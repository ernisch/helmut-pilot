# Quellenpaket „verteidigung-bund" — PREPARED-Dokumentation

**Status:** `prepared` · **is_base:** `false` · **Ebene:** Bund · **Aktiviert:** NEIN (vollständig inaktiv)
**Branch:** `claude/verteidigung-bund-prepare-x3r8mk` · **Basis-Commit:** `035898b`
(Merge #114 — „establish main as the single architecture source of truth")

Helmut ist kein Medienmonitoring-Tool, sondern ein politischer KI-Stabschef. Dieses Paket ist
bewusst **klein und signalstark**: nicht möglichst viele Quellen, sondern die richtigen. Alle
Komponenten sind additiv, deterministisch, idempotent, rollback-sicher und kollisionsfrei
vorbereitet — **nichts** ist aktiviert, migriert oder gecrawlt.

Die technische Umsetzung folgt exakt dem freigegebenen PREPARED-Muster der Landesmodule
Berlin/Brandenburg (`seeds/landesmodule-quellen.js` + generierter Seed): Code-Modell →
idempotenter, nicht-destruktiver SQL-Seed (`ON CONFLICT DO NOTHING`) → Rollback → Offline-Test.

---

## 1 · Fachlicher Scope

Verteidigungs- und sicherheitspolitische Bundesebene mit Bundeswehrbezug:

- Verteidigungs-/Sicherheitspolitik, Strategie, Grundsatzdokumente
- Bundeswehr: Einsatzbereitschaft, Personal, Reserve, Wehrdienst, Streitkräfteentwicklung,
  Bundeswehrstruktur, Verteidigungsplanung
- Beschaffung, Rüstung, Ausrüstung, Innovation
- Auslandseinsätze (über BMVg + DIP, **kein eigener Weg**)
- Parlamentarische Kontrolle: Wehrbeauftragte, Verteidigungsausschuss (nur öffentliche Inhalte),
  Parlamentsbeteiligung / Mandate (über DIP)
- Berichtsreihen (Rüstungsbericht, materielle Einsatzbereitschaft, Personalbericht,
  Jahresbericht der Wehrbeauftragten) — **über die stabilen Übersichts-/Themenwege**, nicht als
  hart codierte Einzeldokumente.

---

## 2 · Paketgrenzen (bewusst NICHT aufgenommen)

Diese Themen gehören in andere Pakete und sind ausgeschlossen: BND, Verfassungsschutz, Polizei,
allgemeine innere Sicherheit, Terrorismus, zivile Cybersecurity, allgemeine Digitalpolitik,
allgemeine Außenpolitik/Diplomatie/Entwicklungszusammenarbeit, allgemeine EU-Politik, allgemeine
Industriepolitik, allgemeine Rüstungsexporte, allgemeiner Bundeshaushalt, Truppenalltag,
Standortmeldungen, Rekrutierungswerbung, militärhistorische Inhalte, operative Einzelmeldungen
sowie Einzelfälle ohne bundespolitischen Signalwert.

Grenzfälle: militärische Cyber-Themen und Zivilschutz mit Bundeswehrbezug bleiben in diesem
Paket; klassische innere Sicherheit → `innere-sicherheit-bund`; allgemeine EU-/Außenpolitik →
Außen-/Europa-Pakete; allgemeiner Haushalt → Haushalts-/Finanzpaket.

---

## 3 · Zielarchitektur — 6 Retrieval Paths

| # | Weg | Herausgeber | Tier | Kritisch | Herkunft |
|---|-----|-------------|------|----------|----------|
| 1 | BMVg — Politik, Strategie und Bundeswehr | `publisher-bmvg.de` (neu) | 1 | ja | **neu** |
| 2 | BMVg — Beschaffung und Rüstung | `publisher-bmvg.de` (neu) | 1 | ja | **neu** |
| 3 | Wehrbeauftragte des Deutschen Bundestages | `publisher-bundestag.de` (best.) | 1 | ja | **neu** |
| 4 | Verteidigungsausschuss (öffentliche Inhalte) | `publisher-bundestag.de` (best.) | 1 | ja | **neu** |
| 5 | DIP — Dokumentations- und Informationssystem | `publisher-dip.bundestag.de` (best.) | 1 | ja | **wiederverwendet** (`rp-dip`) |
| 6 | Bundesregierung — Sicherheits-/Verteidigungspolitik | `publisher-bundesregierung.de` (best.) | 2 | nein | **neu** (best. Herausgeber) |

**= 5 neue Abrufwege + 1 wiederverwendeter (`rp-dip`) = 6 Wege im Paket.** Innerhalb des
Zielbands (6–7); der optionale 7. Weg (BMVg Personal/Einsatzbereitschaft) wurde **nicht**
angelegt (§6).

Alle Wege modellieren den Abruf als `googlenews_search` mit `site:`-Filter — ein **real
existierender, stabiler Suchweg**. Es wurden **keine** RSS-Feeds, APIs oder Direkt-URLs erfunden
(Auftrag §9). Jeder Weg trägt `verifyBeforeActivation = true`: ein direkter Feed/eine stabile
Übersichtsseite (z. B. der BMVg-Newsroom nach der Organisationsreform) ist vor einer späteren
Aktivierung byte-genau zu prüfen.

---

## 4 · Neue Komponenten

**1 Herausgeber**
- `publisher-bmvg.de` — Bundesministerium der Verteidigung (`bmvg.de`, `ministry`,
  `official_primary`). `bmvg.de` ist bereits eine offiziell vertrauenswürdige Domain
  (`lib/helmut/sourceSafety.js`), aber bisher **kein** Herausgeber-Datensatz → keine
  Domain-Dublette.

**3 politische Entitäten**
- `ministry-bmvg` — Bundesministerium der Verteidigung (`ministry`)
- `institution-bundeswehr` — Bundeswehr (`other_institution`; erwartete Entität, **kein** eigener
  Herausgeber-Weg)
- `institution-wehrbeauftragter` — Wehrbeauftragte des Deutschen Bundestages (`other_institution`)

Keine dieser Entitäten trägt aktuelle Personen (kein Minister, kein Wehrbeauftragter, keine
Staatssekretäre) — nur stabile Institutionsnamen + Aliase.

**5 Retrieval Paths** (Wege 1–4 + 6 oben) — alle `status='needs_review'`,
`activation_mode='manual'`.

**1 Quellenpaket** — `pkg-verteidigung-bund` (`prepared`, `is_base=false`).

**Erwartete Dimensionen** — 5 `path_expected_levels` (bund), 5 `path_expected_geographies`
(geo-bund), 23 `path_expected_topics`, 8 `path_expected_entities` (inkl. der wiederverwendeten
`committee-bt-verteidigung`).

---

## 5 · Wiederverwendete Komponenten (Auftrag §7 — Vorrang)

| Typ | Komponente | Verwendung |
|-----|-----------|------------|
| Abrufweg | `rp-dip` (DIP-API, bereits aktiv/always_on) | **nur** Paket-Verknüpfung — kein zweiter DIP-Weg, keine Änderung an `rp-dip` |
| Herausgeber | `publisher-bundestag.de` | trägt Wehrbeauftragte + Verteidigungsausschuss |
| Herausgeber | `publisher-bundesregierung.de` | trägt den ergänzenden Bundesregierungs-Weg (Tier 2) |
| Herausgeber | `publisher-dip.bundestag.de` | über `rp-dip` |
| Entität | `parliament-bundestag` | über die beiden Bundestags-Wege / DIP |
| Entität | `government-bund` | erwartete Entität des Bundesregierungs-Wegs |
| Entität | `committee-bt-verteidigung` | erwartete Entität des Ausschuss-Wegs |

Bestehende Herausgeber/Entitäten werden **referenziert, nicht eingefügt** — der Seed enthält
keinen `INSERT` für sie. Keine zweite Domain, keine doppelte Institution.

---

## 6 · Verworfene Quellen & Begründungen

| Kandidat | Entscheidung | Grund |
|----------|--------------|-------|
| 3. BMVg-Weg (Personal/Einsatzbereitschaft) | verworfen | Ohne verifizierbar getrennte URL-Struktur eine künstliche Aufspaltung (Korrektur 1). Personal/Einsatzbereitschaft/Reserve/Wehrdienst laufen im BMVg-Politik-Weg mit. |
| Eigener Auslandseinsatz-Weg | verworfen | Auslandseinsätze bleiben Bestandteil von BMVg + DIP (§8). |
| Bundeswehr (`bundeswehr.de`) als eigener Weg | verworfen | Truppenalltag/Standort/Rekrutierung außerhalb des Scopes; bundespolitischer Bundeswehr-Signalwert ist über den BMVg-Politik-Weg abgedeckt. Bundeswehr bleibt als **erwartete Entität** erhalten. |
| Berichte als Einzel-Retrieval-Paths | verworfen | Keine Berichtsnummern/Jahre/Rhythmen hart codieren (Korrektur 5); Reihen laufen über die stabilen BMVg-/Wehrbeauftragten-Wege. |

---

## 7 · Future Targets (nicht aufgenommen, dokumentiert)

| Kandidat | Bedingung für spätere Aufnahme |
|----------|-------------------------------|
| **BAAINBw** | Regelmäßig hoher politischer Signalwert **und** zuverlässig filterbare Großvergaben **und** keine starke BMVg-Überschneidung (Korrektur 7). Im Zweifel: Future Target. |
| **MAD** | Etablierter, regelmäßiger öffentlicher Bericht; keine Überschneidung mit `innere-sicherheit-bund` (Korrektur 9). Bleibt Future Target, keine Kernquelle. |
| **NATO** | Stabiler, deutschsprachig filterbarer Signalwert; keine Dublette zu bestehenden Paketen (Korrektur 8). |
| **EU-Verteidigung (EDA/PESCO)** | Nachweisbar eigenständiger deutscher Signalwert; keine Dublette zu EU-Paketen (Korrektur 8). |

---

## 8 · Vermiedene Dubletten

- **DIP** — wiederverwendet (`rp-dip`), kein zweiter DIP-Weg.
- **BMVg vs. Bundesregierung** — der Bundesregierungs-Weg ist verteidigungsgefiltert (Tier 2,
  ergänzend), damit keine BMVg-Dublette entsteht (Korrektur 2).
- **Verteidigungsausschuss** — reuse der bestehenden Entität `committee-bt-verteidigung`, kein
  Doppel zur vorhandenen neutralen Ausschuss-Radarquelle in `bund-basis`.
- **Wehrbeauftragte/Ausschuss** — hängen am bestehenden `publisher-bundestag.de`, kein zweiter
  Bundestags-Herausgeber, keine zweite `bundestag.de`-Domain.
- **BMVg-Domain** — `publisher-bmvg.de` ist der einzige neue Herausgeber; `bmvg.de` war noch
  nicht als Herausgeber registriert.

---

## 9 · Verteidigungsausschuss — realistische Modellierung (Korrektur 3)

Der Ausschuss tagt überwiegend **nicht öffentlich**. Der Weg berücksichtigt **ausschließlich
öffentliche Inhalte**: Anhörungen, veröffentlichte Tagesordnungen, Ausschussmitteilungen,
öffentliche Stellungnahmen, veröffentlichte Berichte. Es wird **keine** Vollbeobachtung des
Ausschusses modelliert.

## 10 · Wehrbeauftragte — Einbindung (Korrektur 4)

Ein **gebündelter** Weg fasst Jahresberichte, Sonderberichte, Pressemitteilungen, strukturelle
Stellungnahmen und parlamentarisch relevante Veröffentlichungen. **Keine** normalen
Truppenbesuche/repräsentativen Termine, **keine** Einzel-PDFs als Retrieval Paths, **keine**
Berichtsnummern/Jahre. Nur die stabile Übersichtssemantik am bestehenden Herausgeber.

---

## 11 · Aktivierungsrisiken (für die spätere, freigabepflichtige Aktivierung)

- **Direkt-Feed-Verifikation:** Jeder Weg nutzt vorerst `googlenews_search`. Vor Aktivierung ist
  je Weg zu prüfen, ob ein stabiler Direkt-Feed/eine kanonische Übersichtsseite existiert
  (insbesondere der BMVg-Newsroom nach der Organisationsreform) und diesen ggf. zu ersetzen.
- **Bot-Schutz:** amtliche Domains (`bmvg.de`, `bundestag.de`) blocken generische Bots teils mit
  403 → realistischer User-Agent beim späteren Direktabruf nötig (operatives Abrufrisiko wie bei
  den Landesmodulen).
- **Rauschquote:** Themensuchen über `bundesregierung.de`/`bmvg.de` können ressortfremdes Rauschen
  liefern → die `path_expected_topics`/`path_expected_entities` sind die Kalibriergrundlage; vor
  Aktivierung eine kurze Trefferqualitäts-Sichtprobe.
- **Google-News-Rate-Limiting:** bekanntes latentes Klumpenrisiko (Befund B1 der
  Datenmotor-Härtung) — greift erst bei Aktivierung.
- **Kein Aktivierungsrisiko im Ist-Zustand:** solange `prepared` + `needs_review`/`manual`,
  löst nichts einen Crawl aus.

---

## 12 · Rollback

`supabase/seeds/20260724_verteidigung_bund_seed_rollback.sql` entfernt **ausschließlich** die neu
eingefügten Zeilen in Abhängigkeitsreihenfolge (erwartete Dimensionen → Paketzuordnungen → neue
Wege → Paket → guarded Herausgeber/Entitäten). `rp-dip` und alle bestehenden Herausgeber/Entitäten
bleiben unangetastet; neue Herausgeber/Entitäten werden nur gelöscht, wenn nichts mehr auf sie
verweist. Da der Seed rein additiv ist, ist der Rollback risikofrei.

---

## 13 · Technische Verifikationen

- **Offline-Test** `scripts/verteidigung-bund-seed-test.js`: prepared/inaktiv, 5 neue + 1
  wiederverwendeter Weg, 2 BMVg-Wege, kein 3. BMVg-/Auslandseinsatz-Weg, nur `googlenews_search`
  (keine erfundenen Feeds), Wiederverwendung block-genau geprüft, Future Targets, keine
  Jahreszahlen/Berichtsnummern/Personennamen im SQL, rein additiv (kein DROP/ALTER/DELETE/UPDATE),
  Rollback dependency-korrekt und rp-dip-schonend. **Alle Assertions grün.**
- **Gesamte Offline-Suite:** `node scripts/run-offline-tests.js` → **141/141 Suiten grün**
  (inkl. der unveränderten `source-architecture-test.js`: Code-Katalog weiter 6 Pakete, da das
  neue Paket bewusst DB-only ist und `PACKAGE_DEFINITIONS` nicht anfasst).
- **Kollisionsprüfung:** keine ID-/Domain-/Slug-Kollision (`ministry-bmvg`, `institution-*`,
  `publisher-bmvg.de`, `pkg-verteidigung-bund`, `rp-vtdg-*`, `verteidigung-bund` allesamt neu).
- **Generator** `scripts/generate-verteidigung-bund-seed.js`: reine Codegen, deterministisch,
  idempotent (`ON CONFLICT DO NOTHING`), transaktional (`begin`/`commit`/`notify pgrst`).

---

## 14 · Bestätigung: nichts wurde aktiviert

Es wurde **keine** aktive Quelle verändert, **keine** Migration/SQL ausgeführt, **kein**
Deployment, **kein** Merge, **kein** PR, **kein** Profil-Mapping, **kein** Crawl und **keine**
Pipeline-Änderung vorgenommen. Das Paket ist `prepared`/`is_base=false`, alle neuen Wege sind
`needs_review`/`manual` — **vollständig inaktiv**. Die Aktivierung (Anwenden des Seeds auf
Production, Statuswechsel, Paketaktivierung) bleibt ein separater, ausdrücklich
freigabepflichtiger Schritt.
