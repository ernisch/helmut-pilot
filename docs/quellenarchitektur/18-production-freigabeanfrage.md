# Quellenarchitektur — Finale Freigabeanfrage für die kontrollierte Inbetriebnahme

**Status: VORBEREITET. Es fehlt nur noch die Production-Freigabeentscheidung des Gründers.**
Bis hierhin wurde **nichts** an Production verändert: keine Quellenaktivierung, kein Cutover,
kein Prod-Write, keine Flag-Änderung, keine Cron-Änderung, kein Deployment.

Diese Anfrage bündelt die kontrollierte Inbetriebnahme in **klar abgegrenzte, einzeln
freizugebende und einzeln rückrollbare Schritte**. Jeder Schritt nennt Migration/Flag/Cron/
Deployment, Limits, Smoke-Tests, Stop-Bedingungen und Rollback.

---

## 0. Was bereits bewiesen ist (safe, offline/DB-frei, ohne Prod-Änderung)

| Phase | Ergebnis | Beleg |
|---|---|---|
| 1 PARDOK-Stabilität | 5 DB-freie Läufe je Quelle: externe-ID-Menge identisch, 0 neue/verschwundene Dokumente, geparst be=800·5/bb=816·5, Dokumentart-Verteilung stabil, Titel/Datum 100%, 0 Parserfehler, Puffer ≤14 KB | `pardok-parser.yml` Run 29318834005 |
| 2 Shadow-Ingest | isolierte Kette (Normalisierung→Dedup/Fundstellen→Klassifikation Ebene/Geo→KO-Input→Kosten=0) grün; amtliche PARDOK-Ebene quelle-autoritativ; Isolation bestätigt | `node scripts/shadow-ingest-test.js` |
| 3 Profile/Pakete | Bundestag=54 Wege·nur bund-basis; Cem(cem-ince)=5 Pakete·145 Wege·persönliches Paket; Berlin/Brandenburg Landtag=bund-basis aktiv(54)+Landespaket `requested_unsupplied`; kein Profil=nur 5 always_on-Kernwege | `node scripts/profile-packages-test.js` |
| 4 Alt/Neu (Cem-Schutz) | `compareSupply`/`validateMigration`: keine Regression, Orphans erklärt, source_names-Mapping konsistent | `node scripts/sprint6-cem-migration-test.js` |
| 5 Watchdog/Kosten | 10 Achsen + Kostenattribution + ehrliche „nicht verfügbar"-Flags | `node scripts/quality-watchdog-test.js` + read-only Prod-Snapshot (unten) |
| 6 Adversarial | 16 Angriffs-/Ausfall-Szenarien alle grün — Architektur hält stand | `node scripts/adversarial-gesamttest.js` |

**Gesamte Offline-Suite: 19/19 grün** (17 Bestand + shadow-ingest + adversarial + pardok).

### Realer Production-Ist-Zustand (read-only gemessen)
- `raw_documents` **5096** über **123** Quellen; **2280** in 7 Tagen; jüngstes = heute → **Crawl läuft, frisch**.
- `knowledge_objects` **247**; `mandate_profiles` **1** (Cem).
- `llm_usage` **0 Zeilen** → gemessene Kosten **$0** (Attributions-Spalten `source_id/package_id/vorgang_id/knowledge_object_id` existieren, aber noch ohne Daten) → Watchdog zeigt Kosten **ehrlich „noch keine Daten"**.
- `document_findings` **existiert nicht** → Dedup-Findings-Migration ist **noch nicht angewendet**.
- Die 6 BE/BB-Wege + `rp-be-plenum`/`rp-bb-plenum` sind `needs_review`/`manual`/inaktiv.
- Alle `HELMUT_V3_*`-Flags **AUS** (Verhalten byte-identisch zum Alt-Zustand).

---

## Cem-Schutz (durchgehende Invariante über alle Schritte)
- Cem ist voll versorgt (Bund Basis + Arbeit&Soziales + Die Linke + Regional NDS + persönliches Paket) → **145** aktive Abrufwege, unverändert.
- Kein Schritt entfernt oder ersetzt eine Cem-Bundesquelle. `compareSupply` läuft in Schritt 1 als Regressionswächter (verdict muss `keine_verschlechterung` sein) → sonst **Stop**.
- Bundespolitik bleibt für **alle** Profile sichtbar (5 always_on-Kernwege + bund-basis).

## Landtagsprofil-Ergebnisse (bewiesen, Phase 3)
- **Berlin-Landtag**: required = bund-basis + berlin-basis; bund-basis aktiv (54 Wege), berlin-basis = `requested_unsupplied` bis BE-Quellen aktiv. Landespolitik erscheint erst nach Schritt 3.
- **Brandenburg-Landtag**: analog (brandenburg-basis `requested_unsupplied`).
- **Reines Bundestagsprofil**: nur bund-basis (54), keine Landes-/Sozial-/Regionalquellen.
- **Cem-vergleichbar**: 5 Pakete, 145 Wege (Spezialfall voll belegter Dimensionen).
- **Keine Filterblase**: Landtagsprofile behalten die Bundes-Kernwege; Landesvorgänge gehen nicht im Bundesrauschen verloren (getrennte Ebenen-Klassifikation land/bund/unknown).

---

## Die kontrollierte Inbetriebnahme — Schritt für Schritt

Reihenfolge strikt. Jeder Schritt ist eine **eigene Freigabeentscheidung**.

### Schritt A — Fehlende Migration nachziehen (Dedup-Fundstellen)
- **Was:** `supabase/migrations/20260715_dedup_findings.sql` anwenden (Tabelle `document_findings` + raw_documents-Spalten). **Production-Migration → freigabepflichtig.**
- **Vorprüfung:** `node scripts/sprint10-preflight-sql.js` (grün) + read-only bestätigen, dass `to_regclass('public.document_findings') is null` (noch nicht da).
- **Smoke-Test:** nach Anwendung `select count(*) from document_findings` = 0; `\d document_findings` zeigt FK auf raw_documents (ON DELETE CASCADE).
- **Stop-Bedingung:** Migration wirft Fehler / Tabelle existiert bereits mit abweichendem Schema.
- **Rollback:** `20260715_dedup_findings_rollback.sql` (DROP TABLE + Spalten zurück). Idempotent.
- **Andere Migrationen:** source_architecture (20260713), llm_usage-Attribution (20260716), Landesmodul-BE/BB-Seed (20260717) sind **bereits angewendet** (verifiziert). `ko_classification` vor Schritt B read-only prüfen; falls offen, hier mit-anwenden (hat Rollback).

### Schritt B — Shadow-Modus scharf schalten (nur Flags, keine sichtbare Änderung)
- **Was:** Feature-Flags setzen — **Flag-Änderung → freigabepflichtig:**
  - `HELMUT_V3_STORE=1` (V3-Relationalstore schreibt raw_documents/knowledge_objects; Read-Pfade bleiben unverändert)
  - `HELMUT_V3_SHADOW_COMPARE=shadow` (Alt/Neu-Versorgungsvergleich läuft mit, ohne Ranking zu ändern)
  - `HELMUT_SCORING_MODE=shadow` (Scoring wird berechnet, aber **nicht** zum Ranken benutzt)
- **Wirkung:** Lage/Radar/Helmut/Büro bleiben **byte-identisch** (Read-Pfade lesen weiter wie bisher; nur Schatten-Berechnung).
- **Crawl-Frequenz:** unverändert (bestehende Crons 04:00/16:00/20:00 UTC). **Keine Cron-Änderung.**
- **Dokumentlimit/Kosten:** kein zusätzlicher LLM-Aufwand über den Bestand hinaus; Tages-Cap `HELMUT_MAX_LLM_CALLS_PER_DAY` (Default 20) bleibt fail-closed.
- **Smoke-Tests:** nach 1 Crawl-Zyklus read-only: `raw_documents`-Delta plausibel; `cem-shadow-compare`-Verdict = `keine_verschlechterung`; Lage/Radar-Payload-Hash unverändert.
- **Stop-Bedingung:** compareSupply meldet `regression`; Lage/Radar-Payload weicht ab; Kosten steigen unerwartet.
- **Rollback:** Flags zurück auf AUS (inert; Verhalten sofort byte-identisch zum Alt-Zustand). Kein Datenrückbau nötig (V3-Schatten stört Blob/Briefing nicht).

### Schritt C — PARDOK-Ingest für be-plenum/bb-plenum verdrahten (Code, Shadow)
- **Was:** den geprüften `pardok-parser` in den Crawl-Dispatch für `structured_download` einhängen (heute fällt opendata in den RSS-Default). **Deployment (Code) → freigabepflichtig.**
- **Ausgewählte Quellen:** nur `be-plenum` + `bb-plenum` (amtliche Primärquellen, 5-Läufe-stabil).
- **Dokumentlimit:** `max_items`/Record-Cap je Lauf (Default 800; hart konfigurierbar). Streaming/speicherschonend (Puffer ≤14 KB).
- **Kostenlimit:** Parser ist LLM-frei → 0 € zusätzlich für die Extraktion. KI-Kosten entstehen erst durch Understanding (Schritt D).
- **Smoke-Tests:** `node scripts/pardok-parser-test.js` (42 grün) + ein Shadow-Lauf → externe-ID-Menge == Referenz-`docSetHash`.
- **Stop-Bedingung:** externe-ID-Kollision (kein Sammelcluster mehr) / Parserfehler > 0 / Strukturänderung (HTML statt XML erkannt).
- **Rollback:** Code-Revert des Dispatch-Zweigs; be-plenum/bb-plenum bleiben `manual` → kein Auto-Crawl.

### Schritt D — Kontrollierte Quellenaktivierung BE/BB (klein, mit Limits)
- **Was:** die 6 freigegebenen BE/BB-Wege (be-plenum, bb-plenum, be-regionale_leitmedien, rbb24-politik, be-landesregierung, bb-landesregierung) von `needs_review`/`manual` auf `active`/`auto` setzen. **Quellenaktivierung → freigabepflichtig.** Die 3 bot-gesperrten Parteiquellen bleiben **ausgeschlossen**.
- **Crawl-Frequenz:** in den bestehenden Rhythmus (kein neuer Cron); optional zunächst 1×/Tag.
- **Dokumentlimit:** je Weg `max_items` (RSS/GN 20, Open-Data 800); Gesamt-Beobachtung über Watchdog.
- **Kostenlimit:** Understanding der neuen Dokumente kostet LLM — Tages-Cap fail-closed; empfohlene Obergrenze für die ersten Tage als expliziter Wert festlegen (**Kostenrisiko → Rückfrage**, falls > Cap).
- **Wirkung Profile:** Berlin/Brandenburg-Landtagsprofile wechseln berlin-basis/brandenburg-basis von `requested_unsupplied` → aktiv (Landespolitik wird sichtbar). Bundespolitik bleibt sichtbar.
- **Smoke-Tests:** `computeGlobalActivation` mit Berlin/Brandenburg-Profil → Landespaket aktiv; Landesdokumente erscheinen; Cem unverändert 145 Wege.
- **Stop-Bedingung:** Cem verliert Wege; Bundespolitik verschwindet für Landtagsprofile; Watchdog meldet Paketunterversorgung/Kostenanstieg.
- **Rollback:** Wege zurück auf `manual`/`needs_review` (Referenzzählung entzieht die Aktivierung sofort; keine Datenlöschung).

### Schritt E — Sichtbarer Cutover (Scoring/Neu-Read scharf)
- **Was:** `HELMUT_SCORING_MODE=on` (Lage/Radar/Helmut ranken nach den neuen Dimensionen); optional `HELMUT_PROFILE_DB_MODE=1`. **Sichtbarer Cutover + Flag-Änderung → freigabepflichtig.**
- **Vorbedingung:** Schritte B–D mehrere Tage grün im Shadow; compareSupply dauerhaft `keine_verschlechterung`.
- **Smoke-Tests:** Lage/Radar/Helmut liefern für Cem gleichwertige/bessere Ergebnisse (mehr Dokumente gelten **nicht** automatisch als besser — Bewertung an Relevanz/Handlungsfähigkeit); drei Leerzustände korrekt.
- **Stop-Bedingung:** Regression in Cem-Briefingqualität/Relevanz; Laufzeit/Kosten über Limit.
- **Rollback:** `HELMUT_SCORING_MODE=shadow`/`off` (sofort byte-identisch zum Alt-Ranking).

---

## Zusammengefasste Pflicht-Freigaben (nur diese brauchen den Gründer)
| Schritt | Art | Freigabe-Grund |
|---|---|---|
| A | Production-Migration | `document_findings` anlegen |
| B | Feature-Flags | V3_STORE / SHADOW_COMPARE / SCORING=shadow |
| C | Deployment | PARDOK-Dispatch-Code |
| D | Quellenaktivierung + Kostenrisiko | 6 BE/BB-Wege aktiv + LLM-Cap |
| E | Sichtbarer Cutover + Flag | SCORING=on |

**Keine Cron-Änderung nötig** (bestehende Crons genügen; optionaler Shadow-Cron wäre ein eigener, separat freizugebender Schritt).

## Erwartete Laufzeit / Kosten
- Migrationen A: Sekunden. Flag-Schaltung B/E: sofort. PARDOK-Ingest C: ~2 s/Quelle (streaming). BE/BB-Crawl D: im bestehenden Zyklus, wenige Sekunden Fetch je Weg.
- Zusatzkosten: Extraktion/Dedup/Klassifikation **0 €** (LLM-frei). Reale KI-Kosten entstehen nur durch Understanding der **neuen** BE/BB-Dokumente in Schritt D — durch Tages-Cap fail-closed gedeckelt.

## Globale Stop-Bedingungen (jederzeit)
Sofort stoppen + Rollback des jeweiligen Schritts, wenn: compareSupply `regression` · Cem verliert Abrufwege · Bundespolitik verschwindet für ein Profil · unerwarteter Kostenanstieg · Parser-/Pipeline-Fehlerquote steigt · Tenant-/Shadow-Leck im sichtbaren Nutzerpfad · eine erwartete Menge/Aktivierung weicht ab.

## Vollständiger Rollback (Gesamt)
Rückwärts E→A: Flags AUS (sofort byte-identisch) → Wege auf manual → Code-Revert PARDOK → Flags AUS → Migration-Rollbacks (jede Migration hat `_rollback.sql`, Rollback-Symmetrie im adversarialen Test bestätigt). Kein Datenverlust an bestehenden Beständen.
