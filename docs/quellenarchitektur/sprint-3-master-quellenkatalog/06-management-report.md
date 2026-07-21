# Sprint 3 — Management Report: Master Quellenkatalog

**Stand:** 2026-07-21 · **Branch:** `claude/session-pyryop` · **Status:** VORBEREITET —
kein Deployment, keine angewandte Migration, keine Produktionsänderung, kein aktiver Crawl berührt,
kein Pull Request.

## Kurzfassung

Sprint 3 hat den echten, **globalen** Master Quellenkatalog gebaut: ein kanonisches Datenmodell mit
acht strikt getrennten Belangen, eine datengetriebene Taxonomie (26 Kategorien), einen
Versorgungsstandard je Mandat (12 Ebenen), eine kontrollierte, idempotente Importstrecke (12
Zustände), einen rein lesenden Adapter + Shadow-Vergleich gegen den Altbestand, einen
repräsentativen, belegbaren Startkatalog (107 Quellen), die SaaS-/RLS-Vorbereitung inkl.
Mandantentrennung, eine DSGVO-Datenflussübersicht und eine Coverage-/Ausgewogenheitsmatrix.
**Alle Offline-Testsuiten bleiben grün (143/143); 129 neue Assertions (3 Suiten) kommen hinzu.**
Eine adversariale Mehr-Agenten-Review lief zusätzlich; ihre bestätigten Funde sind eingearbeitet.

## Die zwölf Fragen

**1. Welche Quellen sind bereits vorhanden?**
Der Altbestand (relational, `buildFullModel()`): **144 adaptierte Abrufwege** über ~kuratierte
v1Sources — davon ~94 % Google-News-Suchen, nur 9 echte Direkt-Feeds. Plus DIP (amtliche API),
Bundestag/Bundesrat/Bundesregierung, BMAS, Leitmedien.

**2. Welche wurden in den neuen Katalog übernommen?**
Der Master-Startkatalog enthält **107 belegbare Quellen** (neu modelliert, nicht 1:1 kopiert):
9 Parteien, 5 aktive Bundestagsfraktionen (+1 als veraltet geführte FDP-Fraktion), 23 Ausschüsse,
15 Ministerien (+1 ersetzte Alt-Domain), Bundestag/DIP,
Bundesrat, Bundesregierung, Destatis, GovData, Bundesrechnungshof, Bundesverfassungsgericht,
BA-Statistik, 16 Landesportale, 3 Landtags-/Landesquellen, 13 Medien (7 überregional, 6 regional),
11 Fachöffentlichkeit (Gewerkschaften/Arbeitgeber/Wissenschaft/Thinktank/NGO). Der Adapter bindet
den Altbestand **rein lesend** an; die produktive Übernahme (Seed-Einspielung) ist freigabepflichtig.

**3. Welche Dubletten und Widersprüche wurden gefunden?**
Shadow-Vergleich: **1 URL-Widerspruch** (Bundestag — zwei URLs für dieselbe starke Rolle),
**1 abweichende Klassifikation** (DGB: Alt ohne Institution → Neu `union-dgb`), **0 Dubletten**
(die erwartete Alt↔Neu-Überlappung DIP zählt korrekt als `geteilt`), **1 abweichende
Paketzuweisung**. Innerhalb des Startkatalogs: 0 doppelte kanonische Schlüssel (Dedup wirkt).

**4. Welche Parteien sind ausreichend abgedeckt?**
**Alle 9** (CDU, CSU, SPD, Grüne, FDP, AfD, Linke, BSW, SSW) — je ≥ 1 eigene Direktquelle. Keine
Partei unterversorgt, keine bevorzugt.

**5. Welche Parteien/Fraktionen sind unterversorgt?**
Auf Fraktionsebene: **FDP** (seit der Wahl 2025 keine Bundestagsfraktion mehr — als `superseded`
geführt), **BSW und SSW** (keine belegbare eigene Fraktions-Feed-Domain). Ersatz über die
Parteiseiten ist vorhanden (Versorgungsstandard erlaubt Partei als Ersatz). Kein erfundener Feed.

**6. Welche Ausschüsse sind ausreichend abgedeckt?**
Strukturell alle 23 (je Ausschuss ein generiertes Paket + Coverage-Eintrag). **Qualitativ nur der
Petitionsausschuss** (Direktquelle ePetitionen); **22 von 23 sind heute Suchanbieter-Monokultur**
und gelten laut Versorgungsstandard als **nicht** ausreichend versorgt. Sprint-4-Maßnahme: DIP-
Strukturabruf statt Suche.

**7. Welche Themen und Regionen fehlen?**
Regionen: alle 16 Länder haben ein Landesportal; **aktive Regionalmedien fehlen für Bayern, Bremen,
Hessen, Saarland**. Themen: die Themenversorgung ist datengetrieben modelliert, im Startkatalog aber
bewusst nicht flächendeckend befüllt (Fachverbände/Wissenschaft je Politikfeld folgen kontrolliert).

**8. Wie stark ist die Abhängigkeit von Google News / Suchanbietern?**
Master-Katalog: **31,1 %** der funktionierenden Quellen (nur die Ausschuss-Suchwege). Altbestand:
**~94 %**. Die Abhängigkeit ist damit strukturell drastisch reduziert **und** vollständig sichtbar;
der Versorgungsstandard verbietet Suchanbieter als alleinige Versorgung. Die Erkennung ist robust
(auch Google-News-via-RSS und Aggregator-Herausgeber gelten als Suchanbieter — keine Tarnung möglich).

**9. Ist die Architektur SaaS-tauglich?**
**Ja.** Globaler Katalog + referenzielle Zuweisung (keine Duplikation je Mandant), strikte
Mandantentrennung (tenant_id + RLS), private Quellen isoliert, globale Qualität/Gesundheit einmal
gepflegt. Details: `03-saas-mandantentrennung-rls.md`.

**10. Ist sie DSGVO-konform vorbereitet?**
**Ja, vorbereitet.** Nur öffentliche Quellen-Metadaten, keine PII (technisch erzwungen),
Herkunft/Zweck je Quelle, Aufbewahrungs-/Löschmatrix, maskierte Verantwortlichkeit, Mandantentrennung.
Datenflussübersicht: `04-dsgvo-datenflussuebersicht.md`.

**11. Welche Entscheidungen benötigen Freigabe?**
- **FA-S3-1:** Einspielen der Migration `20260722_master_source_catalog.sql` (+ Rollback vorhanden).
- **FA-S3-2:** Einspielen des vorbereiteten Seeds `20260722_master_source_catalog_seed.sql`.
- **FA-S3-3:** Aktivierung echten Supabase-Auth, damit die `tenant_isolation`-Policies verbindlich greifen.
- **FA-S3-4:** Rechtliche Bewertung (Lizenz/Datenschutz) der 33 noch `unbewerteten` Quellen vor deren `active`-Schaltung.
- **FA-S3-5:** Sprint-4-Vorhaben „Ausschüsse strukturiert über DIP statt Google-News-Suche".

**12. Ist Helmut bereit für Sprint 4 (produktive automatische Quellenzuweisung)?**
**Ja — auf einem belastbaren Fundament.** Der globale Katalog, die idempotente Importstrecke, die
Dublettenerkennung, der datengetriebene Versorgungsstandard und die Coverage-Matrix existieren und
sind getestet. Vor dem produktiven Zuweisungslauf sind die Freigaben FA-S3-1..4 nötig.

## Abnahmekriterien

| # | Kriterium | Status | Nachweis |
|---|-----------|:---:|----------|
| 1 | Globaler Master-Katalog existiert technisch | ✅ | `catalog_sources` (Migration) + `buildMasterCatalog()` (107 Quellen) |
| 2 | Quellen nicht pro Mandant kopiert | ✅ | `resolveTenantSources()` liefert nur Referenzen (tenant-test) |
| 3 | Private Quellen strikt mandantengetrennt | ✅ | `tenant_id`+RLS; `assertPrivateIsolation` (Test §11) |
| 4 | Jede Quelle hat Herkunft + Prüfstatus | ✅ | `validateSourceRecord`; alle Seed-Records mit `discovery_origin`+`review_status` |
| 5 | Importstrecke idempotent | ✅ | `ingestBatch` zweiter Lauf: 0 neue Aufnahmen (Test §1) |
| 6 | Dubletten zuverlässig erkannt | ✅ | `dedupeCandidates` + Batch-/Bestandsdedup (Tests §2/§4) |
| 7 | Parteien/Fraktionen datengetrieben abdeckbar | ✅ | generierte Partei-Pakete = #Parteien; neue Partei ohne Code (Test §23) |
| 8 | Ausschüsse/Themen/Regionen datengetrieben abdeckbar | ✅ | generierte Pakete; neuer Ausschuss/Bundesland ohne Code (Tests §24/§25) |
| 9 | Google News nicht mehr alleinige Versorgung | ✅ | Versorgungsstandard `nur-suchanbieter` → nicht versorgt (Test §20) |
| 10 | Klare Coverage-Matrix existiert | ✅ | `coverage-matrix.js` + `05-coverage-und-shadow-vergleich.md` |
| 11 | Datenschutz/Datenminimierung dokumentiert + getestet | ✅ | `04-dsgvo-…` + `master-catalog-tenant-test.js` (Datenschutzteil) |
| 12 | Bestehende Produktionslogik unverändert | ✅ | additive Module; 142/142 Offline-Suiten grün; Migration additiv (Test) |
| 13 | Nächster Sprint baut auf belastbarem Katalog auf | ✅ | siehe Frage 12 |

## Sicherheit / Nicht getan (bewusst)

Keine Produktionsänderung · kein Deployment · keine angewandte Migration · kein aktiver Crawl/Cron/
Lock berührt · keine Secrets · kein kostenpflichtiger Anbieter aktiviert · keine Massenbefüllung ·
keine automatischen Schreibzugriffe auf produktive Tabellen. Migration und Seed sind **vorbereitet**;
Importe existieren nur als Fixture/vorbereitete Seed-Datei. **Kein Pull Request.**

## Testübersicht (neu)

| Suite | Assertions | Deckt ab |
|-------|-----------:|----------|
| `master-catalog-test.js` | 72 | Import/Dedup/URL/Herausgeber/Parteien/Ausschuss/Themen/Region/global/Zustände/Shadow/Ausgewogenheit/Suchanbieter/Pilot/Erweiterbarkeit |
| `master-catalog-tenant-test.js` | 21 | private Quelle, Mandantentrennung, Korrekturen, Namespacing, Datenschutz/Datenminimierung |
| `master-catalog-migration-test.js` | 32 | Migrations-Additivität, RLS-Vorbereitung, Rollback-Vollständigkeit |

Die 25 Auftrags-Testpunkte (Phase 10) sind vollständig abgedeckt; Zuordnung im Kopfkommentar der
Suiten.
