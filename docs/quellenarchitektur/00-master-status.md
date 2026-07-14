# MASTER-STATUS — Helmut Quellenarchitektur-Migration

**Dies ist der einzige aktuelle Gesamtstatus.** Ältere Abschlussberichte (Doku 20-27)
bleiben als Detailnachweise gültig, sind aber KEINE Statusquelle mehr; bei Widerspruch
gilt diese Datei. Letzte Aktualisierung: 2026-07-14, Phase 2 (Deployment-Vorprüfung).

## Phase-Status
- **Phase 1 (Preview-Abnahme): BESTANDEN** — Gründer bestätigt „Preview grün"
  (Partei/Wahlkreis/Ausschüsse leer = fachlich korrekt; Dynamiken/Lage/Helmut/Büro/Admin ok).
- **Phase 2 (Deployment-Vorprüfung): ABGESCHLOSSEN, 0 Blocker** — 4 parallele Prüfblöcke:
  (a) git: 61 Commits ahead/0 behind, fast-forward-fähig, keine Konflikte, vercel.json
  (inkl. Crons) byte-identisch zu main, keine gelöschten Dateien;
  (b) Testsuite: 57/58 Suiten grün, 2.565 Assertions (nur smoke-test = Live-URL, Sandbox-Netz);
  (c) Production-DB read-only: Mengen-Snapshot 5140/247/7/86/1, BE/BB-Wege alle
  needs_review+manual, BE/BB-Pakete prepared, gate_shadow_events=0, decision_level vorhanden;
  (d) Guard-Disziplin: alle 7 Flags Default off/alt mit Code-Zitat, kein Flag-Setzen im
  Runtime-Code, keine Cutover-Logik, Crawl nutzt v1Sources.
- **Phase 3 (Production-Deployment): AUSGEFÜHRT 2026-07-14** — PR
  [#75](https://github.com/ernisch/helmut-pilot/pull/75) gemerged (Freigabe des Gründers nach
  fail-closed-Ersatzprüfung der Env-Variablen, da Dashboard-Zugriff nicht verfügbar).
  Production-Commit: **`9685a0b`** (Merge von `d1dd5a4`), Deployment
  `dpl_2b83EUNtUhuzvA5pfCLdP6GrUY6K`, Alias `helmut-pilot.vercel.app`.
  Vorheriger Production-Commit (Rollback-Ziel): `74ae2a6`.
  Post-Deploy verifiziert: App-Shell 200 mit `client.js?v=9685a0bf`; `/api/app/start`
  unauthentifiziert sauberes 401 (kein 5xx); 0 Runtime-Fehler seit Deploy; DB-Snapshot
  byte-identisch vor/nach Merge (5140/247/7/86/1, document_findings=0, gate_shadow_events=0,
  llm_usage=0); BE/BB-Wege/Pakete unverändert (0 Abweichungen); keine Migration ausgeführt;
  Env-Variablen (inkl. Tageslimit) durch den Merge strukturell unberührbar.
- **Phase A (Reiter-Umbenennung): IM PREVIEW** — der sichtbare Produktreiter „Helmut" heißt
  jetzt „Briefing" (nur Labels: Haupt-/Mobilnavigation, Sprungbutton „Im Briefing öffnen",
  Bereichs-ARIA). Marke/Persona bleiben Helmut; interne View-IDs (historisch: "briefing"=Lage,
  "helmut"=Briefing-Reiter), API-Verträge, gespeicherte Briefings unverändert.
  Test: briefing-tab-rename (20 Assertions) + Gesamtsuite 58/58 grün.
- **Nächstes Gate: „Briefing Preview prüfen"** — danach gemäß Megaprompt weiter
  (Shadow-Flags + Tageslimit erst nach separatem Go).

## Was Production AKTUELL nutzt (main)
- Alter hartcodierter Quellenkatalog (`v1Sources`) als aktive Quellenwahrheit.
- Kein Understanding-Gate (Flag nicht gesetzt/off), kein PARDOK-Dispatch, kein neues
  sichtbares Scoring, keine Landesquellen (Berlin/Brandenburg), keine Cheap-Triage.
- Understanding-Tagesdeckel `HELMUT_MAX_LLM_CALLS_PER_DAY`: aktiv und endlich
  (real ~15 Understanding/Tag ausgeführt, ~78/Tag gedeckelt); exakter Wert nur im
  Vercel-Dashboard lesbar (kein Env-Getter im MCP).
- Bekannter vorbestehender Prod-Fehler: `parseJsonText` SyntaxError bei rohen
  Steuerzeichen in LLM-JSON (Büro-Entwurf) — **im Branch behoben** (`14d4e4b`).

## In Production bereits ANGEWENDETE Migrationen (funktional verifiziert)
`20260713_source_architecture` (publishers/retrieval_paths/source_packages/…),
`20260714_ko_classification` (8 KO-Spalten + Index), `20260715_dedup_findings`
(document_findings), `20260716_gate_shadow_telemetry` (gate_shadow_events),
`20260716_llm_usage_source_attribution` — plus die Basis-Migrationen 20260711/12.
**Registry-Abweichung:** Einträge in `supabase_migrations.schema_migrations` teils
8-stellig/fehlend (direkt via MCP angewendet). Ungefährlich, da ALLE 9 Migrationen
idempotent sind und jede eine `*_rollback.sql` besitzt (Preflight 51 PASS). Bereinigung
= eigene, freigabepflichtige Stufe vor einem künftigen CLI-`db push`.

## Feature-Branch (Deployment-Kandidat)
- Branch: `claude/helmut-source-architecture-ruhyvb`
- Kandidat-Commit: **`14d4e4b`** (Nachfolger des Abschluss-Commits `ae7a5e0`;
  zusätzlich nur der parseJsonText-Fix + Tests + diese Statusdatei).
- Alle neuen Funktionen sind hinter Guards mit Default **off**:
  `HELMUT_UNDERSTANDING_GATE` (off/shadow/on — on nicht scharf),
  `HELMUT_PARDOK_DISPATCH` (off/shadow — on nicht verdrahtet), Scoring-Leerzustände
  (`HELMUT_SCORING_MODE`), Profile-DB-Mode. Kein Quellen-Cutover im Branch: der
  Crawl nutzt weiterhin den Alt-Katalog; die relationale Bibliothek ist Shadow-Struktur.
- Berlin/Brandenburg: Wege `manual`/`needs_review`, Pakete `prepared`, 0 aktive Landeswege.

## Was SHADOW laufen KANN (nach Freigabe, noch nichts aktiv)
- Gate-Shadow (Telemetrie in `gate_shadow_events`, blockiert nichts).
- PARDOK-Shadow (isoliert, `items:[]`-Invariante, nichts in raw_documents/KOs).

## Was weiterhin AUS ist (verbindlich, bis eigene Freigabe)
Gate on · Cheap-Triage · sichtbares neues Scoring · Berlin-/Brandenburg-Aktivierung ·
relationale Quellen-Cutover-Logik · Tageslimit-Änderung · Cron-Änderungen.

## Nächste benötigte Freigabe
**Phase 1:** manuelle Preview-Abnahme (Checkliste unten) → Antwort „Preview grün".
Danach: „Go Deployment" (Production-Deployment, alle Guards off) → „Go Shadow und
Tageslimit" → Shadow-Messung → relationaler Quellenvergleich → „Go Cutover".

## Preview-Checkliste Phase 1 (manuell, wegen Vercel-SSO)
Stabile Branch-URL: `https://helmut-pilot-git-claude-helmut-source-architecture-ruhyvb-nohut.vercel.app`
1. Login + Profil Cem wird erkannt.
2. Lage lädt Inhalte (Briefing-Text, keine Leere-Fehlanzeige).
3. Radar lädt; „Neue Dynamiken" gefüllt (Anzahl je nach Tagesfenster, aktuell erwartet ~6-7).
4. Radar „Partei" leer („Keine neuen relevanten Parteisignale") — fachlich korrekt.
5. Radar „Wahlkreis" leer — Bovenschulte-Vorgang erscheint NICHT mehr.
6. Radar „Ausschüsse" leer — die früheren 13 BMAS-/Themen-Treffer erscheinen NICHT mehr.
7. „Alle relevanten Artikel": Filter „Offizielle Quellen" zeigt NUR bundesregierung.de/
   bmas.de/bundesrat.de o. ä. — KEINE FAZ/Nordkurier/Jüdische Allgemeine/verbaende.com.
8. Helmut + Büro laden (Einschätzung + Entwurfsfunktion sichtbar).
9. Admin erreichbar (Watchdog/Quellenarchitektur-Ansicht rendert).
10. Browser-Konsole ohne neue Fehler (F12 → Console).
