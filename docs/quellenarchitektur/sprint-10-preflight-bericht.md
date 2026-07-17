# Sprint 10 — Finaler Production-Preflight-Bericht (Quellenarchitektur-Migration + Shadow)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** vollständiger, unabhängig-adversarialer Preflight. **Keine Production-Änderung
ausgeführt.** Prüfung durch 4 unabhängige adversariale Agenten + deterministische SQL-/Code-Analyse.

---

## 0. Go / No-Go — differenzierte Empfehlung

| Block | Empfehlung | Begründung |
|-------|-----------|------------|
| **Additive Migration** (`20260713` Struktur + Seed, `20260716` llm_usage) | **✅ GO** | Idempotent, additiv, rollback-symmetrisch, **dormant** (kein Live-Pfad liest die Tabellen). |
| **Flag-Schritte der alten Sprint-6-Anfrage** (`HELMUT_V3_STORE=shadow`, `HELMUT_V3_SHADOW_COMPARE=shadow`) | **⛔ NO-GO (STOP)** | **Kritischer Befund P0:** `HELMUT_V3_STORE` ist kein Schatten-Schalter, sondern das **bereits produktiv aktive** Master-Gate des Live-Reads. `"shadow"` ist kein gültiger Flag-Wert (→ `false`) und würde den V3-Read **ausschalten** → Blackout für den Pilotmandanten. |
| **Cutover** (Read-Umschaltung, `HELMUT_PROFILE_DB_MODE`, Cron, BE/BB) | **⛔ NICHT Teil dieser Freigabe** | Bewusst ausgeschlossen; kein automatischer Trigger vorhanden (verifiziert). |

**Netto:** **GO für die reine additive Migration** (Schritte M1–M5 unten), **STOP für jede
Flag-Änderung an `HELMUT_V3_STORE`** in der ursprünglich dokumentierten Form. Der
Shadow-Vergleich läuft **manuell** (`npm run sprint6:dryrun`), nicht über ein Live-Flag.

> **Wichtigster Preflight-Ertrag:** Der adversariale Review hat einen **kritischen Fehler in der
> eigenen Sprint-6-Freigabeanfrage** aufgedeckt (Flag-Semantik). Die korrigierte Schrittfolge
> steht in §2. Die alte Anfrage (`sprint-6-freigabeanfrage.md`) ist entsprechend als überholt markiert.

---

## 1. Ergebnisse der 17 Prüfpunkte

| # | Prüfpunkt | Ergebnis | Beleg |
|---|-----------|----------|-------|
| 1 | Migrationen/Seeds exakte Reihenfolge | ✅ | numerisch aufsteigend; Seed **nach** `20260713`-Schema; `20260712`-Trio reihenfolge-unabhängig |
| 2 | Idempotenz jeder Migration | ✅ | `sprint10-preflight-sql` 51/51; jede `create policy` mit `drop policy if exists`-Guard |
| 3 | Rollback-Symmetrie | ✅ | alle Tabellen/Spalten gedroppt, FK-sichere Reihenfolge, durchgängig `if exists` |
| 4 | RLS neue Tabellen | ✅ | RLS auf allen 11 Tabellen aktiv, **bewusst keine** Policy → nur `service_role` |
| 5 | Service-Role-Zugriff | ✅ | Server fährt service_role (RLS-Bypass); JWT-Pfad tot (`tenantJwtModeEnabled=false`) |
| 6 | Mandantentrennung Bestand | ✅ | neue Tabellen ohne tenant/user_id; keine Änderung an Bestands-Policies |
| 7 | V3-Read-Path | ⚠️ | Read ist **V3/knowledge_objects** (kein Blob-Fallback); Migration ändert ihn **nicht**, ein Flag-Fehlgriff aber schon (→ P0) |
| 8 | App-Start + Admin-Ladezeit | ✅ | kein Live-LLM; Admin-Report try/catch→null, +2 parallele Reads; neue Tabellen werden **nicht** gelesen |
| 9 | Scheduler/Crawl/Watchdog | ✅ | Crawl nutzt v1Sources (nicht buildFullModel); Shadow doppelt fail-safe; Watchdog read-only |
| 10 | Zusätzliche Crawl-/KI-Kosten | ✅ | Migration + Shadow-Compare-Flag erzeugen **0** KI-Calls; kein zweiter Understanding-Pfad |
| 11 | Pilot Alt-vs-Neu | ✅ (nach Fix) | 143/149 erhalten, 6 erklärt (orphan_legacy), 2 Gewinn, 0 Regression; **Schutznetz-Bugs M2/M3 behoben** |
| 12 | Teilweise Migration | ✅ | additiv, dormant; **einzige Kopplung HOCH-1**: `decision_level`-Code braucht `20260714` zuerst |
| 13 | Abgebrochener Seed | ✅ | transaktional (begin/commit) + idempotent (on conflict); Parser-geprüft (keine Dup-PK/UNIQUE, FKs auflösbar) |
| 14 | Shadow-Fehler | ✅ | `persistRawDocumentsShadow` try/catch + `.catch(()=>{})`; Live-Blob zuerst; kein throw |
| 15 | Fehlende Tabellen/Telemetrie | ✅ | überall availability-Flags / `null` / „nicht verfügbar"; kein harter Fehler |
| 16 | Berlin/Brandenburg deaktiviert | ✅ | Pakete `prepared`, 0 Abrufwege, 0 aktive; auch generierter Seed erzeugt 0 BE/BB-Zeilen |
| 17 | Kein stiller/automatischer Cutover | ✅ | `buildFullModel` nur read-only Admin; alle Cutover-Flags default AUS; Module nur in `scripts/` |

**Behobene echte Befunde (in diesem Preflight):**
- **M2** (`supply-shadow-compare.js`): blinder Prefix-Match hätte `X-fake` fälschlich zu `X`
  konsolidiert → Konsolidierung jetzt nur für **explizit deklarierte** Basis-IDs.
- **M3** (`supply-shadow-compare.js`): fehlende Dokumentzahl galt als „0" → jetzt `null` (unbekannt),
  unerklärter Wegfall mit unbekannter Zahl → **konservativ Regression**.
- **N1** (`20260713`): widersprüchlicher Kopfkommentar („Lesezugriff für angemeldete Nutzer")
  an Ist-Zustand angeglichen (RLS ohne Policy, nur service_role).
- **NIEDRIG-3** (`20260716`): transaktional geklammert (begin/commit) + `notify pgrst`.

**Dokumentierte, nicht in dieser Freigabe behobene Betriebsregeln:**
- **HOCH-1 (Deploy-Reihenfolge):** `understanding.js` schreibt `decision_level` (aus `20260714`).
  Code darf **nie vor** `20260714` live gehen, sonst brechen KO-Writes still (PGRST204). Da der
  V3-Motor produktiv läuft, ist `20260714` **bereits angewendet** — vor Anwendung per
  `list_migrations` bestätigen.
- **MITTEL-2 (`notify pgrst`):** `20260714` sollte den Schema-Reload anstoßen; bei bereits
  angewendeter Migration nur relevant, falls erneut ausgeführt (Datei bewusst **nicht** geändert,
  da evtl. in Prod).
- **M1 (`HELMUT_PROFILE_DB_MODE`):** koppelt Profil-Write **und** Read-Cutover — **kein** reiner
  Shadow-Modus. Im Shadow-Betrieb **AUS** lassen (siehe §9/§10).

---

## 2. Exakte Schrittfolge (korrigiert)

**Vorbedingung V0 — Ist-Zustand verifizieren (read-only, PFLICHT):**
- `list_migrations` / `list_tables`: welche Migrationen sind bereits angewendet? Erwartung:
  V3-Kern + `20260714` angewendet (Motor läuft); `20260713` Struktur + Seed + `20260716`
  **noch nicht**. **Aktuellen Wert von `HELMUT_V3_STORE` in Prod ablesen** (Erwartung: `1`).

| Schritt | Aktion | Art |
|---------|--------|-----|
| **M0** | Backup/PITR-Zeitpunkt notieren | Sicherung |
| **M1** | `20260713_source_architecture.sql` anwenden | additiv, DDL |
| **M2** | `20260713_source_architecture_seed.sql` anwenden | additiv, `on conflict` |
| **M3** | `20260716_llm_usage_source_attribution.sql` anwenden | additiv, 4 Spalten |
| **M4** | Struktur verifizieren (§6 Smoke-Tests) | read-only |
| **M5** | Admin-Quellenarchitektur laden, `npm run sprint6:dryrun` (read-only) | Prüfung |

**Bewusst NICHT ausgeführt:** kein `HELMUT_V3_STORE`-Setzen (bleibt beim Prod-Ist-Wert), kein
`HELMUT_V3_SHADOW_COMPARE` (live inert), **kein** `HELMUT_PROFILE_DB_MODE`, keine Cron-Änderung,
keine BE/BB-Aktivierung, kein Cutover.

> **Zum „Shadow-Betrieb":** Der V3-Schatten-Ingest (`raw_documents`/KO) läuft **bereits**, weil
> `HELMUT_V3_STORE` in Prod aktiv ist. Es ist **kein** zusätzliches Flag zu setzen. Der
> Alt-gegen-Neu-Vergleich ist der **manuelle** `sprint6:dryrun` gegen die vorhandenen Daten.

---

## 3. Jedes einzelne Risiko

| Risiko | Schritt | Schwere | Eintritt |
|--------|---------|---------|----------|
| Struktur-Migration kollidiert | M1 | niedrig | sehr gering (rein additiv, `if not exists`) |
| Seed dupliziert / bricht ab | M2 | niedrig | sehr gering (transaktional + `on conflict`) |
| Externer Publisher gleiche Domain/andere id verletzt `uq_publishers_domain` | M2 | mittel | nur bei manuell vorbestehendem Konflikt-Row (Vorbedingung prüfen) |
| `llm_usage`-Spalten stören Schreiber | M3 | keiner | additiv, dormant (Blob-Schreiber unberührt) |
| **Flag `HELMUT_V3_STORE=shadow` schaltet Read aus** | — | **kritisch** | **nur wenn alte Anfrage befolgt** → **darf nicht ausgeführt werden** |
| `HELMUT_PROFILE_DB_MODE` versehentlich gesetzt → Read-Cutover auf unvollständiges `mandate_profiles` | — | hoch | nur bei Fehlbedienung → in §9 explizit AUS |
| Deploy vor `20260714` → KO-Write-Blackout | — | hoch | nur bei Code-Deploy ohne Migration → **kein Code-Deploy in dieser Freigabe** |
| Neue Tabellen bremsen Admin/App-Start | M4/M5 | keiner | Tabellen werden nicht gelesen |

---

## 4. Rollback pro Schritt

| Schritt | Rollback | Dauer |
|---------|----------|-------|
| M1 Struktur | `20260713_source_architecture_rollback.sql` (droppt 11 Tabellen `cascade`, FK-sicher) | < 30 s |
| M2 Seed | im Struktur-Rollback enthalten (Tabellen-Drop entfernt Seed-Zeilen) | — |
| M3 llm_usage | `20260716_llm_usage_source_attribution_rollback.sql` (droppt 4 Spalten + Indizes, transaktional) | < 15 s |
| M4/M5 | rein lesend — kein Rollback nötig | — |

Alle Rollbacks sind **additiv-invers** und berühren **keine** bestehende Tabelle/Spalte/Zeile.
Reihenfolge bei Vollrücknahme: `20260716`-Rollback → `20260713`-Rollback.

---

## 5. Erwartete Dauer

| Phase | Dauer |
|-------|-------|
| V0 Ist-Verifikation | 3–5 Min |
| M1–M3 (DDL + Seed ~145 Abrufwege/Pakete/Geo/Entitäten + 4 Spalten) | **< 1 Min** |
| M4 Verifikation | 2–3 Min |
| M5 Admin + Dryrun | 5–10 Min |
| **Aktives Arbeitsfenster** | **~15–20 Min** |
| Rollback (falls nötig) | **< 1 Min** |

---

## 6. Smoke-Tests nach jedem Schritt

- **Nach M1:** `list_tables` → 11 neue Tabellen vorhanden; `get_advisors` (security) → erwartete
  INFO `rls_enabled_no_policy` für die 11 (bewusst), **keine** neue WARN/ERROR.
- **Nach M2:** `select count(*)` je Tabelle: `retrieval_paths≈145`, `publishers≈51`,
  `source_packages`=Katalogzahl, `geographies≥50`; **`select count(*) from source_packages where
  status='active' and key in ('berlin-basis','brandenburg-basis')` = 0** (BE/BB inaktiv).
- **Nach M3:** `llm_usage` hat Spalten `source_id/package_id/vorgang_id/knowledge_object_id`,
  ältere Zeilen NULL.
- **Nach M4/M5:** `/api/app/start` liefert **unverändert** Lage/Radar/Helmut des Pilotmandanten (Vorher/Nachher
  vergleichen — MUSS identisch sein); Admin-Quellenarchitektur lädt ohne Fehler;
  `npm run sprint6:dryrun` → Exit 0, Pilot-Verdict `keine_verschlechterung`/`erklaerte_konsolidierung`.

---

## 7. Stop-Bedingungen (sofort abbrechen + Rollback)

1. `/api/app/start` zeigt nach M1–M3 **weniger/leerere** Vorgänge als vorher (Read beeinträchtigt).
2. `get_advisors` meldet eine **neue** Security-WARN/ERROR (nicht die erwartete INFO).
3. Smoke-Test-Zählungen weichen grob vom Katalog ab **oder** eine BE/BB-Quelle erscheint aktiv.
4. `sprint6:dryrun` meldet `verdict=regression` **oder** Mapper `kritisch` (Datenverlust-Risiko).
5. Irgendein Schreibfehler auf einer Bestandstabelle (darf nicht vorkommen — Migration ist additiv).
6. Unsicherheit über den Prod-Wert von `HELMUT_V3_STORE` → **nicht** fortfahren, erst klären.

---

## 8. Kostenlimit

- **Migration + Dryrun:** **0 € KI-Kosten** (reine DDL/Seed + read-only Dryrun; keine LLM-Calls).
- **Laufender Betrieb unverändert:** Der einzige KI-Treiber bleibt der bereits laufende
  Understanding-Pfad (1 Call je **neuem** Vorgang-Cluster, idempotent pro `vorgang_id`,
  90 s-Run-Budget). Die Migration fügt **nichts** hinzu.
- **Empfohlener Deckel vor breiterem Rollout (Betriebshygiene, nicht migrationsbedingt):**
  `HELMUT_MAX_LLM_CALLS_PER_DAY` setzen (sonst `Infinity`), `HELMUT_UNDERSTANDING_LOCK=1`
  erwägen (überlappende Crawl-Crons). **Hartes Preflight-Kostenlimit für diese Freigabe: 0 €.**

---

## 9. Environment-Variablen und erwartete Werte

| Variable | Erwarteter Wert für diese Freigabe | Bedeutung |
|----------|-----------------------------------|-----------|
| `HELMUT_V3_STORE` | **unverändert lassen** (Prod-Ist, erwartet `1`) | Master-Gate V3-Read + Schatten-Ingest — **NICHT** auf `shadow` |
| `HELMUT_V3_SHADOW_COMPARE` | **nicht setzen** (AUS) | live inert; Vergleich = manueller Dryrun |
| `HELMUT_PROFILE_DB_MODE` | **AUS / nicht gesetzt** | = Profil-Cutover (Read+Write) — nicht im Shadow-Betrieb |
| `HELMUT_V3_MATCHING` / `_LAZY_UNDERSTANDING` / `_OFFICE` | AUS | Shadow-Engines, nicht Teil dieser Freigabe |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | vorhanden (Bestand) | service_role-Zugriff |
| `HELMUT_MAX_LLM_CALLS_PER_DAY` | empfohlen setzen | Kostendeckel (Betriebshygiene) |
| `HELMUT_TENANT_JWT_MODE` / `HELMUT_AUTH_MODE` | unverändert (AUS) | RLS-Bypass via service_role bleibt |

**Zu ändernde Variablen für diese Freigabe: KEINE.** Die Migration ist rein DDL/Seed.

---

## 10. Weiterhin deaktivierte Funktionen und Quellen

- **Berlin/Brandenburg** (alle 28 Kandidaten: BE 15 `kandidat`, BB 13 `kandidat` + 2 `unbesetzt`);
  Landespakete `berlin-basis`/`brandenburg-basis` bleiben `prepared`, 0 Abrufwege, 0 aktiv.
- **Profil-DB-Cutover** (`HELMUT_PROFILE_DB_MODE`) — AUS; Profile weiter aus Blob.
- **Live-Shadow-Vergleich** (`HELMUT_V3_SHADOW_COMPARE`) — nicht verdrahtet; nur manueller Dryrun.
- **Neue relationale Tabellen im Read/Crawl** — dormant; Read/Crawl nutzen weiter Blob/v1Sources.
- **Cutover** (Read-Umschaltung, Cron-Umstellung, Quellenaktivierung) — separate, spätere Freigabe.
- **Matching-/Lazy-Understanding-/Office-Shadow-Engines** — AUS.

---

## 11. Exakte Freigabefrage (Migration + Shadow-Betrieb)

> **Bitte um ausdrückliche Freigabe für ausschließlich die folgenden, rein additiven Schritte:**
>
> 1. Anwenden von `20260713_source_architecture.sql`,
>    `20260713_source_architecture_seed.sql` und `20260716_llm_usage_source_attribution.sql`
>    auf Production (nach Ist-Verifikation V0 + Backup M0).
> 2. Read-only-Verifikation (§6) und manueller `npm run sprint6:dryrun`.
>
> **Ausdrücklich NICHT freigegeben / nicht auszuführen:** jede Änderung an `HELMUT_V3_STORE`
> (insb. **nicht** `=shadow`), `HELMUT_V3_SHADOW_COMPARE`, `HELMUT_PROFILE_DB_MODE`, jede
> Cron-Änderung, jede Berlin/Brandenburg-Aktivierung, jeder Cutover, jeder Code-Deploy.
>
> Der V3-Schatten-Ingest läuft bereits (Prod `HELMUT_V3_STORE` aktiv); es ist **kein Flag zu
> setzen**. Bei jeder Stop-Bedingung (§7): sofort Rollback (§4).

**Empfehlung: GO** für die additive Migration (M0–M5), **STOP** für die ursprünglich
dokumentierten Flag-Schritte. Der Preflight ist damit abgeschlossen; die Ausführung wartet auf
ausdrückliche Freigabe.
