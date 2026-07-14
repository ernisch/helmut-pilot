# MASTER-STATUS — Helmut Quellenarchitektur-Migration

**Dies ist die EINZIGE aktuelle Statuswahrheit.** Alle älteren Status-/Abschlussberichte —
insbesondere Doku 20–27 und frühere Master-Status-Fassungen — sind **ÜBERHOLT** und dürfen
nicht mehr als aktueller Stand zitiert werden; sie bleiben historische Detailnachweise.
Konsolidiert am **2026-07-14 (abends, nach Diagnose- und Shadow-Deployment + Quellenmodus-Bau)**
aus Repository, Production-DB (read-only), Vercel-API und Thread-Verlauf.

## 1) Deployments & Commits (verifiziert via Vercel-API + git)
| Was | Wert |
|---|---|
| Production-Commit (main) | **`35384f5`** — Merge PR #78 (Gate-Shadow + PARDOK-Shadow per Datei-Flag) |
| Production-Deployment | `dpl_5FTcCGDQbxNb4yKhB8X55hT9rRNq`, READY, `helmut-pilot.vercel.app` |
| Rollback-Kette | `7a27f5b` (PR #77 Admin-Diagnose, `dpl_3wuS8ivWMrTHpEg4npZZChZsauRx`) → `6539fbf` (PR #76 Briefing-Reiter) → `9685a0b` (PR #75 Quellenarchitektur, Guards off) → `74ae2a6` (Alt-Stand) |
| Feature-Branch | `claude/helmut-source-architecture-ruhyvb` (main + Quellenmodus/Cutover-Bau, ungemergt) |
| Crons (vercel.json, unverändert) | crawl 04:00+20:00 · morning-briefing 05:00 · understanding 05:30+21:30 · health 06:00 · lage-check 10:00 · pipeline 16:00 · lage-briefing 05:45 (UTC) |

**Live in Production:** Quellenarchitektur-Codebasis (Quellen-Guards off), evidenzbasierte
Radar-Beleglogik, ai.js-Parserfix, Reiter „Briefing", **Admin-Konfigurations-Diagnose**
(System & Sicherheit, 7 Variablen mit Quelle Env/Datei/Default), **Gate-Shadow + PARDOK-Shadow**
(seit `35384f5`, ~17:57 UTC, per `helmut-flags.json`).

## 2) Die 7 Helmut-Konfigurationen (Stand nach PR #78)
Präzedenz: **Vercel-Env > helmut-flags.json (Datei-Flag) > Code-Default.** Eine gesetzte
Env-Variable überstimmt die Datei immer (Betreiber-Kontrolle; Rollback ohne Deployment möglich).

| Variable | Env (Production) | Datei-Flag | wirksam |
|---|---|---|---|
| HELMUT_UNDERSTANDING_GATE | nicht gesetzt (erwartet, Prüfung via Live-Diagnose) | **shadow** | **shadow** — blockiert NICHTS, schreibt nur Telemetrie |
| HELMUT_PARDOK_DISPATCH | nicht gesetzt (erwartet) | **shadow** | **shadow** — konstruktionsbedingt wirkungslos (0 structured_download-Quellen im Live-Katalog) |
| HELMUT_MAX_LLM_CALLS_PER_DAY | **gesetzt** (Preview zeigte 20; Prod-Wert via Live-Diagnose ablesen) | bewusst NICHT dateisteuerbar | endlicher Deckel aktiv, **unverändert** |
| HELMUT_V3_STORE | gesetzt = 1 (Verhalten + Preview) | — | an (bleibt an) |
| HELMUT_SCORING_MODE | nicht gesetzt | — | off (Alt-Ranking byte-identisch) |
| HELMUT_V3_SHADOW_COMPARE | nicht gesetzt | — | aus |
| HELMUT_PROFILE_DB_MODE | nicht gesetzt | — | aus (Blob-only) |
| (neu) HELMUT_SOURCE_MODE | nicht gesetzt | **nicht gesetzt** | **off** — alter Katalog ist aktive Quellenwahrheit |

**Einziger offener Konfigurationspunkt:** exakter Production-Wert des Tageslimits. Er ist
jetzt direkt in der Live-Diagnose ablesbar (Admin → System & Sicherheit). Erst nach dieser
Ablesung + Dokumentation als Rollback-Wert darf auf 150 erhöht werden (Vercel-Dashboard;
Grenzen: ~100 Understanding + Spielraum, ~$8–10/Monat, Stop >$0,50/Tag, NIE unbegrenzt).

## 3) Gate-Shadow + PARDOK-Shadow (Phase 4 — AKTIV seit 35384f5)
- Gate-Shadow: berechnet je Understanding-Cluster die Entscheidung, **blockiert nichts**
  (Integrationstest: off/shadow/on identische Call-Zahlen) und schreibt je Dokument eine
  Zeile nach `gate_shadow_events` (nur Signale/IDs, kein Volltext; doppelt fail-safe).
- PARDOK-Shadow: nur relevant für `structured_download`-Quellen — davon sind **0** im
  aktiven Katalog. Kein Fetch, kein Write, kein sichtbares Item, bis BE/BB (eigene
  Freigabe) Wege in den Plan brächte. Shadow-Datei-Ablage zusätzlich gegen read-only-FS
  gehärtet (Fehler brechen den Crawl nie).
- **Messfenster:** Crawl-Cron 20:00 UTC (PARDOK-Negativ- und Fehlerprüfung), Understanding-Cron
  21:30 UTC (`gate_shadow_events` muss wachsen, Understanding-Zahl darf nicht sinken).
  Selbst-Check-ins sind für 20:12 und 21:45 UTC geplant; Ergebnisse werden hier ergänzt.
- Offline-Messung (bereits erbracht, Doku 21): Gate-Kalibrierung gegen echte Produktionsdaten,
  107→0 kritische Fehlentscheidungen, amtliche Dokumente nie geparkt, kuratierte Feeds nie geparkt.
- **Historischer Replay (P6, 2026-07-14 ~18:50 UTC, `scripts/gate-shadow-replay.js`):** exakter
  Production-Shadow-Pfad über 2064 echte Dokumente (7 Tage) → 206 Cluster: 31 verstehen /
  88 zurückstellen / 87 parken (Dok-Ebene: 948/652/464). ALLE Prüfpunkte grün: nichts
  blockiert, keine amtliche Quelle geparkt, kuratierte nie geparkt, regionale Quellen nicht
  benachteiligt (Park-Rate 0% vs. 40,9% überregionale Medien; n regional=1 — Regionalwege
  liefern derzeit wenig), keine BE/BB-Dokumente im Bestand, Telemetrie wohlgeformt ohne
  Volltext, 0 LLM-Kosten. Ersparnispotenzial bei späterem Gate-on: ~54% der Dokumente.
- **Isolierter PARDOK-Shadow-Lauf (P6):** Parser über Gold-Fixtures im Shadow-Modus —
  be-plenum 8/8 geparst (8 externe IDs), bb-plenum 6/7 (1 bewusst defekter Datensatz),
  0 Pipeline-Items, keine Fehlerseite, 6–10 ms, ~5 MB Heap, isolierte Ablage ok.
- **gate_shadow_events = 0 (Stand 18:31 UTC) — Ursache eindeutig:** der Understanding-Cron
  ist seit der Shadow-Aktivierung (17:57 UTC) schlicht noch nicht gelaufen (nächster Lauf
  21:30 UTC). Kosten heute $0,07 / 36 billable Calls (Limit-fern); Understanding heute 15
  (Normalbereich). Live-Bestätigung der Event-Schreibung: Wake-up 21:45 UTC.
- **Rollback:** `helmut-flags.json` auf `off` + Deploy, ODER Vercel-Env `off` + Redeploy
  (überstimmt sofort), ODER Instant Rollback auf `7a27f5b`.

## 4) Quellenmodus (P7 — gebaut; **shadow AKTIV seit `0159ae6`**, 2026-07-14 ~19:09 UTC)
`HELMUT_SOURCE_MODE` (off/shadow/on, via Flag-Resolver; `source-mode.js`):
- Ausgangswert (dokumentierter Rollback): **nicht gesetzt = off** (weder Vercel-Env noch
  Datei). Rollback: Flag-Zeile entfernen/`off` + Deploy oder Vercel-Env `off` + Redeploy.
- **shadow (AKTIV, Gründer-Freigabe):** alter Katalog bleibt die sichtbare Quellenwahrheit
  (Quellenliste byte-identisch); nach jedem echten Crawl misst ein fail-safe Block den
  relationalen Plan gegen die REALEN Ergebnisse desselben Laufs (keine Extra-Fetches,
  kein LLM, $0, kein Nutzerpfad-Write) → Console-Log `[source-mode:shadow]` + kompakter
  Auth-Store-Eintrag `sourceModeShadowLastRun` (Admin-Panel). Erster Messlauf: Crawl-Cron
  20:00 UTC; Auswertung per Wake-up 20:12 UTC.
- **on (= QUELLEN-CUTOVER, nicht aktiviert):** relationale DB (publishers/retrieval_paths/
  source_packages/package_paths) wird aktive Quellenwahrheit; alter Katalog bleibt Fallback
  (Ladefehler/leerer Plan). Profile werden über Pakete versorgt (Resolver + Referenzzählung);
  jeder Abrufweg läuft global genau EINMAL; ohne aktivierungsberechtigte Profile nur
  always_on-Kernwege; BE/BB hart gesperrt; dev_only/pausierte/Orphans nie; defekte Wege ohne
  Abruf; DIP unverändert eigener API-Pfad; Dedup-Schreibpfad (unten) aktiv.

## 5) Alter vs. relationaler Plan (P8 — realer Vergleich, Production-Snapshot 2026-07-14)
- Wege gesamt 163 · **relational aktiv 138** · defekt 6 · ausgeschlossen 19 (18 BE/BB + DIP separat)
- Alt-Plan 143 geteilte Quellen; **Ertragsabdeckung 100%**: alle Altquellen mit realem
  30-Tage-Ertrag (4736 Dokumente, 866 KO-Kandidaten) sind im relationalen Plan abgedeckt;
  **0 fehlende Wege mit Ertrag.** Die 6 „fehlenden" Altquellen sind exakt die 6 defekten
  (bot-gesperrten) Wege mit 0 Ertrag (bundestag/bundesregierung/die-linke/linksfraktion/
  ausschuss-arbeit-soziales/dgb) — Ersatz über Google-News-Wege vorhanden und aktiv.
- Cem-Pakete: bund-basis 51 aktiv · arbeit-und-soziales 82 · regional-niedersachsen 4 ·
  profil-cem-ince 1 · die-linke-bund 1 (nach Paketfix, s. u.). Aktive Profile: 3
  (cem-ince + 2 Testprofile james-brown/angela-merkel), aktive Pakete: 5.
- **Behobener Paketfehler (sicher, additiv):** die-linke-bund enthielt nur die 2 defekten
  Original-RSS-Wege → `rp-fraction-linke` (funktionierender Fraktions-Suchweg) zusätzlich
  zugeordnet (Seed-Regel + 1 additiver `package_paths`-Link in Production;
  Rollback: `DELETE FROM package_paths WHERE package_id='pkg-die-linke-bund' AND retrieval_path_id='rp-fraction-linke'`).
- Live-Fetch aus der Arbeitsumgebung ist netzwerkseitig gesperrt; der Ausführungsnachweis
  läuft ehrlich über die echten 30-Tage-Erträge (identische Abruf-URLs via legacy_source_id).

## 6) Dedup + Fundstellen (P9 — Schreibpfad gebaut, Cutover-only; Messung real)
- Reale 14-Tage-Messung (5242 Docs): URL-Duplikate ≈ 0 (content_hash-Dedup wirkt);
  **191 Titel-Duplikatgruppen (308 Überschuss-Docs ≈ 5,9%)**, 21 Gruppen über mehrere
  Abrufwege; nur **4 Gruppen** erzeugten doppelte KOs (vorgang-Dedup fängt das meiste).
- Cutover-Schreibpfad `persistRawDocumentsDeduped` (NUR Modus on): 1 Artikel über n Wege →
  1 raw_document + n `document_findings`; Bestands-Match über content_fingerprint/
  canonical_target_url; finding_count-Pflege; Google News bleibt Suchweg (Herausgeber-
  Domain trägt Identität, Proxy-URL bleibt Fundstelle); unterschiedliche Vorgänge werden
  nie zusammengelegt (Titel-Ähnlichkeit nur je Herausgeber + Datumsfenster).
- In Production heute: `document_findings` 0 Zeilen, Fingerprint-Spalten unbefüllt — Befüllung
  beginnt erst mit dem Cutover.

## 7) Datenbank-Ist (Production, read-only 2026-07-14 ~17:35 UTC)
raw_documents **5242** · knowledge_objects **247** · briefings **7** · decisions **86** ·
mandate_profiles **1** · ko_document_links **1147** · gate_shadow_events **0** (Wachstum ab
21:30-Cron erwartet) · document_findings **0** · BE/BB-Pakete **prepared**, 19 Wege
needs_review+manual · Migration-Registry 12 Einträge, **keine Migration offen**; einzige
Datenänderung seit letzter Konsolidierung: der additive package_paths-Link (§5).

## 8) Verbindlich AUS (bis je eigene Freigabe)
Quellenmodus **on** (= Cutover, einzige noch offene Freigabe) · Gate **on** · Cheap-Triage ·
Scoring **on** · Berlin-/Brandenburg-Aktivierung · Bot-Quellen · Datenlöschungen ·
Cron-Änderungen · KO-Klassifikations-Backfill.

## 9) CUTOVER-PAKET (P14 — vorbereitet, NICHT ausgeführt)
**Nächstes und einziges offenes Gate: „Go Quellen Cutover?"**
1. **Exakte Änderung:** in `helmut-flags.json` eine Zeile ergänzen: `"HELMUT_SOURCE_MODE": "on"`
   → PR → Merge → Production-Deployment. (Env-Alternative: Vercel-Env `HELMUT_SOURCE_MODE=on`
   + Redeploy — überstimmt die Datei.) Der Feature-Branch enthält den kompletten Code bereits.
2. **Wirkung:** relationale DB = aktive Quellenwahrheit (138 Wege, global je einmal),
   alter Katalog = Fallback; Profile über Pakete; globale Dedup + Fundstellen aktiv;
   BE/BB bleiben gesperrt; Gate bleibt shadow; Scoring bleibt off.
3. **Production-Snapshot davor:** DB-Zählerstand (§7) + `git tag` des Prod-Commits +
   Vercel-Deployment-ID notieren (Instant-Rollback-Ziel).
4. **Erster begrenzter Lauf:** nächster 20:00/04:00-Crawl-Cron beobachten (kein manueller
   Massen-Crawl); Vergleich Dokumentzahl/Quellenabdeckung gegen Vortag.
5. **Smoke:** App-Start/Lage/Radar/Briefing/Büro/Admin unverändert · 0 neue Runtime-Fehler ·
   Admin-Quellenmodus-Panel zeigt on + Plan · raw_documents wachsen weiter (±Normalbereich) ·
   document_findings beginnen zu wachsen · KEINE BE/BB-Inhalte · Cem-Briefing gefüllt.
6. **Cem-Vergleich:** Briefing/Radar vor/nach Cutover — mindestens gleiche Versorgung
   (Referenz: 100% Ertragsabdeckung, §5).
7. **Kostenlimit:** unverändert (Tagesdeckel bleibt; Dedup REDUZIERT Understanding-Nachfrage).
8. **Stop-Bedingungen:** Dokumentzufluss bricht ein (> −50% vs. Vortag) · leere Briefings ·
   BE/BB-Inhalt sichtbar · neue Fehlerrate · Admin zeigt Fallback-Warnung dauerhaft.
9. **Rollback:** `HELMUT_SOURCE_MODE` löschen/`off` (Datei-Deploy oder Env+Redeploy) ODER
   Vercel Instant Rollback aufs Snapshot-Deployment; Daten: neue document_findings sind
   additiv und harmlos (kein Nutzerpfad liest sie vor dem Cutover).

## 10) Testabdeckung
62 Offline-Suiten grün (inkl. neu: flags 26 · source-mode 38 · gate-integration 14 ·
pardok-dispatch/smoke · dedup-findings 39 · admin-config-diagnose 27; ausgenommen wie immer
nur die 2 Live-LLM-Suiten). Adversariale Pflichtfälle abgedeckt: Profil ohne Pflichtpaket,
kein aktives Profil, 100 gleiche Profile, doppelte Wege/URLs, Google-News-Mehrfachfund,
defekte Pflichtquelle, Orphan, Testquelle, Paket pausiert, Profil deaktiviert, BE/BB
versehentlich aktiv (hartes Gate), Gate blockiert im Shadow (nie), PARDOK sichtbar (nie),
Fallback-Versagen (alter Katalog), Tenant-Isolation (322+104+37+70+28+30 Assertions).
