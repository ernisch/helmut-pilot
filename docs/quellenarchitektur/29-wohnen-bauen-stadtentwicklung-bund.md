# Quellenpaket `wohnen-bauen-stadtentwicklung-bund` — Validierung & Vorbereitung

> **Status: VOLLSTÄNDIG INAKTIV / PREPARED.** Stand 2026-07-24.
> Keine Aktivierung · kein Deployment · kein Merge · keine Produktionsänderung ·
> keine Methodik-/Registry-/Generator-Änderung. Dieses Paket ist strukturell
> vorbereitet und technisch inaktiv. Die Aktivierung ist ein eigener,
> ausdrücklich freigabepflichtiger Schritt (siehe §7).

Fachliche Zielarchitektur: Deep-Research-Ausarbeitung „Wohnen, Bauen &
Stadtentwicklung (Bund)" (Juli 2026). Diese wurde als **fachliche Zielarchitektur,
nicht als technische Wahrheit** behandelt; alle Aussagen wurden gegen das
Repository, den Bestandskatalog und (soweit möglich) das offene Netz verifiziert.

---

## 1 · Kompaktes Manifest (für zukünftige Threads — hier genügt diese Datei)

- **Paket:** `pkg-wohnen-bauen-stadtentwicklung-bund` (key `wohnen-bauen-stadtentwicklung-bund`),
  Fachthema Bund, `status = prepared`, `is_base = false`, `geo-bund`.
- **Wo lebt es?** Ausschließlich im eigenständigen Seed
  `lib/helmut/quellenarchitektur/seeds/wohnen-bauen-quellen.js` +
  Generator `scripts/generate-wohnen-bauen-seed.js` +
  Test `scripts/wohnen-bauen-seed-test.js` +
  generiertes SQL `supabase/seeds/20260724_wohnen_bauen_bund_seed(.rollback).sql`.
  **NICHT** in `seeds/packages.js`/`entities.js`/`publishers.js`, **nicht** in
  `index.buildFullModel()`, **nicht** im hartkodierten Katalog. Der Bestand ist
  dadurch byte-identisch geblieben.
- **10 Abrufwege**, alle `googlenews_search` über die reale Herausgeber-Domain
  (`site:`-Suche, keine erfundene Feed-URL), alle `status = needs_review` +
  `activation_mode = manual` → 0 aktive Wege.
- **10 Herausgeber:** 8 neu, **2 wiederverwendet** (`publisher-destatis.de`,
  `publisher-bundesrat.de`, `ON CONFLICT DO NOTHING` → unverändert).
- **8 neue Entitäten** (BMWSB, BBSR, UBA, BiB, KfW, Difu, Städtetag, Landkreistag).
  Wiederverwendet: `statoffice-destatis`, `parliament-bundesrat`,
  `parliament-bundestag`, `committee-bt-bau-wohnen`, `rp-dip`.
- **5 Future Targets** (GMBl, ARGEBAU-Beschlussdatenbank, Wohnungsmarktbeobachtung
  der Länder, Forschungsdatenzentren, Landesbauordnungen-Vergleich) — fachlich
  wertvoll, technisch (noch) nicht integrierbar → **kein** Abrufweg.
- **Aktivierung:** (a) Paket in `PACKAGE_DEFINITIONS` heben ODER Seed-SQL anwenden,
  (b) native Feeds byte-genau verifizieren, (c) `status`/`activation_mode` bewusst
  umstellen. Bis dahin: nichts crawlt.

---

## 2 · Zielstruktur (Facharchitektur → Technik)

Strikte Trennung (Auftrag §2):

- **fachliche Qualität** — aus der Deep-Research-Bewertung übernommen (A/B, ★).
- **technische Integrationsreife** — `integrierbar` (Abrufweg) vs. `future_target`.
- **tatsächliche Abrufbarkeit** — in dieser Umgebung **nicht** byte-verifizierbar
  (Egress gesperrt, §5), daher überall `verify_before_activation = true`.

Keine fachlich gute Quelle wurde wegen technischer Schwierigkeiten verworfen —
technisch (noch) ungeeignete Kernquellen sind **Future Targets**, nicht Ausschüsse.

---

## 3 · Retrieval-Kandidaten (integrationsreif, alle INAKTIV)

Alle Wege: Methode `googlenews_search` (`site:<domain>`-Suche), Parser
`googlenews-batchexecute`, `status = needs_review`, `activation_mode = manual`,
Ebene `bund`, Geografie `geo-bund`.

| Herausgeber | Domain | Abrufweg-ID | Belegfunktion | Frequenzklasse | Produktnutzen |
|---|---|---|---|---|---|
| BMWSB | bmwsb.bund.de | `rp-wbs-bmwsb-steuerung` | official_primary | regelmäßig | hoch |
| BBSR (im BBR) | bbsr.bund.de | `rp-wbs-bbsr-forschung` | data_source | periodisch | hoch |
| Statistisches Bundesamt | destatis.de *(reuse)* | `rp-wbs-destatis-bau-wohnen` | data_source | regelmäßig | hoch |
| Bundesrat | bundesrat.de *(reuse)* | `rp-wbs-bundesrat-staedtebau` | official_primary | regelmäßig | mittel |
| Umweltbundesamt | umweltbundesamt.de | `rp-wbs-uba-nachhaltiges-bauen` | data_source | periodisch | mittel |
| Bundesinstitut f. Bevölkerungsforschung | bib.bund.de | `rp-wbs-bib-demografie` | data_source | periodisch | mittel |
| KfW | kfw.de | `rp-wbs-kfw-foerderung` | data_source | ereignisnah | hoch |
| Deutscher Städtetag | staedtetag.de | `rp-wbs-staedtetag-kommunal` | direct_interest | regelmäßig | mittel |
| Deutscher Landkreistag | landkreistag.de | `rp-wbs-landkreistag-laendlich` | direct_interest | periodisch | mittel |
| Deutsches Institut für Urbanistik | difu.de | `rp-wbs-difu-stadtforschung` | journalistic | periodisch | mittel |

**Frequenzklassen (Auftrag §6):** 1× ereignisnah (KfW — Programmänderungen laufend
und kurzfristig), 4× regelmäßig (BMWSB-PM, Destatis-Baugenehmigungen monatlich,
Bundesrat-Sitzungen ~monatlich, Städtetag-Positionen zu Vorhaben), 5× periodisch
(BBSR/UBA/BiB/Difu-Publikationen, Landkreistag unregelmäßig).

`native_feed_hint` je Weg dokumentiert einen vermuteten Direkt-Feed (v. a. **BiB**
hat laut Recherche einen echten RSS-News-Feed) — vor Aktivierung byte-genau prüfen
und ggf. bevorzugen. **Es wurde keine Feed-/API-URL erfunden** (Auftrag §4).

---

## 4 · Kritische Prüfungen (Auftrag §3)

### BBSR ↔ BBR — genau EINE Institution
Recherche (bundesregierung.de, bmwsb.bund.de, bbr.bund.de) bestätigt exakt die
Deep-Research-Annahme: Das **BBR** (Bundesamt für Bauwesen und Raumordnung) ist die
**Behörde** im Geschäftsbereich des BMWSB; das **BBSR** ist der **Forschungsbereich
im BBR**. → **Eine** Entität `authority-bbsr` (BBR als Alias), **ein** Herausgeber
`publisher-bbsr.bund.de`. **Keine** separate BBR-Entität, kein `bbr.bund.de`-Weg —
keine Doppelmodellierung. Publikationsverantwortung für unser Feld (Bau-/Stadt-/
Raumforschung) liegt beim BBSR → Retrieval Path dorthin.

### GMBl → Future Target (fachlich NICHT abgewertet)
Recherche: amtliches Publikationsorgan der Bundesregierung, hrsg. vom BMI seit 1950
(fachlich A). Technisch: `gmbl-online.de` — Recherche frei, **Volltext-PDF nur für
Abonnenten** (Paywall ~41,90 €/20 Hefte, Registrierung), **kein RSS/API** nachweisbar.
→ **Future Target**, kein Abrufweg.

### Bundestag → bestehende Strukturen wiederverwendet
Der Fachausschuss existiert als Entität `committee-bt-bau-wohnen`; Drucksachen/
Anträge/Gesetzentwürfe laufen bereits über die **DIP-API** (`rp-dip`, aktiver
`always_on`-Weg im Basispaket `bund-basis`). → **Kein** paralleler parlamentarischer
Weg. (Hinweis: der amtliche volle Ausschussname der 21. WP lautet „Ausschuss für
Wohnen, Stadtentwicklung, Bauwesen und Kommunen"; die Bestandsentität trägt „Bauen
und Wohnen" — **nicht** geändert, da Bestandsschutz.)

### Destatis → mehrere Reihen über EINEN Weg
Ein Abrufweg `rp-wbs-destatis-bau-wohnen` bündelt Baugenehmigungen/-fertigstellungen/
Bautätigkeit/Wohnungsbestand/Baupreise über die bestehende Entität + Herausgeber.

### KfW → eigener Retrieval Path gerechtfertigt
Förderprogramme (klimafreundlicher Neubau, energetische Sanierung) sind dauerhaft
politikrelevant; Programmänderungen sind das steuerungsrelevante Signal →
eigener Weg, thematisch auf Wohnen/Bauen begrenzt, Frequenzklasse **ereignisnah**.

---

## 5 · Verifikation (Auftrag §5 — ehrlich dokumentiert)

**Egress in dieser Umgebung ist per Organisations-Policy gesperrt** für deutsche
Gov-/Medien-Domains. Belegt am 2026-07-24:

- `curl`/`WebFetch` auf `bmwsb.bund.de`, `bbsr.bund.de`, `destatis.de`,
  `gmbl-online.de` → **HTTP 403 „CONNECT tunnel failed"** am Egress-Proxy
  (`recentRelayFailures`: `connect_rejected — gateway answered 403 to CONNECT`).
- Kontrolle: der Proxy selbst arbeitet (github.com erreichbar); die 403 sind
  **Policy-Denials**, nicht Proxy-Fehler. Gemäß Proxy-README **nicht umgangen/retried**.

**Folge:** HTTP-Status, Redirects, Content-Type, strukturierte Daten, Paywalls,
Bot-Schutz konnten **nicht byte-genau** geprüft werden. Ersatzweise wurde per
**WebSearch** verifiziert (nicht-deutsche Suchinfrastruktur):

- BBSR↔BBR-Organisationsverhältnis (bestätigt).
- GMBl-Herausgeber/Paywall/kein-Feed (bestätigt).
- Bundestags-Ausschuss 21. WP + DIP-Zugang (bestätigt).
- BiB besitzt einen RSS-News-Feed; BiB.Aktuell ~10×/Jahr (bestätigt).
- ARGEBAU/Bauministerkonferenz: ASP.NET-Portal, kein Feed (bestätigt).

Deshalb: **alle** Wege `verify_before_activation = true`, Methode konservativ
`googlenews_search` über die reale Domain (kein erfundener Feed). Der byte-genaue
Feed-Check ist ein Schritt vor der Aktivierung (analog Sprint-9B-Runner mit offenem
Egress bei den Landesmodulen).

---

## 6 · Future Targets & bewusste Ausschlüsse

**Future Targets (kein Abrufweg, dokumentiert):**
GMBl (Paywall/kein Feed) · ARGEBAU-Beschlussdatenbank / Musterbauordnung
(aspx/kein Feed) · Wohnungsmarktbeobachtung der Länder (dezentral) ·
Forschungsdatenzentren der Statistik (antragspflichtig) · Landesbauordnungen-
Vergleich (kein Sammelfeed).

**Bewusst nicht in DIESEM Paket (Scope Bund-Kern):** GdW, ZIA,
Bundesarchitekten-/-ingenieurkammer, Deutscher Verband (ergänzende Wirtschafts-/
Kammerquellen) · BKG, Demografieportal (unterstützend) · EU-Kommission
Regionalpolitik, ESPON (EU-Ebene) · sowie die von der Facharchitektur ausdrücklich
ausgeschlossenen Klassen (Tagespresse, Immobilienportale, Social Media, Wikipedia,
Parteipublikationen).

---

## 7 · Aktivierung (freigabepflichtig — NICHT Teil dieses Sprints)

1. Paket in den aktiven Registrierungspfad heben: entweder Aufnahme in
   `seeds/packages.js` `PACKAGE_DEFINITIONS` **oder** Anwenden des Seed-SQL
   `supabase/seeds/20260724_wohnen_bauen_bund_seed.sql` (idempotent, additiv).
2. Native Feeds je Weg byte-genau verifizieren (Runner mit offenem Egress);
   `native_feed_hint` prüfen und Direkt-Feeds ggf. bevorzugen.
3. `status`/`activation_mode` bewusst umstellen und ein aktivierungsberechtigtes
   Profil dem Paket zuordnen.

Rollback: `supabase/seeds/20260724_wohnen_bauen_bund_seed_rollback.sql`
(löscht nur die neuen Zeilen; wiederverwendete Herausgeber bleiben unangetastet).

---

## 8 · Integrationsprotokoll

- **2026-07-24** — Bestandsaufnahme: Publisher/Entitäten/Retrieval Paths/Pakete/Seeds
  vollständig gelesen. Gesucht (BMWSB, BBSR, BBR, Destatis, Bundestag, Bundesrat, UBA,
  BiB, KfW, Difu): vorhanden → `statoffice-destatis`, `parliament-bundesrat`,
  `parliament-bundestag`, `committee-bt-bau-wohnen`, `rp-dip`, Herausgeber
  destatis.de/bundesrat.de/bundestag.de/bundesregierung.de; `bmwsb.bund.de` +
  `destatis.de` in `sourceSafety.OFFICIAL_DOMAINS`. Nicht vorhanden → BMWSB/BBSR/UBA/
  BiB/KfW/Difu/Städtetag/Landkreistag als Entität/Herausgeber.
- **Egress-Test** (curl/WebFetch): deutsche Gov-Domains 403 (Policy) → ehrlich
  dokumentiert (§5); Faktencheck via WebSearch.
- **Modellierung:** neuer eigenständiger Seed (kein Registry-/Generator-/Katalog-
  Eingriff); 8 neue Entitäten, 8 neue + 2 wiederverwendete Herausgeber, 10 Abrufwege,
  1 prepared-Paket, 5 Future Targets. Generator + idempotentes SQL + Rollback erzeugt.
- **Tests:** `scripts/wohnen-bauen-seed-test.js` (57 Checks) grün; gesamte
  Offline-Suite **141/141** grün (neuer Test automatisch eingesammelt).
- **Wirkung auf Bestand:** keine. `buildFullModel` unverändert 6 Pakete;
  `source-architecture-test` 91/91 unverändert grün.
