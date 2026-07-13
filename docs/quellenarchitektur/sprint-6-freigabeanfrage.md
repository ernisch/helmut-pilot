# Sprint 6 — Production-Freigabeanfrage (Migration bestehender Quellen + Shadow-Betrieb)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Vorbereitet in Stufe 1 (offline/read-only). Nichts davon ist ausgeführt.**

Diese Anfrage bündelt die **freigabepflichtigen** Production-Schritte, um die bestehenden
Bund-Quellen in die neue relationale Struktur zu überführen und den **Shadow-Betrieb** (neuer
Pfad läuft parallel, ohne den Blob-Live-Pfad zu ersetzen) scharfzuschalten. Der eigentliche
**Cutover** (neuer Pfad wird führend) ist **NICHT** Teil dieser Anfrage — er folgt separat,
erst nachdem der Shadow-Vergleich gegen echte Produktionsdaten grün ist.

> **Bitte um ausdrückliche Freigabe.** Ohne Freigabe wird kein einziger Schritt ausgeführt.

---

## 1. Exakt auszuführende Schritte (in dieser Reihenfolge)

Alle Migrationen sind **additiv und idempotent** (offline geprüft: `test:sprint6-cem-migration`).

| # | Schritt | Befehl / Aktion | Art |
|---|---------|-----------------|-----|
| 1 | **Backup-Marke** setzen | Supabase-Snapshot/PITR-Zeitpunkt notieren | Sicherung |
| 2 | Struktur-Migration | `supabase/migrations/20260713_source_architecture.sql` anwenden | additiv (neue Tabellen) |
| 3 | Seed einspielen | `supabase/seeds/20260713_source_architecture_seed.sql` anwenden | additiv (`on conflict`) |
| 4 | Kostenattribution | `supabase/migrations/20260716_llm_usage_source_attribution.sql` anwenden | additiv (4 Spalten) |
| 5 | Struktur verifizieren | `list_tables` / Zählungen (siehe §5) | read-only Prüfung |
| 6 | Schatten-Persistenz an | Env `HELMUT_V3_STORE=shadow` setzen (kein Cutover) | Flag (reversibel) |
| 7 | Shadow-Vergleich an | Env `HELMUT_V3_SHADOW_COMPARE=shadow` setzen | Flag (reversibel) |
| 8 | 1–2 Crawl-Zyklen abwarten | regulärer Crawl schreibt zusätzlich `raw_documents` (Schatten) | Beobachtung |
| 9 | **Cem-Dryrun gegen echte Daten** | `npm run sprint6:dryrun` (read-only) | Prüfung (Gate) |
| 10 | Ergebnis dokumentieren | Cem-Vergleich + Mapper-Verdict festhalten | Bericht |

**Cutover (führender Pfad, Cron-Umstellung, `HELMUT_PROFILE_DB_MODE` scharf, Berlin/BB-Aktivierung)
ist bewusst NICHT enthalten** — separate Freigabe nach grünem Schritt 9.

---

## 2. Risiken

| Risiko | Eintritt | Schwere | Minderung |
|--------|----------|---------|-----------|
| Schema-Migration kollidiert mit Bestand | sehr gering (rein additiv, `if not exists`) | niedrig | Idempotenz offline geprüft; Rollback vorhanden |
| Seed dupliziert Zeilen | sehr gering (`on conflict`) | niedrig | Idempotent; wiederholbar |
| Schatten-Ingest erhöht DB-Last/Kosten | gering | mittel | nur `raw_documents`-Writes; kein zusätzlicher KI-Call; Flag sofort abschaltbar |
| Cem-Versorgung verschlechtert sich | **offline widerlegt** (0 Regression) | hoch (falls doch) | Schritt 9 ist Gate; bei Regression → Flags aus, kein Cutover |
| `llm_usage`-Spalten stören Bestandsschreiber | keiner (ältere Zeilen bleiben NULL) | niedrig | additiv; `buildLlmUsageRecord` bereits kompatibel |
| RLS lässt neue Tabellen offen | gering | mittel | Migration setzt RLS + service_role-Write (Bestandmuster); in §5 verifizieren |

**Grundsatz:** Bis einschließlich Schritt 10 bleibt der **Blob-Live-Pfad unverändert führend**.
Der neue Pfad ist reiner Schatten. Jede Abweichung → Flags aus (§3), kein Datenverlust.

---

## 3. Rollback

Vollständig und symmetrisch (offline geprüft):

1. **Flags zuerst zurück:** `HELMUT_V3_SHADOW_COMPARE` und `HELMUT_V3_STORE` leeren/`off`.
   → Schatten-Pfad ist sofort inert; Live-Pfad war nie betroffen.
2. **Kostenattribution zurück:** `supabase/migrations/20260716_llm_usage_source_attribution_rollback.sql`
   (droppt die 4 Spalten + Indizes).
3. **Struktur + Seed zurück:** `supabase/migrations/20260713_source_architecture_rollback.sql`
   (droppt alle 11 neu angelegten Tabellen inkl. Seed-Zeilen per `cascade`, FK-Reihenfolge korrekt).

Da alle Schritte **additiv** sind, entfernt der Rollback ausschließlich neu Angelegtes; **keine**
bestehende Tabelle/Spalte/Zeile wird berührt. Reihenfolge: Flags → llm_usage → Struktur.

---

## 4. Erwartete Dauer

| Schritt | Dauer (Schätzung) |
|---------|-------------------|
| Migrationen 2–4 (DDL + Seed ~145 Abrufwege/Pakete/Geo/Entitäten) | **< 1 Minute** |
| Verifikation (Schritt 5) | 2–3 Minuten |
| Flags setzen (6–7) | < 1 Minute |
| Schatten-Beobachtung (Schritt 8, 1–2 Crawl-Zyklen) | **abhängig vom Crawl-Takt** (i. d. R. Stunden, kein aktives Warten) |
| Dryrun + Doku (9–10) | 5–10 Minuten |
| **Aktives Arbeitsfenster gesamt** | **~15 Minuten** (plus passive Schatten-Beobachtung) |
| Rollback (falls nötig) | **< 2 Minuten** |

---

## 5. Prüfungen nach der Migration

**Direkt nach Schritt 4 (Struktur/Seed/Attribution):**
- `list_tables`: 11 neue Tabellen vorhanden (`geographies`, `electoral_districts`,
  `political_entities`, `publishers`, `retrieval_paths`, `source_packages`, `package_paths`,
  `path_expected_levels/_geographies/_topics/_entities`).
- Zeilenzahlen: `retrieval_paths ≈ 145`, `publishers ≈ 51`, `source_packages` = Katalogzahl,
  `geographies ≥ 50`. Abgleich gegen `buildFullModel()` (Referenzzahlen aus dem Code).
- `llm_usage`: Spalten `source_id/package_id/vorgang_id/knowledge_object_id` existieren, ältere
  Zeilen NULL.
- **RLS:** neue Tabellen haben RLS aktiv, Lesezugriff für angemeldete Nutzer, Schreibzugriff nur
  `service_role` (`get_advisors` / Policy-Check).

**Nach Schatten-Ingest (Schritt 9, das eigentliche Gate):**
- `npm run sprint6:dryrun` → **Mapper-Verdict `OK`** (keine `kritisch`-Quelle: keine beobachtete
  `source_id` mit Dokumenten ohne Abrufweg/Orphan-Klassifikation).
- **Cem-Vergleich `keine_verschlechterung`/`erklaerte_konsolidierung`**, `regression=false`,
  `docsAtRisk=0`. Erwartet: die 6 `cem-ince-news-*`-Konsolidierungen tragen **keine exklusiven**
  Dokumente (sonst Prüfbedarf statt Cutover).
- Admin-Quellenarchitektur (Sprint 8) lädt stabil; Kosten je Quelle beginnen sich zu füllen.

**Abbruchkriterium:** Mapper `kritisch` **oder** Cem `regression` → Flags aus, kein Cutover,
Ursache analysieren.

---

## 6. Bewusst weiterhin DEAKTIVIERTE Berlin- und Brandenburg-Quellen

Die Landesmodul-Kandidaten aus Sprint 9 bleiben **ausdrücklich deaktiviert** (`prepared`,
Reifegrad `kandidat`/`unbesetzt`). Diese Migration aktiviert **keine** davon. Die Landespakete
`berlin-basis` und `brandenburg-basis` bleiben auf Status `prepared`.

**Berlin (15 Kandidaten, alle Reifegrad `kandidat` — deaktiviert):**
landesparlament, plenum, ausschuesse, drucksachen, schriftliche_anfragen, gesetzgebung,
landesregierung, staatskanzlei, ministerien, landesfraktionen, regionale_leitmedien,
oer_landesberichterstattung, partei_pilot, fraktion_pilot, person_pilot.

**Brandenburg (13 Kandidaten Reifegrad `kandidat` + 2 unbesetzt — deaktiviert):**
landesparlament, plenum, ausschuesse, drucksachen, schriftliche_anfragen, gesetzgebung,
landesregierung, staatskanzlei, ministerien, landesfraktionen, regionale_leitmedien,
oer_landesberichterstattung, partei_pilot · **unbesetzt:** fraktion_pilot, person_pilot.

**Grund für die anhaltende Deaktivierung:**
1. **Byte-genaue Verifikation ausstehend** — jeder Kandidat trägt `verifyBeforeActivation:true`
   (URLs WebSearch-belegt, in dieser Umgebung nicht byte-genau abrufbar).
2. **Reifegrad `kandidat`** — noch nicht `verifiziert`/`bereit`; Aktivierung wäre ein eigener,
   separat freizugebender Schritt.
3. **Brandenburg fraktion_pilot/person_pilot bleiben `unbesetzt`**, bis ein echtes Pilotprofil
   feststeht (kein Ersatz durch fremde Partei/Person).

Eine Aktivierung der Berlin/Brandenburg-Quellen ist **nicht** Gegenstand dieser Freigabe und
erfordert eine **eigene** Anfrage nach abgeschlossener technischer Verifikation.

---

## 7. Zusammenfassung

- **Additiv, idempotent, reversibel.** Bis Schritt 10 bleibt der Live-Pfad unverändert führend.
- **Cem-Schutz offline nachgewiesen:** 143/149 Quellen 1:1 erhalten, 6 erklärte Konsolidierungen,
  2 Gewinn, **0 Regression** — der echte-Daten-Abgleich (Schritt 9) ist das verbindliche Gate.
- **Kein Cutover, keine Cron-Änderung, keine Berlin/BB-Aktivierung** in dieser Anfrage.
- **Benötigt:** ausdrückliche Freigabe für Schritte 1–10.
