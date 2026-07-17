# 12 — Sprint 6 Stufe 1: Migration, Shadow-Betrieb, Pilot-Vergleich (offline/read-only)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich **offline / read-only** vorbereitet und getestet. **Keine**
Production-Migration, **keine** Production-Seeds, **kein** Deployment, **keine** Cron-Änderung,
**keine** Quellenaktivierung.

Ziel des Sprints (Auftrag): Die bestehenden Quellen werden in die neue Struktur überführt,
ein **Shadow-Betrieb** läuft parallel, und ein **Alt-gegen-Neu-Vergleich** stellt sicher, dass
**die Versorgung des Pilotmandanten sich nicht verschlechtert** und **kein Datenverlust** entsteht.

---

## 1. Was in Stufe 1 gebaut wurde (rein, testbar, additiv)

### a) `lib/helmut/quellenarchitektur/migration-mapper.js`
Reine Logik. Validiert den De-facto-Migrations-Mapper (`catalog.buildCatalog`: 144 v1Sources
+ DIP → 145 Abrufwege) gegen die **real beobachteten** Quellen aus `raw_documents`
(`source_id`/`source_name`, read-only injiziert).

- **Coverage:** 145 Abrufwege, **0 Quellen ohne Paketzuordnung** (`unmapped=0`).
- **Datenverlust-Check:** Eine beobachtete `source_id` gilt als **erklärt**, wenn sie einen
  Abrufweg besitzt **oder** in der Orphan-Klassifikation steht. Eine **unerklärte Quelle mit
  Dokumenten** → `verdict: "kritisch"` (Datenverlust-Risiko). Unerklärt **ohne** Dokumente →
  nur `warnungen`.
- **Ehrlichkeit:** Fehlen die `raw_documents` (nicht erreichbar), wird das als
  `availability.observedSources=false` ausgewiesen — **kein erfundener Abgleich**.
- **Namensdrift** (source_name ≠ Katalogname) ist nur **informativ**, kein Fehler (bei
  Google-News weicht der Herausgebername bewusst ab).

### b) `lib/helmut/quellenarchitektur/supply-shadow-compare.js`
Reine Logik. Vergleicht die **Quellenversorgung** eines Profils ALT (v1Sources-Auswahl, das
heutige Erlebnis) gegen NEU (Paketauflösung → Abrufwege).

- **Erklärte Konsolidierung ≠ Verschlechterung:** Ein Wegfall ist erklärt, wenn er (1)
  `orphan_legacy`/`orphan_test` ist oder (2) eine `X-<suffix>`-Mehrfachsuche ist, deren
  Basisquelle `X` in NEU vorhanden ist (Personenquellen-Konsolidierung).
- **Echte Regression** = unerklärter Wegfall. Mit Dokumentdaten zusätzlich gewichtet: liefert
  der Wegfall real Dokumente → `regression`; sonst → `struktur_warnung`.
- **Shadow-Flag** `HELMUT_V3_SHADOW_COMPARE` (default **AUS**): reine Lesefunktion; die
  Verdrahtung in den Live-Pfad ist **freigabepflichtig** (Stufe 2), hier nicht scharf.

### c) `scripts/sprint6-migration-dryrun.js` (read-only)
Fährt die **echte** Quellenauswahl des Pilotmandanten (`scheduler.getSourcesForProfile`) gegen die neue
Paketauflösung und validiert den Mapper gegen `raw_documents` — falls read-only erreichbar,
sonst strukturell. **Kein** Write, **kein** Crawl, **kein** KI-Call. Exit 0 = kein
Datenverlust/keine Regression.

---

## 2. Ergebnis des read-only Dryruns (heute)

```
Katalog: 145 Abrufwege, 51 Herausgeber, unmapped=0
[Mapper] verdict=OK (strukturell; raw_documents in dieser Umgebung nicht erreichbar)
[Pilot Alt-vs-Neu] verdict=ERKLAERTE_KONSOLIDIERUNG
   alt=149  neu=145  both=143  onlyAlt=6  onlyNew=2
   NEU-Pakete: bund-basis, die-linke-bund, arbeit-und-soziales, regional-niedersachsen, profil-<pilot-mandats-id>
   6 erklärt konsolidiert: <pilot-mandats-id>-news-{regierung-vorhaben, fraktion-partei, ministerien,
                            ausschuss-themen, themen-medien, region}  [alle orphan_legacy]
   Gewinn (nur NEU): dip, region-braunschweig-arbeit-soziales
=== OK — kein Datenverlust, keine Regression für den Piloten ===
```

**Interpretation:** **143** von 149 Alt-Quellen des Pilotmandanten bleiben 1:1 erhalten. Die **6** Wegfälle
sind ausnahmslos die dynamischen `<pilot-mandats-id>-news-*`-Mehrfachsuchen, die bewusst durch **eine**
Personenquelle (`<pilot-mandats-id>-news` im Paket `profil-<pilot-mandats-id>`) abgelöst werden (in
`ORPHAN_CLASSIFICATION` als `orphan_legacy` dokumentiert; Dokumente bleiben erhalten, keine
Reaktivierung). NEU **gewinnt** sogar die amtliche `dip`-API und eine Regionalquelle.

> Der Abgleich gegen die **echten** `raw_documents`-Dokumentzahlen steht noch aus (DB in dieser
> Umgebung nicht erreichbar). Er ist **freigabepflichtiger** Teil von Stufe 2: Nach Schatten-
> Ingest denselben Dryrun gegen Produktionsdaten fahren und bestätigen, dass keine der 6
> konsolidierten Quellen exklusive Dokumente hält.

---

## 3. Orphan-Behandlung (vorbereitet, nicht ausgeführt)

`catalog.classifyOrphans()` liefert die Handlungsempfehlung je Orphan — **als Datenaussage,
ohne ausführenden Schreibschritt** (Auftrag: keine Datenänderung):

| Orphan-Klasse | Einträge | Empfohlene Aktion (freigabepflichtig) |
|---------------|----------|----------------------------------------|
| `orphan_legacy` | 8× `<pilot-mandats-id>-news-*` | Als Legacy markieren, **Dokumente erhalten**, nicht reaktivieren. |
| `orphan_test` | 4× `test-mdb-news-*` | Archivieren (Testmüll, tot seit 2026-07-02). |
| `active_uncatalogued` | 1× `dip` | Als amtlichen API-Abrufweg (Bund Basis) führen. |

---

## 4. Tests

- **`test:sprint6-migration` 35/35** (Mapper-Coverage, Datenverlust-Erkennung,
  Orphan-Konsistenz, Namensdrift, erklärte Konsolidierung vs. echte Regression, Shadow-Flag,
  Pilot-NEU-Auflösung, **SQL-Idempotenz + Rollback-Symmetrie**).
- **`sprint6:dryrun`** (read-only) → Exit 0.
- **Keine Regression:** source-architecture 88, profile-packages 57, quality-watchdog 65,
  admin-source-report 54, landesmodule-kandidaten 50.

---

## 5. Was NICHT passiert ist

- **Kein** `require` der neuen Module in Scheduler/Server (Live-Pfad unverändert).
- **Keine** Migration/Seed auf Production angewendet; **kein** Flag scharfgeschaltet.
- **Kein** Storage-Write, **kein** Crawl, **kein** KI-Call, **kein** Cron, **kein** Deployment.

Die **konkrete Production-Freigabeanfrage** (exakte Schritte, Risiken, Rollback, Dauer,
Post-Migration-Prüfungen, weiterhin deaktivierte Berlin/Brandenburg-Quellen) steht in
`sprint-6-freigabeanfrage.md`.
