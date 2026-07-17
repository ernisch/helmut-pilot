# Sprintplan — Neue Quellenarchitektur (abhängigkeitsgetrieben)

**Stand:** 2026-07-13 · Grundlage: `00-ist-architektur-und-abweichungen.md` (Phase 0/1) +
Auftragsphasen 0–13.

## Leitprinzipien

1. **Sicher & reversibel zuerst.** Jeder Sprint liefert nur additive, offline-testbare Arbeit
   (Migrationsdateien, Code, Seeds, Tests, Doku). Prod-Migration, RLS-Änderung, neue Quellen live,
   kostenrelevante Crawls, Deployments = **freigabepflichtig** und werden vorbereitet, nicht ausgeführt.
2. **Alte Architektur bleibt funktionsfähig.** Die neue Struktur wird parallel als
   Kompatibilitätsschicht aufgebaut; `helmut_store`-Blob bleibt Wahrheit bis zur Freigabe.
3. **Produktnutzen vor Eleganz.** Jeder Sprint beantwortet mindestens eine der drei Kernfragen: Was
   soll der Politiker tun? Warum ist es wichtig? Was passiert, wenn nichts getan wird?
4. **Reihenfolge = Datenabhängigkeit.** Nichts wird gebaut, dessen Voraussetzung fehlt.

## Abhängigkeitsgraph (Kurzform)

```
S1 Fundament-Datenmodell  ──┬─► S2 KO-Klassifikation (Ebene/Geo/Entität)
(Herausgeber/Abrufweg/     │
 Paket/Geografie/Entität)  ├─► S3 Dedup + Fundstellen + Google-News-Suchweg
                           │
                           ├─► S4 Paketaktivierung + Profil→Paket + Bund Basis + Refcount
                           │
                           └─► S7 Qualitäts-/Kostenmetriken (llm_usage) ─► S8 Admin-Oberfläche
S2 ──► S5 Wichtigkeit vs. Relevanz vs. Handlungsfähigkeit + 3 Leerzustände
S1..S5 ──► S6 Migration + Shadow-Betrieb + Alt-gegen-Neu-Vergleich (Pilot-Schutz)
S1+S2+S4 ──► S9 Berlin/Brandenburg strukturell + Quellenrecherche
alle ──► S10 Tests/Security/Performance/Doku + Freigabebericht
```

`S1` ist die Wurzel und blockiert `S2`, `S3`, `S4`, `S7`. `S8`, `S9` sind die späten Integratoren.

---

## Sprint 1 — Relationales Quellen-Fundament *(dieser Sprint)*

**Auftragsphasen:** 2 (Zielmodell) + Vorbereitung von 6 (Migration) · **Abhängigkeit:** keine (Wurzel).

**Produktnutzen:** Erst wenn Herausgeber, Abrufwege und Pakete als sauberes, abfragbares Modell
existieren, sind die Abnahmekriterien 1–4 (eine Quelle nur einmal; Abrufwege getrennt; ein Abrufweg
versorgt mehrere Pakete; global nur einmal gecrawlt) überhaupt erreichbar. Ohne dieses Fundament
lässt sich weder Landesfähigkeit (Berlin/BB) noch Kostenmessung noch Admin-Transparenz bauen.

**Umfang (alles additiv, keine Prod-Migration):**
1. **Migrationsdateien (vorbereitet, nicht angewendet)** für global geteilte, RLS-neutrale Tabellen:
   `publishers`, `retrieval_paths`, `source_packages`, `package_paths` (m:n),
   `path_package_activation`-Refcount-Sicht/Felder, `geographies` (Hierarchie), `electoral_districts`
   (Wahlkreis separat), `political_entities` (typisiert) + die Abrufweg-Erwartungs-Assoziationen
   (Ebene/Geografie/Thema/Entität) — je mit **Rollback-Migration**.
2. **Katalog-Abbildungs-Layer (reiner Code, nicht verdrahtet):** deterministischer Mapper, der den
   bestehenden `v1Sources`-Katalog (144) + 13 Orphans in Herausgeber/Abrufweg/Paket zerlegt; Google
   News wird als Abrufweg-Methode (`googlenews_search`) statt als Herausgeber behandelt.
3. **Seed-Daten (Repo-Dateien):** `publishers` (aus `sourceSafety`-Domain-Register), `geographies`
   (16 Länder + Berlin/BB-Grundstruktur + Bundeswahlkreis-Stub), `political_entities` (Parteien/
   Fraktionen/Ausschüsse/Ministerien aus `normalizeParty`/`normalizeCommittee`-Synonymen),
   `source_packages` (Bund Basis, Arbeit&Soziales, Die-Linke-Bund `active`; Berlin/Brandenburg Basis
   `prepared`).
4. **Reine Funktionen + Unit-Tests (offline):** Herausgeber-Normalisierung, URL-Normalisierung/
   Canonical/Inhaltsfingerabdruck, Abrufweg-Methoden-Klassifikation, Entitätstyp- und
   Geografie-Zuordnung, Statuswechsel-Regeln, Paketzuordnung, Refcount.
5. **Dokumentation + ADRs:** Zielarchitektur, Datenmodell, Quellenmodell, Paketmodell, Migrations-/
   Rollback-Plan (Sprint-1-Teil), Architektur-Entscheidungen.

**Nicht-Ziele (spätere Sprints):** KO-Klassifikationsfelder (S2), Fundstellen-Ingest (S3),
Live-Aktivierung/Refcount-Verdrahtung im Scheduler (S4), Kosten-Telemetrie (S7), Admin-UI (S8),
echte Berlin/BB-Quellen aktivieren (S9). Keine Verdrahtung in den Live-Crawl.

**Abnahme Sprint 1:** `node --check` grün; neue Unit-Tests grün; bestehende Test-Suite unverändert
grün (keine Regression); Katalog-Mapper bildet alle 144 + 13 Einträge verlustfrei ab; Migrationen +
Rollback syntaktisch valide; Doku vollständig. **Kein** Live-Verhalten geändert.

**Sicherheit/Rollback:** Keine Prod-Änderung. Rollback = neue Dateien entfernen (nichts verdrahtet).

---

## Sprint 2 — Knowledge-Object-Klassifikation (Ebene · Geografie · Entität)

**Auftragsphase:** 3 · **Abhängig von:** S1 (Geografie-/Entitäts-Tabellen als FK-Ziele).

**Nutzen:** Ohne `decision_level`/Geografie am KO gehen Landesinhalte im Bundesrauschen unter (härtester
verdeckter Verlust für Landtagsprofile). **Umfang:** `decision_level`, `related_levels`,
`affected_geographies`, `mentioned_geographies`, `decision_entities`, `related_entities`, Ereignistyp,
Fristen, Dringlichkeit, dimensionierte Konfidenz in **den einen** Understanding-Call ziehen;
Whitelist-Falle (Schema ↔ Assembler ↔ Spalten-Whitelist) beheben; Embedding write-time persistieren;
KO-Spalten-Migration + Backfill-Konzept für die 231 Alt-KOs. Ebenen-Enum 2→5 (`international/eu/bund/
land/kommune`), entkoppelt vom Parlamenttyp.

---

## Sprint 3 — Globale Deduplizierung · Fundstellen · Google News als Suchweg

**Auftragsphase:** 4 · **Abhängig von:** S1 (Herausgeber/Abrufweg für Fundstellen).

**Nutzen:** Ein Artikel über zehn Suchwege darf nur ein Raw Document + einmal KI-Kosten erzeugen; alle
Fundstellen bleiben nachvollziehbar. **Umfang:** Fundstellen-Relation (`raw_document × Abrufweg ×
original_url × found_at`); globale Dedup-Stufe **vor** Understanding (bereinigte URL + Canonical +
Herausgeberdomain + Titel-SimHash + Datumsfenster + echter Inhaltsfingerabdruck); `content_hash` vom
echten Fingerprint trennen; Canonical am Ingest aus `<link rel=canonical>`/`og:url` lesen;
`cluster_id`/`vorgang_id` persistieren.

---

## Sprint 4 — Paketaktivierung · Profil→Paket-Ableitung · Bund Basis · Referenzzählung

**Auftragsphase:** 5 · **Abhängig von:** S1 (Pakete).

**Nutzen:** Profile bekommen automatisch Pakete; hundert Profile für „Berlin Basis" lösen trotzdem nur
einen Crawl aus. **Umfang:** Profil→Paket-Regel auf `mandate_profiles` (Bundestag → min. Bund Basis;
Landtag → Bund Basis + Landespaket); Pflicht-Basispaket-Garantie + Admin-Warnung bei Verstoß;
Referenzzählung (aktive Profile → aktive Pakete → aktive Abrufwege); Crawl von profilgebunden auf
**global-once** entkoppeln (`runSourceCrawl(politicianId)`-Umbau mit Kompat-Shim); `lage-check` unter
denselben Crawl-Lock.

---

## Sprint 5 — Globale Wichtigkeit vs. persönliche Relevanz vs. Handlungsfähigkeit · 3 Leerzustände

**Auftragsphase:** 3 (Produktlogik) · **Abhängig von:** S2 (Ebenen/Geografie für Wichtigkeit).

**Nutzen:** Lage darf nicht zur persönlichen Filterblase werden; der Nutzer darf „Datenlücke" nie mit
„ruhiger Tag" verwechseln. **Umfang:** write-time globaler `importance`-Score (mandantenlos) getrennt
vom persönlichen Relevanz-Score und einer eigenen `actionability`-Dimension; Lage rankt nach
Wichtigkeit, Radar nach Relevanz, Helmut nach Handlungsfähigkeit; Recency-Fallback ersetzen; die 3
Leerzustände server- und UI-seitig unterscheidbar machen (Frische-/Qualitätssignal pro Tab).

---

## Sprint 6 — Migration bestehender Quellen · Shadow-Betrieb · Alt-gegen-Neu-Vergleich (Pilot-Schutz)

**Auftragsphasen:** 6 + 7 · **Abhängig von:** S1–S5.

**Nutzen:** Die Versorgung des Pilotmandanten darf sich nicht verschlechtern; Datenverlust wird ausgeschlossen. **Umfang:**
144 Quellen + 13 Orphans + `dip` vollständig in die neue Struktur überführen (Mapper aus S1 gegen echte
`raw_documents.source_name` validieren, 713 Publisher-Strings kanonisieren); Orphans markieren
(`test-mdb-*` = Testmüll, `<pilot-mandats-id>-news-*` = Legacy); defekte Pflichtquellen sichtbar + Ersatzabrufweg;
Feature-Flag/Umschalter + Shadow-Betrieb; strukturierter Alt-gegen-Neu-Vergleich für den Pilotmandanten (Doku-Menge,
KOs, Vielfalt, Lage/Radar/Helmut, Laufzeit, Kosten, Leerzustände). **Prod-Migration erst nach Freigabe.**

---

## Sprint 7 — Qualitäts- & Kostenmessung · Watchdog-Teilprozesse

**Auftragsphase:** 8 · **Abhängig von:** S1 (Abrufweg/Paket-Dimensionen), teils S3/S6 (Metriken).

**Nutzen:** Eine Quelle kann technisch gesund und produktseitig unbrauchbar sein — das muss messbar
werden; kaputte Teilprozesse dürfen nicht verdeckt werden. **Umfang:** `llm_usage` als indizierte,
mandantenisolierte Tabelle (Ablösung des Blob-Rings), `sourceId`/`packageId`/`vorgangId`/`pipelineStep`
in `buildLlmUsageRecord`; kostenbasierter Deckel statt Call-Count, am Understanding-Pfad; drei
Qualitätsarten je Quelle (technische Gesundheit, inhaltlicher Ertrag, Produktnutzen); Watchdog von 3
auf N Teilprozess-Achsen (Crawl/Understanding/KO/Matching/Briefings/Lage/kritische Quellen/
Paketversorgung/Frische/Kosten).

---

## Sprint 8 — Admin-Oberfläche

**Auftragsphase:** 9 · **Abhängig von:** S1 (Lesevertrag) + S7 (Metriken/Kosten).

**Nutzen:** Der Gründer sieht auf einen Blick, welche Quellen funktionieren, welche Geld ohne Nutzen
kosten und was als Nächstes zu tun ist. **Umfang:** ruhige Ansichten in bestehender App-Optik
(`adminSection`/`dsCard`): Länder&Pakete, Quellen (Herausgeber→Abrufwege, Status, Frische, KO-Ausbeute,
Kosten, relevante Profile), Prüfbedarf (nur konkrete Probleme + empfohlene Aktion), Quellendetail.
Keine Diagramme ohne Handlungsempfehlung.

---

## Sprint 9 — Berlin & Brandenburg strukturell · Quellenrecherche

**Auftragsphasen:** 10 + 11 · **Abhängig von:** S1 (Geografie/Pakete) + S2 (Ebenen) + S4 (Aktivierung).

**Nutzen:** Der erste Landesausbau (Berlin/Brandenburg) wird startklar vorbereitet, ohne Kosten zu
verursachen. **Umfang:** geografische Einheiten + Paketvorlagen + Pflichtklassen je Landesmodul;
Quellenkandidaten (Landtag/Abgeordnetenhaus, Regierung/Senat, Ministerien/Senatsverwaltungen,
Landesfraktionen, Regionalmedien, ÖR-Landesberichterstattung) technisch prüfen (RSS/API/HTML, Datum,
Originaladresse, Parser-Aufwand, Duplikate, Kosten); als **`prepared`** speichern bzw. in Seed-Dateien
dokumentieren. **Keine Live-Aktivierung ohne Freigabe.**

---

## Sprint 10 — Tests · Sicherheit · Performance · Doku · Freigabebericht

**Auftragsphasen:** 12 + 13 · **Abhängig von:** allen.

**Umfang:** vollständige Unit-/Integrations-/Migrations-/E2E-Tests (inkl. negative & Edge-Cases:
kaputte/doppelte/mehrländrige Quellen, Profile ohne Paket, Paket ohne Profil, Datenlücken, Rollback);
Security-Review (RLS/SECURITY-DEFINER/App-Guard); Performance (keine KI beim App-Start, vorberechnetes
Matching, Indizes); Worst-Case-Analyse (Auftrag §43); finaler Freigabebericht mit exakter
Production-Schrittliste + Rollback.

---

## Freigabepflichtige Schritte (über alle Sprints, gesammelt)

Diese werden **vorbereitet**, aber erst nach ausdrücklicher Freigabe ausgeführt:
Prod-Migrationen anwenden · Pilotprofil in `mandate_profiles` schreiben · `HELMUT_PROFILE_DB_MODE`
scharf · echtes Supabase-Auth/RLS scharf · Cron-Änderungen (global-once-Crawl) · neue Quellen
(Berlin/BB) live · kostenrelevante Backfill-Crawls · Deployments.
